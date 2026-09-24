import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { HolographicJailGraphic } from '../components/HolographicJailPreview';
import { SessionTimer } from '../components/SessionTimer';
import { JailStatus } from '../components/JailStatus';
import { DebugPanel } from '../components/DebugPanel';
import { DebugSnapshot } from '../types';

interface Props {
  graceMs: number;
  graceTotalMs: number;
  remainingSeconds: number;
  debug: DebugSnapshot;
  endJail: () => void;
}

export function WarningScreen({ graceMs, graceTotalMs, remainingSeconds, debug, endJail }: Props) {
  const { width, height } = useWindowDimensions();
  const heroSize = Math.max(140, Math.min(300, width - 48, height * 0.32));
  const pct = graceTotalMs > 0 ? Math.max(0, Math.min(1, graceMs / graceTotalMs)) : 0;
  const graceSeconds = (Math.max(0, graceMs) / 1000).toFixed(1);

  return (
    <View style={styles.container}>
      <JailStatus label="Movement detected" color="#F3BC68" />
      <Text style={styles.title} accessibilityRole="header">Put your phone back.</Text>

      <View style={styles.hero}>
        <HolographicJailGraphic mode="warning" size={heroSize} />
      </View>

      <View style={styles.graceBox}>
        <Text style={styles.graceText} accessibilityLabel={`${graceSeconds} seconds to return your phone`}>
          {graceSeconds}<Text style={styles.unit}> s</Text>
        </Text>
        <Text style={styles.graceLabel}>RETURN BEFORE THE ALARM</Text>
        <View
          style={styles.graceTrack}
          accessibilityRole="progressbar"
          accessibilityLabel="Grace period remaining"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
        >
          <View style={[styles.graceFill, { width: `${pct * 100}%` }]} />
        </View>
      </View>

      <View style={styles.sessionTime}>
        <Text style={styles.timerLabel}>Session remaining</Text>
        <SessionTimer seconds={remainingSeconds} size="medium" color="#D3DCE8" />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityHint="Ends the current focus session"
        style={({ pressed }) => [styles.endButton, pressed && styles.endButtonPressed]}
        onPress={endJail}
      >
        <Text style={styles.endButtonText}>End Jail</Text>
      </Pressable>

      <DebugPanel state="warning" debug={debug} />
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
  title: {
    fontSize: 27,
    fontWeight: '600',
    color: '#F8DCAC',
    textAlign: 'center',
    marginTop: 18,
    letterSpacing: -0.6,
  },
  hero: {
    marginVertical: 12,
  },
  graceBox: {
    width: '100%',
    maxWidth: 260,
    alignItems: 'center',
    marginBottom: 22,
  },
  graceTrack: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(243,188,104,0.16)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 18,
  },
  graceFill: {
    height: '100%',
    backgroundColor: '#F3BC68',
    borderRadius: 2,
  },
  graceText: {
    fontSize: 64,
    fontWeight: '500',
    color: '#F8D69E',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 24,
    letterSpacing: 0,
    color: '#CBB18C',
  },
  graceLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#CBB18C',
    letterSpacing: 1.7,
    textAlign: 'center',
    marginTop: 4,
  },
  sessionTime: {
    alignItems: 'center',
    width: '100%',
    gap: 4,
  },
  timerLabel: {
    fontSize: 12,
    color: '#9EADC0',
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
    borderColor: 'rgba(243,188,104,0.22)',
    backgroundColor: 'rgba(243,188,104,0.04)',
  },
  endButtonPressed: {
    backgroundColor: 'rgba(243,188,104,0.12)',
  },
  endButtonText: {
    color: '#D8C7AF',
    fontSize: 14,
    fontWeight: '600',
  },
});
