import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceMotion, DeviceMotionMeasurement } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import {
  SENSOR_UPDATE_INTERVAL_MS,
  PLACEMENT_FLAT_MIN_FRACTION,
  PLACEMENT_MOTION_MAX_MPS2,
  PLACEMENT_STABILIZE_MS,
  LOCK_DISPLAY_MS,
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
  MAX_STRIKES,
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
 * The "Virtual Jail" session state machine.
 *
 * Lifecycle: idle -> awaiting-placement (user physically puts the phone
 * face-down inside the AR jail) -> locking ("JAIL LOCKED") -> active ->
 * warning/jailbreak/returned loops -> completed | failed.
 *
 * Movement thresholds are multiplied by the sensitivity factor at runtime.
 * Settings are read from a ref so the sensor subscription never restarts.
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
  const placementSamplesRef = useRef<Vec3[]>([]);
  const placementHoldStartRef = useRef<number | null>(null);
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
  const sessionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hapticIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const returnedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const setJailState = useCallback((next: JailState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const clearAllTimers = useCallback(() => {
    if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
    if (hapticIntervalRef.current) clearInterval(hapticIntervalRef.current);
    if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
    sessionIntervalRef.current = null;
    hapticIntervalRef.current = null;
    lockTimeoutRef.current = null;
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
      const completedSeconds = startTimeRef.current
        ? Math.max(0, Math.round((Date.now() - startTime) / 1000))
        : 0;

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
    if (state === 'locking' && haptics) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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

  // Strike system: each full jailbreak is a strike; reaching the limit
  // (1 in hard mode) immediately fails the session.
  useEffect(() => {
    if (state === 'jailbreak') {
      const maxStrikes = settingsRef.current.hardMode ? 1 : MAX_STRIKES;
      if (jailbreakCountRef.current >= maxStrikes) {
        finishSession('failed', 'failed');
      }
    }
  }, [state, finishSession]);

  // Track elapsed focus time from the live countdown.
  useEffect(() => {
    if (state === 'active' || state === 'warning' || state === 'jailbreak' || state === 'returned') {
      setStats((s) => ({
        ...s,
        elapsedFocusSeconds: Math.max(0, s.durationMinutes * 60 - remainingSeconds),
      }));
    }
  }, [remainingSeconds, state]);

  const beginActiveSession = useCallback(() => {
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
          if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
          sessionIntervalRef.current = null;
          finishSession('completed', 'completed');
        }
        return next;
      });
    }, 1000);
  }, [setJailState, finishSession]);

  /**
   * Called from the motion listener once the phone has been flat + stationary
   * long enough while awaiting placement. Captures the resting baseline from
   * the settled samples, shows "JAIL LOCKED", then starts the timer.
   */
  const lockJail = useCallback(() => {
    const samples = placementSamplesRef.current;
    let avg: Vec3 = { x: 0, y: 0, z: 0 };
    if (samples.length > 0) {
      avg = samples.reduce(
        (acc, s) => ({ x: acc.x + s.x, y: acc.y + s.y, z: acc.z + s.z }),
        { x: 0, y: 0, z: 0 }
      );
      avg = { x: avg.x / samples.length, y: avg.y / samples.length, z: avg.z / samples.length };
    }
    baselineGravityRef.current = normalize(magnitude(avg) === 0 ? { x: 0, y: 0, z: 1 } : avg);
    placementSamplesRef.current = [];
    smoothedTiltRef.current = 0;
    smoothedMotionRef.current = 0;
    triggerHoldStartRef.current = null;
    recoverHoldStartRef.current = null;

    setJailState('locking');
    lockTimeoutRef.current = setTimeout(() => {
      lockTimeoutRef.current = null;
      beginActiveSession();
    }, LOCK_DISPLAY_MS);
  }, [setJailState, beginActiveSession]);

  const lockJailRef = useRef(lockJail);
  useEffect(() => {
    lockJailRef.current = lockJail;
  }, [lockJail]);

  const handleMotionSample = useCallback((data: DeviceMotionMeasurement) => {
    const gravity: Vec3 = data.accelerationIncludingGravity ?? ZERO_VEC;
    const linear: Vec3 = data.acceleration ?? ZERO_VEC;
    const now = Date.now();
    const currentState = stateRef.current;
    const s = settingsRef.current;

    if (currentState === 'awaiting-placement') {
      // Waiting for the phone to be physically placed inside the jail:
      // approximately flat (face-down/up) and stationary for a hold period.
      const gravMag = magnitude(gravity);
      const flatFraction = gravMag > 0 ? Math.abs(gravity.z) / gravMag : 0;
      const motionMag = magnitude(linear);
      smoothedMotionRef.current =
        SMOOTHING_ALPHA * motionMag + (1 - SMOOTHING_ALPHA) * smoothedMotionRef.current;

      const isPlaced =
        flatFraction >= PLACEMENT_FLAT_MIN_FRACTION &&
        smoothedMotionRef.current < PLACEMENT_MOTION_MAX_MPS2 &&
        gravMag > 1;

      if (isPlaced) {
        placementSamplesRef.current.push(gravity);
        // Keep only a recent window of samples for the baseline.
        if (placementSamplesRef.current.length > 40) placementSamplesRef.current.shift();
        if (placementHoldStartRef.current === null) placementHoldStartRef.current = now;
        else if (now - placementHoldStartRef.current >= PLACEMENT_STABILIZE_MS) {
          placementHoldStartRef.current = null;
          lockJailRef.current();
        }
      } else {
        placementHoldStartRef.current = null;
        placementSamplesRef.current = [];
      }

      setDebug({
        gravity,
        linearAccel: linear,
        tiltDeg: 0,
        tiltSmoothedDeg: 0,
        motionMag,
        motionSmoothedMps2: smoothedMotionRef.current,
        triggerHoldMs: placementHoldStartRef.current ? now - placementHoldStartRef.current : 0,
        recoverHoldMs: 0,
      });
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

  /**
   * Starts a session in the awaiting-placement state. The timer does NOT
   * start here — it starts only after the phone is detected face-down and
   * stationary inside the jail (see lockJail / beginActiveSession).
   */
  const startJail = useCallback(async (overrideMinutes?: number) => {
    clearAllTimers();
    placementSamplesRef.current = [];
    placementHoldStartRef.current = null;
    smoothedMotionRef.current = 0;
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
    setJailState('awaiting-placement');
    await activateKeepAwakeAsync();

    await DeviceMotion.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);
    stopMotionListener();
    motionSubRef.current = DeviceMotion.addListener(handleMotionSample);
  }, [durationMinutes, handleMotionSample, setJailState, stopMotionListener, clearAllTimers]);

  const endJail = useCallback(() => {
    finishSession('ended-early', 'completed');
  }, [finishSession]);

  /** Abort before the jail ever locked (no timer ran, nothing to record). */
  const cancelPlacement = useCallback(() => {
    clearAllTimers();
    stopMotionListener();
    deactivateKeepAwake();
    placementHoldStartRef.current = null;
    placementSamplesRef.current = [];
    setJailState('idle');
  }, [clearAllTimers, stopMotionListener, setJailState]);

  const dismissEnd = useCallback(() => {
    setShouldAlarm(false);
    setJailState('idle');
    setRemainingSeconds(0);
  }, [setJailState]);

  useEffect(() => {
    return () => {
      clearAllTimers();
      stopMotionListener();
      deactivateKeepAwake();
      if (returnedTimeoutRef.current) clearTimeout(returnedTimeoutRef.current);
    };
  }, [clearAllTimers, stopMotionListener]);

  const maxStrikes = settings.hardMode ? 1 : MAX_STRIKES;

  return {
    state,
    durationMinutes,
    setDurationMinutes,
    remainingSeconds,
    debug,
    shouldAlarm,
    warningDeadline,
    stats,
    strikes: stats.jailbreakCount,
    maxStrikes,
    startJail,
    endJail,
    cancelPlacement,
    dismissEnd,
  };
}
