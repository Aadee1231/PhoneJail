import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { HolographicJailGraphic } from '../components/HolographicJailPreview';
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
  const { width, height } = useWindowDimensions();
  const heroSize = Math.max(140, Math.min(320, width - 48, height * 0.38));
  const completed = Math.max(0, Math.min(1, progress));

  return (
    <View style={styles.container}>
      <JailStatus label="Virtual Jail Active" color="#68B6FF" />

      <View style={styles.hero}>
        <HolographicJailGraphic mode="active" size={heroSize} />
      </View>

      <Text style={styles.eyebrow}>TIME REMAINING</Text>
      <SessionTimer seconds={remainingSeconds} size="huge" />

      <View
        style={styles.progressTrack}
        accessibilityRole="progressbar"
        accessibilityLabel="Focus session progress"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(completed * 100) }}
      >
        <View style={[styles.progressFill, { width: `${completed * 100}%` }]} />
      </View>

      <Text style={styles.subtitle}>Don&apos;t touch your phone.</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityHint="Ends the current focus session"
        style={({ pressed }) => [styles.endButton, pressed && styles.endButtonPressed]}
        onPress={endJail}
      >
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
    maxWidth: 480,
    alignSelf: 'center',
  },
  hero: {
    marginTop: 18,
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2.4,
    color: '#8FABC7',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#B2C3D7',
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 26,
  },
  progressTrack: {
    width: '78%',
    maxWidth: 280,
    height: 3,
    backgroundColor: 'rgba(119,166,217,0.16)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#5BAAFF',
    borderRadius: 2,
  },
  endButton: {
    minHeight: 48,
    minWidth: 152,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(157,188,222,0.22)',
    backgroundColor: 'rgba(145,182,224,0.04)',
  },
  endButtonPressed: {
    backgroundColor: 'rgba(145,182,224,0.12)',
  },
  endButtonText: {
    color: '#C3D3E5',
    fontSize: 14,
    fontWeight: '600',
  },
});
