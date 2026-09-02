import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadSessions, saveSessions } from '../storage';
import { HomeStats, SessionRecord } from '../types';

function getLocalDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const ny = date.getFullYear();
  const nm = String(date.getMonth() + 1).padStart(2, '0');
  const nd = String(date.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

function computeHomeStats(sessions: SessionRecord[]): HomeStats {
  if (sessions.length === 0) {
    return {
      todayFocusSeconds: 0,
      weekFocusSeconds: 0,
      sessionsCompletedThisWeek: 0,
      currentStreak: 0,
    };
  }

  const todayKey = getLocalDateKey(Date.now());
  const today = new Date(todayKey);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - 6);
  const weekStartKey = getLocalDateKey(weekStart.getTime());

  const completedDays = new Set<string>();
  let todayFocusSeconds = 0;
  let weekFocusSeconds = 0;
  let sessionsCompletedThisWeek = 0;

  for (const s of sessions) {
    const key = getLocalDateKey(s.startTime);
    if (s.status === 'completed') completedDays.add(key);

    if (key >= weekStartKey && key <= todayKey) {
      weekFocusSeconds += s.completedDurationSeconds;
      if (s.status === 'completed') sessionsCompletedThisWeek += 1;
    }

    if (key === todayKey) {
      todayFocusSeconds += s.completedDurationSeconds;
    }
  }

  // Current streak: consecutive days with a completed session, ending at the
  // most recent completed day.
  let currentStreak = 0;
  if (completedDays.size > 0) {
    const sorted = Array.from(completedDays).sort();
    let cursor = sorted[sorted.length - 1];
    while (completedDays.has(cursor)) {
      currentStreak += 1;
      cursor = addDays(cursor, -1);
    }
  }

  return {
    todayFocusSeconds,
    weekFocusSeconds,
    sessionsCompletedThisWeek,
    currentStreak,
  };
}

export function useSessionStore() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSessions()
      .then((saved) => {
        if (Array.isArray(saved)) setSessions(saved as SessionRecord[]);
      })
      .finally(() => setLoaded(true));
  }, []);

  const addSession = useCallback(async (session: SessionRecord) => {
    setSessions((prev) => {
      const next = [session, ...prev];
      saveSessions(next);
      return next;
    });
  }, []);

  const homeStats = useMemo(() => computeHomeStats(sessions), [sessions]);

  return { sessions, loaded, addSession, homeStats };
}
