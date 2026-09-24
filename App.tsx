import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';

import { AuthGate } from './src/auth/AuthGate';

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

const sirenSound = require('./assets/sounds/containment-alarm.wav');
const warningBeepSound = require('./assets/sounds/warning_beep.wav');

/**
 * Top-level flow, separate from the internal jail session state machine:
 * home -> ar (placement + phone placement + lock) -> session (active/warning/
 * jailbreak/returned/completed/failed) -> home. History/Settings are
 * reachable from Home and the end-of-session screen.
 */
type Flow = 'home' | 'ar' | 'session' | 'history' | 'settings';

function PhoneJailApp() {
  const [flow, setFlow] = useState<Flow>('home');
  const [graceMs, setGraceMs] = useState(0);
  const [audioReady, setAudioReady] = useState(false);

  const { settings, updateSetting } = useSettings();
  const { sessions, addSession, homeStats } = useSessionStore();
  const session = useJailSession(settings, addSession);

  const {
    state,
    durationMinutes,
    setDurationMinutes,
    remainingSeconds,
    debug,
    placementError,
    warningDeadline,
    stats,
    alarmActive,
    confirmJailPlacement,
    endJail,
    cancelPlacement,
    dismissEnd,
  } = session;

  // Configure audio once so alarms are as reliable as Expo allows (e.g. play
  // even if the iOS silent switch is on). This cannot override the physical
  // volume buttons/system volume.
  useEffect(() => {
    let cancelled = false;
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' })
      .then(() => { if (!cancelled) setAudioReady(true); })
      .catch((error) => {
        if (__DEV__) console.warn('[Audio] Unable to configure silent-mode playback', error);
        if (!cancelled) setAudioReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  // keepAudioSessionActive keeps the iOS audio session warm across pause/play
  // so a re-triggered alarm starts instantly in a later jail session.
  const sirenPlayer = useAudioPlayer(sirenSound, { keepAudioSessionActive: true });
  const warningBeepPlayer = useAudioPlayer(warningBeepSound);

  const sirenArmed = useRef(false);

  // Loop the siren continuously while the alarm latch is on. alarmActive is
  // true for the whole 'jailbreak' state: it stays on while the phone is
  // held/moving, and clears only when the stillness detector confirms the
  // phone is back at rest (or on End Jail / timer completion). While armed, a
  // lightweight retry keeps asserting play() until the native player reports
  // playing, so a late asset load or a silent session failure self-heals
  // instead of muting the alarm. A single shared player is reused — repeated
  // triggers never create overlapping audio instances.
  useEffect(() => {
    const wantsAlarm = alarmActive && settings.soundEnabled && audioReady;
    if (!wantsAlarm) {
      if (sirenArmed.current || sirenPlayer.playing) {
        if (__DEV__) console.log('[Audio] alarm off — pausing siren');
        sirenPlayer.pause();
        sirenPlayer.seekTo(0).catch(() => {});
      }
      sirenArmed.current = false;
      return;
    }

    if (!sirenArmed.current) {
      if (__DEV__) console.log('[Audio] jailbreak alarm armed — looping at full volume');
      // Re-assert the silent-mode-friendly audio session right before
      // playback in case another part of the app changed it.
      setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' })
        .catch((error) => {
          if (__DEV__) console.warn('[Audio] Unable to re-assert silent-mode playback', error);
        });
    }

    let disposed = false;
    let resetPending = true;
    const tryPlay = () => {
      if (disposed) return;
      try {
        sirenPlayer.loop = true;
        sirenPlayer.volume = 1;
        if (sirenPlayer.playing) {
          sirenArmed.current = true;
          return;
        }
        if (resetPending && sirenPlayer.isLoaded) {
          resetPending = false;
          sirenPlayer.seekTo(0).catch(() => {});
        }
        sirenPlayer.play();
        sirenArmed.current = true;
        if (__DEV__) console.log('[Audio] jailbreak alarm play() requested, loaded =', sirenPlayer.isLoaded);
      } catch (error) {
        if (__DEV__) console.warn('[Audio] Alarm play attempt failed', error);
      }
    };

    tryPlay();
    const retry = setInterval(tryPlay, 700);
    return () => {
      disposed = true;
      clearInterval(retry);
    };
  }, [alarmActive, settings.soundEnabled, audioReady, sirenPlayer]);

  // Short, sharp beep the moment a movement warning begins.
  useEffect(() => {
    let cancelled = false;
    if (state === 'warning' && settings.soundEnabled && audioReady) {
      warningBeepPlayer.seekTo(0).then(() => {
        if (!cancelled) warningBeepPlayer.play();
      }).catch((error) => {
        if (__DEV__) console.warn('[Audio] Warning playback failed', error);
      });
    }
    return () => { cancelled = true; warningBeepPlayer.pause(); };
  }, [state, settings.soundEnabled, audioReady, warningBeepPlayer]);

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
  // owns 'idle'/'placement-confirmed'/'locking'; everything after lock is the
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
          debug={debug}
          placementError={placementError}
          onConfirmJail={() => confirmJailPlacement(durationMinutes)}
          onCancel={handleCancelAR}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, state === 'warning' && styles.warningBg, isEmergency && styles.emergencyBg]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scroll, flow === 'session' && styles.sessionScroll, flow === 'home' && styles.homeScroll]}
          keyboardShouldPersistTaps="handled"
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
      </KeyboardAvoidingView>
    </View>
  );
}

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function App() {
  if (!publishableKey) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <Text style={styles.missingKeyText}>
          Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY.{'\n'}Add it to .env.local and restart Metro.
        </Text>
      </View>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <AuthGate>
        <PhoneJailApp />
      </AuthGate>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  missingKeyText: {
    color: '#ff8fa3',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 32,
    lineHeight: 24,
  },
  keyboard: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#060c16',
  },
  warningBg: {
    backgroundColor: '#100e12',
  },
  emergencyBg: {
    backgroundColor: '#19090f',
  },
  scroll: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 110,
    paddingBottom: 60,
    justifyContent: 'center',
  },
  sessionScroll: {
    paddingTop: 64,
    paddingBottom: 36,
    justifyContent: 'center',
  },
  homeScroll: {
    paddingTop: 60,
    paddingBottom: 28,
  },
});
