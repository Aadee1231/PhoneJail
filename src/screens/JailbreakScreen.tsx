import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { HolographicJailGraphic } from '../components/HolographicJailPreview';
import { SessionTimer } from '../components/SessionTimer';
import { DebugPanel } from '../components/DebugPanel';
import { DebugSnapshot } from '../types';
import { JAILBREAK_STABILIZE_MS } from '../constants';

interface Props {
  remainingSeconds: number;
  debug: DebugSnapshot;
  endJail: () => void;
}

export function JailbreakScreen({ remainingSeconds, debug, endJail }: Props) {
  const { width, height } = useWindowDimensions();
  const heroSize = Math.max(140, Math.min(300, width - 48, height * 0.32));

  // Recovery countdown: seconds of stillness remaining before the session
  // resumes. Counts down only while the phone is actually back at rest.
  const recoverRemainingSec = Math.ceil(
    Math.max(0, JAILBREAK_STABILIZE_MS - debug.recoverHoldMs) / 1000
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">JAILBREAK</Text>
      <Text style={styles.subtitle}>PUT YOUR PHONE BACK</Text>

      <View style={styles.hero}>
        <HolographicJailGraphic mode="jailbreak" size={heroSize} />
      </View>

      <View style={styles.recovery}>
        <Text
          style={styles.recoverCount}
          accessibilityLabel={`${recoverRemainingSec} seconds of stillness remaining to resume`}
        >
          {recoverRemainingSec}<Text style={styles.unit}> s</Text>
        </Text>
        <Text style={styles.recoverLabel}>Keep it still to resume.</Text>
      </View>

      <View style={styles.sessionTime}>
        <Text style={styles.timerLabel}>Session remaining</Text>
        <SessionTimer seconds={remainingSeconds} size="medium" color="#E6CDD2" />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityHint="Ends the current focus session"
        style={({ pressed }) => [styles.endButton, pressed && styles.endButtonPressed]}
        onPress={endJail}
      >
        <Text style={styles.endButtonText}>End Jail</Text>
      </Pressable>

      <DebugPanel state="jailbreak" debug={debug} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  hero: {
    marginVertical: 12,
  },
  title: {
    fontSize: 38,
    fontWeight: '600',
    color: '#FFB8BF',
    textAlign: 'center',
    letterSpacing: 3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E5A2AC',
    textAlign: 'center',
    marginTop: 10,
    letterSpacing: 1.8,
  },
  recovery: {
    alignItems: 'center',
    width: '100%',
    marginBottom: 24,
  },
  recoverCount: {
    fontSize: 64,
    fontWeight: '500',
    color: '#FFE6E9',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 24,
    letterSpacing: 0,
    color: '#D8A8B0',
  },
  recoverLabel: {
    fontSize: 15,
    color: '#D8A8B0',
    textAlign: 'center',
    marginTop: 6,
  },
  sessionTime: {
    alignItems: 'center',
    width: '100%',
    gap: 4,
  },
  timerLabel: {
    fontSize: 12,
    color: '#BE9FA8',
    textAlign: 'center',
  },
  endButton: {
    marginTop: 22,
    minHeight: 48,
    minWidth: 152,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(240,159,173,0.24)',
    backgroundColor: 'rgba(240,159,173,0.04)',
  },
  endButtonPressed: {
    backgroundColor: 'rgba(240,159,173,0.12)',
  },
  endButtonText: {
    color: '#E0BEC6',
    fontSize: 14,
    fontWeight: '600',
  },
});
