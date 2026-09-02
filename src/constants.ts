/**
 * Tunable constants for the Virtual Jail motion-detection prototype.
 *
 * These are the base values. Effective thresholds are multiplied by the
 * selected sensitivity factor at runtime. See src/hooks/useJailSession.ts
 * and src/hooks/useSettings.ts.
 */

import { Settings, Sensitivity, WarningGrace } from './types';

// --- Sensor sampling ---
// How often (ms) we read the DeviceMotion sensor. Lower = more responsive,
// but more battery/CPU usage. 100ms (10Hz) is plenty for this use case.
export const SENSOR_UPDATE_INTERVAL_MS = 100;

// --- Calibration ---
// Total countdown (seconds) shown to the user before the baseline is locked in.
export const CALIBRATION_SECONDS = 5;
// We only average samples from the last N seconds of calibration so the user
// has time to actually put the phone down and let it settle first.
export const CALIBRATION_SETTLE_SECONDS = 2;

// --- Smoothing ---
// Exponential moving average factor applied to raw sensor readings, in the
// range (0, 1]. Higher = less smoothing (more responsive, more noise-prone).
// Lower = more smoothing (slower to react, but ignores small jitter/noise).
export const SMOOTHING_ALPHA = 0.25;

// --- Base movement thresholds (trigger a "Movement Detected" warning) ---
// Angle (degrees) the smoothed gravity vector may deviate from the
// calibrated resting orientation before we consider the phone "tilted".
export const TILT_TRIGGER_DEGREES = 15;
// Smoothed linear-acceleration magnitude (m/s^2, gravity removed) above
// which we consider the phone to be undergoing significant motion.
export const MOTION_TRIGGER_MPS2 = 0.5;
// The trigger conditions above must hold continuously for this long (ms)
// before we enter the warning state. This is what filters out brief bumps
// and single-sample sensor noise spikes.
export const TRIGGER_SUSTAIN_MS = 350;

// --- Base recovery thresholds (return to normal from warning/jailbreak) ---
// These are intentionally tighter than the trigger thresholds so the phone
// has to be genuinely back at rest (not just "close enough") to recover.
export const TILT_RECOVER_DEGREES = 8;
export const MOTION_RECOVER_MPS2 = 0.25;

// --- State timing ---
// How long the phone must remain within the recovery thresholds while in
// warning before we cancel the warning and resume the session normally.
export const WARNING_RECOVER_SUSTAIN_MS = 300;
// How long the phone must remain within the recovery thresholds while in
// Jailbreak before the alarm stops and the session resumes.
export const JAILBREAK_STABILIZE_MS = 1200;
// How long the "Back in jail." success message is shown before resuming the
// active timer.
export const RETURNED_DISPLAY_MS = 1200;

// --- Alarm feedback ---
// Interval (ms) between repeated haptic pulses while in the Jailbreak state.
export const JAILBREAK_HAPTIC_INTERVAL_MS = 500;

// --- Sensitivity ---
// Multiplier applied to the base trigger/recovery thresholds. Lower values
// make detection more sensitive (easier to trigger, harder to recover).
// Higher values make it less sensitive (harder to trigger, easier to recover).
export const SENSITIVITY_MULTIPLIER: Record<Sensitivity, number> = {
  low: 1.5,
  medium: 1.0,
  high: 0.55,
};

// --- Default settings ---
export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 'medium',
  warningGraceMs: 1000,
  soundEnabled: true,
  hapticsEnabled: true,
  hardMode: false,
};
