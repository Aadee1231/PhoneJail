import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceMotion, DeviceMotionMeasurement } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import {
  SENSOR_UPDATE_INTERVAL_MS,
  CALIBRATION_SECONDS,
  CALIBRATION_SETTLE_SECONDS,
  SMOOTHING_ALPHA,
  TILT_TRIGGER_DEGREES,
  MOTION_TRIGGER_MPS2,
  TRIGGER_SUSTAIN_MS,
  TILT_RECOVER_DEGREES,
  MOTION_RECOVER_MPS2,
  WARNING_RECOVER_SUSTAIN_MS,
  JAILBREAK_STABILIZE_MS,
  RETURNED_DISPLAY_MS,
  JAILBREAK_HAPTIC_INTERVAL_MS,
  SENSITIVITY_MULTIPLIER,
} from './constants';
import { DebugSnapshot, JailState, SessionRecord, SessionStats, Settings } from './types';

type Vec3 = { x: number; y: number; z: number };

const ZERO_VEC: Vec3 = { x: 0, y: 0, z: 0 };

function magnitude(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize(v: Vec3): Vec3 {
  const m = magnitude(v);
  if (m === 0) return { x: 0, y: 0, z: 1 };
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

/** Angle in degrees between two (assumed unit) vectors. */
function angleBetween(a: Vec3, b: Vec3): number {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  const clamped = Math.min(1, Math.max(-1, dot));
  return (Math.acos(clamped) * 180) / Math.PI;
}

/**
 * Encapsulates the whole "Virtual Jail" motion-detection state machine.
 *
 * Thresholds are multiplied by the sensitivity factor at runtime.
 * Settings are read from a ref so sensor subscription never needs to restart.
 */
export function useJailSession(
  settings: Settings,
  onSessionEnd: (record: SessionRecord) => void
) {
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const [state, setState] = useState<JailState>('idle');
  const [durationMinutes, setDurationMinutes] = useState<number>(15);
  const [calibrationSecondsLeft, setCalibrationSecondsLeft] = useState<number>(CALIBRATION_SECONDS);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [debug, setDebug] = useState<DebugSnapshot>({
    gravity: ZERO_VEC,
    linearAccel: ZERO_VEC,
    tiltDeg: 0,
    tiltSmoothedDeg: 0,
    motionMag: 0,
    motionSmoothedMps2: 0,
    triggerHoldMs: 0,
    recoverHoldMs: 0,
  });
  const [shouldAlarm, setShouldAlarm] = useState(false);
  const [warningDeadline, setWarningDeadline] = useState<number>(0);
  const [stats, setStats] = useState<SessionStats>({
    durationMinutes: 0,
    startTime: null,
    elapsedFocusSeconds: 0,
    warningsCount: 0,
    jailbreakCount: 0,
    status: 'completed',
  });

  // Mutable refs used inside the sensor listener so we always read the
  // latest values without re-subscribing on every state change.
  const stateRef = useRef<JailState>('idle');
  const baselineGravityRef = useRef<Vec3>({ x: 0, y: 0, z: 1 });
  const calibrationSamplesRef = useRef<Vec3[]>([]);
  const smoothedTiltRef = useRef(0);
  const smoothedMotionRef = useRef(0);
  const triggerHoldStartRef = useRef<number | null>(null);
  const recoverHoldStartRef = useRef<number | null>(null);
  const warningDeadlineRef = useRef<number>(0);
  const selectedDurationRef = useRef<number>(15);
  const startTimeRef = useRef<number | null>(null);
  const warningsCountRef = useRef(0);
  const jailbreakCountRef = useRef(0);

  const motionSubRef = useRef<ReturnType<typeof DeviceMotion.addListener> | null>(null);
  const calibrationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hapticIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const returnedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const setJailState = useCallback((next: JailState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const clearAllTimers = useCallback(() => {
    if (calibrationIntervalRef.current) clearInterval(calibrationIntervalRef.current);
    if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
    if (hapticIntervalRef.current) clearInterval(hapticIntervalRef.current);
    calibrationIntervalRef.current = null;
    sessionIntervalRef.current = null;
    hapticIntervalRef.current = null;
  }, []);

  const stopMotionListener = useCallback(() => {
    motionSubRef.current?.remove();
    motionSubRef.current = null;
  }, []);

  const finishSession = useCallback(
    (status: SessionRecord['status'], nextState: JailState) => {
      clearAllTimers();
      stopMotionListener();
      deactivateKeepAwake();
      if (returnedTimeoutRef.current) {
        clearTimeout(returnedTimeoutRef.current);
        returnedTimeoutRef.current = null;
      }

      const startTime = startTimeRef.current ?? Date.now();
      const completedSeconds = Math.max(
        0,
        Math.round((Date.now() - startTime) / 1000)
      );

      const record: SessionRecord = {
        id: String(Date.now()),
        startTime,
        endTime: Date.now(),
        plannedDurationMinutes: selectedDurationRef.current,
        completedDurationSeconds: completedSeconds,
        status,
        warningsCount: warningsCountRef.current,
        jailbreakCount: jailbreakCountRef.current,
      };

      onSessionEnd(record);
      setStats((s) => ({ ...s, status }));
      setShouldAlarm(false);
      setJailState(nextState);
    },
    [clearAllTimers, onSessionEnd, setJailState, stopMotionListener]
  );

  // One-shot haptics and the automatic "returned -> active" timer.
  useEffect(() => {
    const haptics = settingsRef.current.hapticsEnabled;
    if (state === 'warning' && haptics) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    if (state === 'returned') {
      if (haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      returnedTimeoutRef.current = setTimeout(() => {
        setJailState('active');
      }, RETURNED_DISPLAY_MS);
    } else {
      if (returnedTimeoutRef.current) {
        clearTimeout(returnedTimeoutRef.current);
        returnedTimeoutRef.current = null;
      }
    }
    return () => {
      if (returnedTimeoutRef.current) {
        clearTimeout(returnedTimeoutRef.current);
        returnedTimeoutRef.current = null;
      }
    };
  }, [state, setJailState]);

  // Keep the alarm (sound/haptics) flag in sync with jailbreak state.
  useEffect(() => {
    const haptics = settingsRef.current.hapticsEnabled;
    if (state === 'jailbreak') {
      setShouldAlarm(true);
      if (haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      hapticIntervalRef.current = setInterval(() => {
        if (settingsRef.current.hapticsEnabled) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      }, JAILBREAK_HAPTIC_INTERVAL_MS);
    } else {
      setShouldAlarm(false);
      if (hapticIntervalRef.current) {
        clearInterval(hapticIntervalRef.current);
        hapticIntervalRef.current = null;
      }
    }
    return () => {
      if (hapticIntervalRef.current) {
        clearInterval(hapticIntervalRef.current);
        hapticIntervalRef.current = null;
      }
    };
  }, [state]);

  // Track elapsed focus time from the live countdown.
  useEffect(() => {
    if (state === 'active' || state === 'warning' || state === 'jailbreak' || state === 'returned') {
      setStats((s) => ({
        ...s,
        elapsedFocusSeconds: Math.max(0, s.durationMinutes * 60 - remainingSeconds),
      }));
    }
  }, [remainingSeconds, state]);

  const handleMotionSample = useCallback((data: DeviceMotionMeasurement) => {
    const gravity: Vec3 = data.accelerationIncludingGravity ?? ZERO_VEC;
    const linear: Vec3 = data.acceleration ?? ZERO_VEC;
    const now = Date.now();
    const currentState = stateRef.current;
    const s = settingsRef.current;

    if (currentState === 'calibrating') {
      calibrationSamplesRef.current.push(gravity);
      return;
    }

    if (currentState !== 'active' && currentState !== 'warning' && currentState !== 'jailbreak') {
      return;
    }

    const mult = SENSITIVITY_MULTIPLIER[s.sensitivity];
    const normalizedGravity = normalize(gravity);
    const tiltDeg = angleBetween(normalizedGravity, baselineGravityRef.current);
    const motionMag = magnitude(linear);

    smoothedTiltRef.current =
      SMOOTHING_ALPHA * tiltDeg + (1 - SMOOTHING_ALPHA) * smoothedTiltRef.current;
    smoothedMotionRef.current =
      SMOOTHING_ALPHA * motionMag + (1 - SMOOTHING_ALPHA) * smoothedMotionRef.current;

    const smoothedTilt = smoothedTiltRef.current;
    const smoothedMotion = smoothedMotionRef.current;

    const isDisturbed =
      smoothedTilt > TILT_TRIGGER_DEGREES * mult ||
      smoothedMotion > MOTION_TRIGGER_MPS2 * mult;
    const isRecovered =
      smoothedTilt < TILT_RECOVER_DEGREES * mult &&
      smoothedMotion < MOTION_RECOVER_MPS2 * mult;

    if (currentState === 'active') {
      if (isDisturbed) {
        if (triggerHoldStartRef.current === null) triggerHoldStartRef.current = now;
        else if (now - triggerHoldStartRef.current >= TRIGGER_SUSTAIN_MS) {
          triggerHoldStartRef.current = null;
          recoverHoldStartRef.current = null;
          warningDeadlineRef.current = now + s.warningGraceMs;
          setWarningDeadline(warningDeadlineRef.current);
          warningsCountRef.current += 1;
          setStats((prev) => ({ ...prev, warningsCount: warningsCountRef.current }));
          setJailState('warning');
        }
      } else {
        triggerHoldStartRef.current = null;
      }
    } else if (currentState === 'warning') {
      if (isRecovered) {
        if (recoverHoldStartRef.current === null) recoverHoldStartRef.current = now;
        else if (now - recoverHoldStartRef.current >= WARNING_RECOVER_SUSTAIN_MS) {
          recoverHoldStartRef.current = null;
          triggerHoldStartRef.current = null;
          setJailState('returned');
        }
      } else {
        recoverHoldStartRef.current = null;
      }

      if (stateRef.current === 'warning' && now >= warningDeadlineRef.current) {
        recoverHoldStartRef.current = null;
        jailbreakCountRef.current += 1;
        setStats((prev) => ({ ...prev, jailbreakCount: jailbreakCountRef.current }));
        setJailState('jailbreak');
      }
    } else if (currentState === 'jailbreak') {
      if (isRecovered) {
        if (recoverHoldStartRef.current === null) recoverHoldStartRef.current = now;
        else if (now - recoverHoldStartRef.current >= JAILBREAK_STABILIZE_MS) {
          recoverHoldStartRef.current = null;
          triggerHoldStartRef.current = null;
          setJailState('returned');
        }
      } else {
        recoverHoldStartRef.current = null;
      }
    }

    const holdRef =
      currentState === 'active' ? triggerHoldStartRef.current : recoverHoldStartRef.current;

    setDebug({
      gravity,
      linearAccel: linear,
      tiltDeg,
      tiltSmoothedDeg: smoothedTilt,
      motionMag,
      motionSmoothedMps2: smoothedMotion,
      triggerHoldMs: currentState === 'active' && triggerHoldStartRef.current ? now - triggerHoldStartRef.current : 0,
      recoverHoldMs:
        currentState !== 'active' && recoverHoldStartRef.current ? now - recoverHoldStartRef.current : 0,
    });
  }, [setJailState]);

  // Hard mode: watch for jailbreak and immediately fail the session.
  useEffect(() => {
    if (state === 'jailbreak' && settingsRef.current.hardMode) {
      finishSession('failed', 'failed');
    }
  }, [state, finishSession]);

  const finishCalibration = useCallback(() => {
    const samples = calibrationSamplesRef.current;
    const settleCount = Math.min(
      samples.length,
      Math.round((CALIBRATION_SETTLE_SECONDS / CALIBRATION_SECONDS) * samples.length) || samples.length
    );
    const settled = samples.slice(-settleCount);
    let avg: Vec3 = { x: 0, y: 0, z: 0 };
    if (settled.length > 0) {
      avg = settled.reduce(
        (acc, s) => ({ x: acc.x + s.x, y: acc.y + s.y, z: acc.z + s.z }),
        { x: 0, y: 0, z: 0 }
      );
      avg = { x: avg.x / settled.length, y: avg.y / settled.length, z: avg.z / settled.length };
    }
    baselineGravityRef.current = normalize(magnitude(avg) === 0 ? { x: 0, y: 0, z: 1 } : avg);
    calibrationSamplesRef.current = [];
    smoothedTiltRef.current = 0;
    smoothedMotionRef.current = 0;
    triggerHoldStartRef.current = null;
    recoverHoldStartRef.current = null;

    const totalSeconds = selectedDurationRef.current * 60;
    setRemainingSeconds(totalSeconds);
    const start = Date.now();
    startTimeRef.current = start;
    setStats((s) => ({ ...s, startTime: start, elapsedFocusSeconds: 0 }));
    setJailState('active');

    sessionIntervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 0) return 0;
        const next = prev - 1;
        if (next === 0) {
          // Timer completed normally.
          if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
          sessionIntervalRef.current = null;
          stopMotionListener();
          deactivateKeepAwake();
          finishSession('completed', 'completed');
        }
        return next;
      });
    }, 1000);
  }, [setJailState, stopMotionListener, finishSession]);

  const startJail = useCallback(async (overrideMinutes?: number) => {
    clearAllTimers();
    calibrationSamplesRef.current = [];
    const chosen = overrideMinutes ?? durationMinutes;
    selectedDurationRef.current = chosen;
    startTimeRef.current = null;
    warningsCountRef.current = 0;
    jailbreakCountRef.current = 0;
    setStats({
      durationMinutes: chosen,
      startTime: null,
      elapsedFocusSeconds: 0,
      warningsCount: 0,
      jailbreakCount: 0,
      status: 'completed',
    });
    setCalibrationSecondsLeft(CALIBRATION_SECONDS);
    setJailState('calibrating');
    await activateKeepAwakeAsync();

    await DeviceMotion.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);
    stopMotionListener();
    motionSubRef.current = DeviceMotion.addListener(handleMotionSample);

    calibrationIntervalRef.current = setInterval(() => {
      setCalibrationSecondsLeft((prev) => {
        if (prev <= 1) {
          if (calibrationIntervalRef.current) clearInterval(calibrationIntervalRef.current);
          calibrationIntervalRef.current = null;
          finishCalibration();
          return 0;
        }
        return prev - 1;
      });
      if (settingsRef.current.hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }, 1000);
  }, [durationMinutes, finishCalibration, handleMotionSample, setJailState, stopMotionListener, clearAllTimers]);

  const endJail = useCallback(() => {
    finishSession('ended-early', 'completed');
  }, [finishSession]);

  const dismissEnd = useCallback(() => {
    setShouldAlarm(false);
    setJailState('idle');
    setRemainingSeconds(0);
    setCalibrationSecondsLeft(CALIBRATION_SECONDS);
  }, [setJailState]);

  useEffect(() => {
    return () => {
      clearAllTimers();
      stopMotionListener();
      deactivateKeepAwake();
      if (returnedTimeoutRef.current) clearTimeout(returnedTimeoutRef.current);
    };
  }, [clearAllTimers, stopMotionListener]);

  return {
    state,
    durationMinutes,
    setDurationMinutes,
    calibrationSecondsLeft,
    remainingSeconds,
    debug,
    shouldAlarm,
    warningDeadline,
    stats,
    startJail,
    endJail,
    dismissEnd,
  };
}
