import * as FileSystem from 'expo-file-system/legacy';

const SETTINGS_FILE = 'phonejail_settings.json';
const SESSIONS_FILE = 'phonejail_sessions.json';

function path(filename: string): string {
  return FileSystem.documentDirectory ? FileSystem.documentDirectory + filename : filename;
}

export async function loadJSON<T>(filename: string, fallback: T): Promise<T> {
  try {
    const filePath = path(filename);
    const exists = await FileSystem.getInfoAsync(filePath);
    if (!exists.exists) return fallback;
    const raw = await FileSystem.readAsStringAsync(filePath);
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function saveJSON<T>(filename: string, value: T): Promise<void> {
  try {
    const filePath = path(filename);
    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(value));
  } catch {
    // Storage is best-effort for this prototype.
  }
}

export async function loadSettings(): Promise<any> {
  return loadJSON(SETTINGS_FILE, null);
}

export async function saveSettings(value: any): Promise<void> {
  return saveJSON(SETTINGS_FILE, value);
}

export async function loadSessions(): Promise<any[]> {
  return loadJSON<any[]>(SESSIONS_FILE, []);
}

export async function saveSessions(value: any[]): Promise<void> {
  return saveJSON<any[]>(SESSIONS_FILE, value);
}
