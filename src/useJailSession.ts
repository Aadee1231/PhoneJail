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
} from './constants';
import { DebugSnapshot, JailState, SessionRecord, SessionStats, Settings } from './types';

type Vec3 = { x: number; y: number; z: number };

const ZERO_VEC: Vec3 = { x: 0, y: 0, z: 0 };
let keepAwakeId = 0;

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
 * Lifecycle: idle -> placement-confirmed (user physically puts the phone
 * flat and still) -> locking ("JAIL LOCKED") -> active ->
 * unlimited warning/jailbreak/returned loops -> completed or ended early.
 * Motion sensors cannot verify the phone's position inside the AR jail.
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
  const [placementError, setPlacementError] = useState<string | null>(null);
  // Alarm flag: true only while the session is in 'jailbreak'. It clears
  // when the stillness detector returns the phone to 'returned', and on any
  // session end/reset path.
  const [alarmActive, setAlarmActive] = useState(false);
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
  const lastGravityRef = useRef<Vec3>({ x: 0, y: 0, z: 1 });
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
  const focusedElapsedMsRef = useRef(0);
  const activeSinceRef = useRef<number | null>(null);
  const sessionFinishedRef = useRef(false);
  const startupGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const keepAwakeTagRef = useRef<string | null>(null);
  const onSessionEndRef = useRef(onSessionEnd);
  useEffect(() => {
    onSessionEndRef.current = onSessionEnd;
  }, [onSessionEnd]);

  const alarmActiveRef = useRef(false);
  const setAlarm = useCallback((on: boolean) => {
    alarmActiveRef.current = on;
    setAlarmActive(on);
  }, []);

  const motionSubRef = useRef<ReturnType<typeof DeviceMotion.addListener> | null>(null);
  const sessionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hapticIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const returnedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const readFocusedElapsedMs = useCallback(() => {
    if (activeSinceRef.current !== null) {
      const now = Math.max(activeSinceRef.current, Date.now());
      focusedElapsedMsRef.current = Math.min(
        selectedDurationRef.current * 60_000,
        focusedElapsedMsRef.current + now - activeSinceRef.current
      );
      activeSinceRef.current = now;
    }
    return focusedElapsedMsRef.current;
  }, []);

  const setJailState = useCallback((next: JailState) => {
    if (stateRef.current === next) return;
    const elapsed = readFocusedElapsedMs();
    if (stateRef.current === 'active') {
      setRemainingSeconds(Math.ceil(Math.max(0, selectedDurationRef.current * 60_000 - elapsed) / 1000));
    }
    activeSinceRef.current = next === 'active' ? Date.now() : null;
    stateRef.current = next;
    setState(next);
  }, [readFocusedElapsedMs]);

  const releaseKeepAwake = useCallback(() => {
    const tag = keepAwakeTagRef.current;
    keepAwakeTagRef.current = null;
    if (tag !== null) void deactivateKeepAwake(tag).catch(() => {});
  }, []);

  const clearAllTimers = useCallback(() => {
    if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
    if (hapticIntervalRef.current) clearInterval(hapticIntervalRef.current);
    if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
    if (returnedTimeoutRef.current) clearTimeout(returnedTimeoutRef.current);
    sessionIntervalRef.current = null;
    hapticIntervalRef.current = null;
    lockTimeoutRef.current = null;
    returnedTimeoutRef.current = null;
  }, []);

  const stopMotionListener = useCallback(() => {
    motionSubRef.current?.remove();
    motionSubRef.current = null;
  }, []);

  const finishSession = useCallback(
    (status: SessionRecord['status'], nextState: JailState) => {
      if (sessionFinishedRef.current || startTimeRef.current === null) return;
      sessionFinishedRef.current = true;
      startupGenerationRef.current += 1;
      const completedSeconds = Math.floor(readFocusedElapsedMs() / 1000);
      clearAllTimers();
      stopMotionListener();
      releaseKeepAwake();

      const startTime = startTimeRef.current;

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

      setStats((s) => ({ ...s, status, elapsedFocusSeconds: completedSeconds }));
      setAlarm(false);
      setJailState(nextState);
      onSessionEndRef.current(record);
    },
    [clearAllTimers, readFocusedElapsedMs, releaseKeepAwake, setJailState, setAlarm, stopMotionListener]
  );

  // One-shot haptics and the automatic "returned -> active" timer.
  useEffect(() => {
    const haptics = settingsRef.current.hapticsEnabled;
    if (state === 'warning' && haptics) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
    if (state === 'locking' && haptics) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    // The alarm sounds only while the phone is disturbed. Once the stillness
    // detector settles the phone back into 'returned', the alarm clears and
    // the session resumes normally.
    setAlarm(state === 'jailbreak');
    if (state === 'returned') {
      if (haptics && !alarmActiveRef.current) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      returnedTimeoutRef.current = setTimeout(() => {
        returnedTimeoutRef.current = null;
        if (mountedRef.current && stateRef.current === 'returned') setJailState('active');
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
  }, [state, setJailState, setAlarm]);

  // Loud haptic pulses for the whole alarm duration — i.e. while the session
  // is in 'jailbreak'. The interval clears when alarmActive clears (phone
  // returned to stillness, End Jail, or timer completion), matching the
  // audible alarm lifecycle.
  useEffect(() => {
    if (!alarmActive) return;
    if (settingsRef.current.hapticsEnabled) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
    hapticIntervalRef.current = setInterval(() => {
      if (settingsRef.current.hapticsEnabled) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
    }, JAILBREAK_HAPTIC_INTERVAL_MS);
    return () => {
      if (hapticIntervalRef.current) {
        clearInterval(hapticIntervalRef.current);
        hapticIntervalRef.current = null;
      }
    };
  }, [alarmActive]);

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
    if (!mountedRef.current || stateRef.current !== 'locking') return;
    const totalSeconds = selectedDurationRef.current * 60;
    focusedElapsedMsRef.current = 0;
    setRemainingSeconds(totalSeconds);
    const start = Date.now();
    startTimeRef.current = start;
    setStats((s) => ({ ...s, startTime: start, elapsedFocusSeconds: 0 }));
    setJailState('active');

    sessionIntervalRef.current = setInterval(() => {
      if (!mountedRef.current || stateRef.current !== 'active') return;
      const remainingMs = Math.max(0, totalSeconds * 1000 - readFocusedElapsedMs());
      setRemainingSeconds(Math.ceil(remainingMs / 1000));
      if (remainingMs === 0) finishSession('completed', 'completed');
    }, SENSOR_UPDATE_INTERVAL_MS);
  }, [setJailState, finishSession, readFocusedElapsedMs]);

  /**
   * Called from the motion listener once the phone has been flat + stationary
   * long enough while awaiting placement. Captures the resting baseline from
   * the settled samples, shows "JAIL LOCKED", then starts the timer.
   */
  const lockJail = useCallback(() => {
    if (stateRef.current !== 'placement-confirmed') {
      if (__DEV__) console.log('[startJailSession] ignored because placement is not confirmed');
      return;
    }
    const samples = placementSamplesRef.current;
    let avg: Vec3 = { x: 0, y: 0, z: 0 };
    if (samples.length > 0) {
      avg = samples.reduce(
        (acc, s) => ({ x: acc.x + s.x, y: acc.y + s.y, z: acc.z + s.z }),
        { x: 0, y: 0, z: 0 }
      );
      avg = { x: avg.x / samples.length, y: avg.y / samples.length, z: avg.z / samples.length };
    }
    const fallback = magnitude(lastGravityRef.current) > 0 ? lastGravityRef.current : { x: 0, y: 0, z: 1 };
    baselineGravityRef.current = normalize(magnitude(avg) === 0 ? fallback : avg);
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
    const inc = data.accelerationIncludingGravity ?? ZERO_VEC;
    const linear: Vec3 = data.acceleration ?? ZERO_VEC;
    const gravity: Vec3 = data.acceleration
      ? { x: inc.x - linear.x, y: inc.y - linear.y, z: inc.z - linear.z }
      : { x: inc.x, y: inc.y, z: inc.z };
    lastGravityRef.current = gravity;
    const now = Date.now();
    const currentState = stateRef.current;
    const s = settingsRef.current;

    if (currentState === 'placement-confirmed') {
      // Sensors verify the phone is lying approximately flat and still. We use
      // |gravity.z| so a phone placed screen-up or screen-down is accepted,
      // while a phone held upright (gravity mostly along x/y) does not start.
      const gravMag = magnitude(gravity);
      const flatFraction = gravMag > 0 ? Math.abs(gravity.z) / gravMag : 0;
      const motionMag = magnitude(linear);
      smoothedMotionRef.current =
        SMOOTHING_ALPHA * motionMag + (1 - SMOOTHING_ALPHA) * smoothedMotionRef.current;

      const isPlaced =
        flatFraction >= PLACEMENT_FLAT_MIN_FRACTION &&
        smoothedMotionRef.current < PLACEMENT_MOTION_MAX_MPS2 &&
        gravMag > 1;

      if (__DEV__) {
        const elapsed = placementHoldStartRef.current ? now - placementHoldStartRef.current : 0;
        console.log(
          '[placement-watch] gravity', { x: gravity.x.toFixed(2), y: gravity.y.toFixed(2), z: gravity.z.toFixed(2) },
          'flat', flatFraction.toFixed(3),
          'motion', smoothedMotionRef.current.toFixed(3),
          'isPlaced', isPlaced,
          'holdMs', elapsed
        );
      }

      if (isPlaced) {
        placementSamplesRef.current.push(gravity);
        // Keep only a recent window of samples for the baseline.
        if (placementSamplesRef.current.length > 40) placementSamplesRef.current.shift();
        if (placementHoldStartRef.current === null) {
          placementHoldStartRef.current = now;
          if (__DEV__) console.log('[placement-watch] hold started');
        } else if (now - placementHoldStartRef.current >= PLACEMENT_STABILIZE_MS) {
          placementHoldStartRef.current = null;
          if (__DEV__) console.log('[placement-watch] auto-start firing');
          lockJailRef.current();
        }
      } else {
        if (placementHoldStartRef.current !== null && __DEV__) {
          console.log('[placement-watch] hold cancelled (not placed)');
        }
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
   * Confirms the AR placement and starts the motion-sensor watch. The timer
   * does NOT start here — it starts only after the phone is detected flat and
   * stationary (see lockJail / beginActiveSession).
   */
  const confirmJailPlacement = useCallback(async (overrideMinutes?: number): Promise<boolean> => {
    if (!mountedRef.current) return false;
    const generation = ++startupGenerationRef.current;
    const isCurrent = () => mountedRef.current && generation === startupGenerationRef.current;
    clearAllTimers();
    stopMotionListener();
    releaseKeepAwake();
    activeSinceRef.current = null;
    focusedElapsedMsRef.current = 0;
    sessionFinishedRef.current = false;
    placementSamplesRef.current = [];
    placementHoldStartRef.current = null;
    smoothedTiltRef.current = 0;
    smoothedMotionRef.current = 0;
    triggerHoldStartRef.current = null;
    recoverHoldStartRef.current = null;
    warningDeadlineRef.current = 0;
    setWarningDeadline(0);
    setAlarm(false);
    setPlacementError(null);
    setRemainingSeconds(0);
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
    setJailState('placement-confirmed');

    let tag: string | null = null;
    try {
      const permission = await DeviceMotion.requestPermissionsAsync();
      if (!isCurrent()) return false;
      if (!permission.granted) {
        throw new Error('Motion permission is required. Enable motion access in Settings and try again.');
      }
      const available = await DeviceMotion.isAvailableAsync();
      if (!isCurrent()) return false;
      if (!available) throw new Error('Motion sensors are unavailable on this device. Try again on a supported phone.');

      tag = `phone-jail-${++keepAwakeId}`;
      keepAwakeTagRef.current = tag;
      await activateKeepAwakeAsync(tag);
      if (!isCurrent()) {
        void deactivateKeepAwake(tag).catch(() => {});
        return false;
      }
      DeviceMotion.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);
      motionSubRef.current = DeviceMotion.addListener((data) => {
        if (isCurrent()) handleMotionSample(data);
      });
      return true;
    } catch (error) {
      if (tag !== null) void deactivateKeepAwake(tag).catch(() => {});
      if (!isCurrent()) return false;
      keepAwakeTagRef.current = null;
      clearAllTimers();
      stopMotionListener();
      setPlacementError(error instanceof Error ? error.message : 'Unable to start motion detection. Please try again.');
      setJailState('idle');
      return false;
    }
  }, [durationMinutes, handleMotionSample, setJailState, setAlarm, stopMotionListener, clearAllTimers, releaseKeepAwake]);

  const endJail = useCallback(() => {
    finishSession('ended-early', 'completed');
  }, [finishSession]);

  /** Abort before the jail ever locked (no timer ran, nothing to record). */
  const cancelPlacement = useCallback(() => {
    startupGenerationRef.current += 1;
    clearAllTimers();
    stopMotionListener();
    releaseKeepAwake();
    placementHoldStartRef.current = null;
    placementSamplesRef.current = [];
    setPlacementError(null);
    setAlarm(false);
    setJailState('idle');
  }, [clearAllTimers, stopMotionListener, setJailState, setAlarm, releaseKeepAwake]);

  const dismissEnd = useCallback(() => {
    setAlarm(false);
    setJailState('idle');
    setRemainingSeconds(0);
  }, [setJailState, setAlarm]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      startupGenerationRef.current += 1;
      activeSinceRef.current = null;
      clearAllTimers();
      stopMotionListener();
      releaseKeepAwake();
    };
  }, [clearAllTimers, stopMotionListener, releaseKeepAwake]);

  return {
    state,
    durationMinutes,
    setDurationMinutes,
    remainingSeconds,
    placementError,
    debug,
    alarmActive,
    warningDeadline,
    stats,
    confirmJailPlacement,
    startJailSession: lockJail,
    endJail,
    cancelPlacement,
    dismissEnd,
  };
}
