import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';

import { useJailSession } from './src/useJailSession';
import { useSettings } from './src/hooks/useSettings';
import { useSessionStore } from './src/hooks/useSessionStore';
import { ARJailPlacement } from './src/ar/ARJailPlacement';
import { HomeScreen } from './src/screens/HomeScreen';
import { ActiveScreen } from './src/screens/ActiveScreen';
import { WarningScreen } from './src/screens/WarningScreen';
import { JailbreakScreen } from './src/screens/JailbreakScreen';
import { ReturnedScreen } from './src/screens/ReturnedScreen';
import { EndScreen } from './src/screens/EndScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

const sirenSound = require('./assets/sounds/siren.wav');
const warningBeepSound = require('./assets/sounds/warning_beep.wav');

/**
 * Top-level flow, separate from the internal jail session state machine:
 * home -> ar (placement + phone placement + lock) -> session (active/warning/
 * jailbreak/returned/completed/failed) -> home. History/Settings are
 * reachable from Home and the end-of-session screen.
 */
type Flow = 'home' | 'ar' | 'session' | 'history' | 'settings';

export default function App() {
  const [flow, setFlow] = useState<Flow>('home');
  const [graceMs, setGraceMs] = useState(0);
  const [prevState, setPrevState] = useState<string>('idle');

  const { settings, updateSetting } = useSettings();
  const { sessions, addSession, homeStats } = useSessionStore();
  const session = useJailSession(settings, addSession);

  const {
    state,
    durationMinutes,
    setDurationMinutes,
    remainingSeconds,
    debug,
    shouldAlarm,
    warningDeadline,
    stats,
    strikes,
    maxStrikes,
    startJail,
    endJail,
    cancelPlacement,
    dismissEnd,
  } = session;

  // Configure audio once so alarms are as reliable as Expo allows (e.g. play
  // even if the iOS silent switch is on). This cannot override the physical
  // volume buttons/system volume.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  const sirenPlayer = useAudioPlayer(sirenSound);
  const warningBeepPlayer = useAudioPlayer(warningBeepSound);

  // Loop the siren continuously while Jailbreak is active; stop the instant
  // the phone is returned.
  useEffect(() => {
    sirenPlayer.loop = true;
    if (shouldAlarm && settings.soundEnabled) {
      sirenPlayer.seekTo(0);
      sirenPlayer.play();
    } else {
      sirenPlayer.pause();
    }
  }, [shouldAlarm, settings.soundEnabled, sirenPlayer]);

  // Short, sharp beep the moment a movement warning begins.
  useEffect(() => {
    if (state === 'warning' && prevState !== 'warning' && settings.soundEnabled) {
      warningBeepPlayer.seekTo(0);
      warningBeepPlayer.play();
    }
    setPrevState(state);
  }, [state, prevState, settings.soundEnabled, warningBeepPlayer]);

  // Live warning grace-period countdown.
  useEffect(() => {
    if (state !== 'warning') {
      setGraceMs(0);
      return;
    }
    const update = () => setGraceMs(Math.max(0, warningDeadline - Date.now()));
    update();
    const id = setInterval(update, 80);
    return () => clearInterval(id);
  }, [state, warningDeadline]);

  // Keep the top-level flow in sync with the session lifecycle: the AR view
  // owns 'idle'/'awaiting-placement'/'locking'; everything after lock is the
  // session UI.
  useEffect(() => {
    if (flow === 'ar' && (state === 'active' || state === 'completed' || state === 'failed')) {
      setFlow('session');
    } else if (flow === 'session' && state === 'idle') {
      setFlow('home');
    }
  }, [state, flow]);

  const totalSeconds = stats.durationMinutes * 60;
  const progress = totalSeconds > 0 ? 1 - remainingSeconds / totalSeconds : 0;

  const handleEnterJail = (minutes: number) => {
    setDurationMinutes(minutes);
    setFlow('ar');
  };

  const handleCancelAR = () => {
    cancelPlacement();
    setFlow('home');
  };

  const handleDone = () => {
    dismissEnd();
    setFlow('home');
  };

  const handleHistoryFromEnd = () => {
    dismissEnd();
    setFlow('history');
  };

  const renderSession = () => {
    switch (state) {
      case 'active':
        return (
          <ActiveScreen
            remainingSeconds={remainingSeconds}
            progress={progress}
            debug={debug}
            endJail={endJail}
          />
        );
      case 'warning':
        return (
          <WarningScreen
            graceMs={graceMs}
            graceTotalMs={settings.warningGraceMs}
            remainingSeconds={remainingSeconds}
            debug={debug}
            endJail={endJail}
          />
        );
      case 'jailbreak':
        return (
          <JailbreakScreen
            remainingSeconds={remainingSeconds}
            strikes={strikes}
            maxStrikes={maxStrikes}
            debug={debug}
            endJail={endJail}
          />
        );
      case 'returned':
        return <ReturnedScreen />;
      case 'completed':
      case 'failed':
        return (
          <EndScreen
            status={stats.status}
            stats={stats}
            onDone={handleDone}
            onHistory={handleHistoryFromEnd}
          />
        );
      default:
        return null;
    }
  };

  const isEmergency = state === 'jailbreak' || state === 'failed';

  if (flow === 'ar') {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <ARJailPlacement
          sessionState={state}
          onPlaceJail={() => startJail(durationMinutes)}
          onCancel={handleCancelAR}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, isEmergency && styles.emergencyBg]}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[styles.scroll, flow === 'session' && styles.sessionScroll]}
      >
        {flow === 'session' && renderSession()}
        {flow === 'home' && (
          <HomeScreen
            durationMinutes={durationMinutes}
            setDurationMinutes={setDurationMinutes}
            onEnterJail={handleEnterJail}
            homeStats={homeStats}
            onHistory={() => setFlow('history')}
            onSettings={() => setFlow('settings')}
          />
        )}
        {flow === 'history' && (
          <HistoryScreen
            todayFocusSeconds={homeStats.todayFocusSeconds}
            weekFocusSeconds={homeStats.weekFocusSeconds}
            sessions={sessions}
            onBack={() => setFlow('home')}
          />
        )}
        {flow === 'settings' && (
          <SettingsScreen settings={settings} updateSetting={updateSetting} onBack={() => setFlow('home')} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08090f',
  },
  emergencyBg: {
    backgroundColor: '#5c0f0f',
  },
  scroll: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 110,
    paddingBottom: 60,
    justifyContent: 'center',
  },
  sessionScroll: {
    paddingTop: 90,
    justifyContent: 'flex-start',
  },
});
