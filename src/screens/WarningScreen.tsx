import { Pressable, StyleSheet, Text, View } from 'react-native';
import { VirtualJail } from '../components/VirtualJail';
import { SessionTimer } from '../components/SessionTimer';
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
  const pct = graceTotalMs > 0 ? Math.max(0, Math.min(1, graceMs / graceTotalMs)) : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MOVEMENT DETECTED</Text>
      <Text style={styles.subtitle}>PUT IT BACK</Text>

      <View style={styles.hero}>
        <VirtualJail mode="warning" size={230} />
      </View>

      <View style={styles.graceBox}>
        <View style={styles.graceTrack}>
          <View style={[styles.graceFill, { width: `${pct * 100}%` }]} />
        </View>
        <Text style={styles.graceText}>{(graceMs / 1000).toFixed(1)}</Text>
      </View>

      <SessionTimer seconds={remainingSeconds} size="medium" color="#7c8199" />

      <Pressable style={styles.endButton} onPress={endJail}>
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
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffb020',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: 1,
    paddingHorizontal: 20,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffb020',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 1,
  },
  hero: {
    marginVertical: 20,
  },
  graceBox: {
    width: '100%',
    maxWidth: 240,
    alignItems: 'center',
    marginBottom: 20,
  },
  graceTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,176,32,0.15)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 14,
  },
  graceFill: {
    height: '100%',
    backgroundColor: '#ffb020',
    borderRadius: 3,
  },
  graceText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#ffb020',
    fontVariant: ['tabular-nums'],
  },
  endButton: {
    marginTop: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  endButtonText: {
    color: '#8a7048',
    fontSize: 13,
    fontWeight: '600',
  },
});
