export type Sensitivity = 'low' | 'medium' | 'high';
export type WarningGrace = 500 | 1000 | 2000;

export interface Settings {
  sensitivity: Sensitivity;
  warningGraceMs: WarningGrace;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  hardMode: boolean;
}

export interface SessionRecord {
  id: string;
  startTime: number;
  endTime: number;
  plannedDurationMinutes: number;
  completedDurationSeconds: number;
  status: 'completed' | 'ended-early' | 'failed';
  warningsCount: number;
  jailbreakCount: number;
}

export interface HomeStats {
  todayFocusSeconds: number;
  weekFocusSeconds: number;
  sessionsCompletedThisWeek: number;
  currentStreak: number;
}

export type JailState =
  | 'idle'
  | 'calibrating'
  | 'active'
  | 'warning'
  | 'jailbreak'
  | 'returned'
  | 'completed'
  | 'failed';

export type AppScreen =
  | 'home'
  | 'calibrating'
  | 'active'
  | 'warning'
  | 'jailbreak'
  | 'returned'
  | 'completed'
  | 'failed'
  | 'history'
  | 'settings';

export interface DebugSnapshot {
  gravity: { x: number; y: number; z: number };
  linearAccel: { x: number; y: number; z: number };
  tiltDeg: number;
  tiltSmoothedDeg: number;
  motionMag: number;
  motionSmoothedMps2: number;
  triggerHoldMs: number;
  recoverHoldMs: number;
}

export interface SessionStats {
  durationMinutes: number;
  startTime: number | null;
  elapsedFocusSeconds: number;
  warningsCount: number;
  jailbreakCount: number;
  status: SessionRecord['status'];
}
