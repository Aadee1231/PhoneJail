import { Pressable, StyleSheet, Text, View } from 'react-native';
import { VirtualJail } from '../components/VirtualJail';
import { SessionTimer } from '../components/SessionTimer';
import { JailStatus } from '../components/JailStatus';
import { DebugPanel } from '../components/DebugPanel';
import { DebugSnapshot } from '../types';

interface Props {
  remainingSeconds: number;
  progress: number;
  debug: DebugSnapshot;
  endJail: () => void;
}

export function ActiveScreen({ remainingSeconds, progress, debug, endJail }: Props) {
  return (
    <View style={styles.container}>
      <JailStatus label="Virtual Jail Active" color="#3b82f6" />

      <View style={styles.hero}>
        <VirtualJail mode="active" size={230} />
      </View>

      <SessionTimer seconds={remainingSeconds} size="huge" />
      <Text style={styles.subtitle}>Don&apos;t touch your phone.</Text>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <Pressable style={styles.endButton} onPress={endJail}>
        <Text style={styles.endButtonText}>End Jail</Text>
      </Pressable>

      <DebugPanel state="active" debug={debug} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  hero: {
    marginVertical: 32,
  },
  subtitle: {
    fontSize: 16,
    color: '#7c8199',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 32,
  },
  progressTrack: {
    width: '100%',
    maxWidth: 260,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 36,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 2,
  },
  endButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  endButtonText: {
    color: '#5a5f75',
    fontSize: 13,
    fontWeight: '600',
  },
});
