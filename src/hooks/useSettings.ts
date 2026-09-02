import { useCallback, useEffect, useState } from 'react';
import { loadSettings, saveSettings } from '../storage';
import { DEFAULT_SETTINGS } from '../constants';
import { Settings } from '../types';

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSettings()
      .then((saved) => {
        if (saved) setSettingsState(saved as Settings);
      })
      .finally(() => setLoaded(true));
  }, []);

  const setSettings = useCallback(async (next: Settings) => {
    setSettingsState(next);
    await saveSettings(next);
  }, []);

  const updateSetting = useCallback(
    async <K extends keyof Settings>(key: K, value: Settings[K]) => {
      const next = { ...settings, [key]: value };
      setSettingsState(next);
      await saveSettings(next);
    },
    [settings]
  );

  return { settings, setSettings, updateSetting, loaded };
}
