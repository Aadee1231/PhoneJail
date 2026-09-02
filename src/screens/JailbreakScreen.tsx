import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { VirtualJail } from '../components/VirtualJail';
import { SessionTimer } from '../components/SessionTimer';
import { DebugPanel } from '../components/DebugPanel';
import { DebugSnapshot } from '../types';
import { JAILBREAK_STABILIZE_MS } from '../constants';

interface Props {
  remainingSeconds: number;
  strikes: number;
  maxStrikes: number;
  debug: DebugSnapshot;
  endJail: () => void;
}

export function JailbreakScreen({ remainingSeconds, strikes, maxStrikes, debug, endJail }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 450, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 450, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  // Recovery countdown: seconds of stillness remaining before the session
  // resumes. Counts down only while the phone is actually back at rest.
  const recoverRemainingSec = Math.ceil(
    Math.max(0, JAILBREAK_STABILIZE_MS - debug.recoverHoldMs) / 1000
  );

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <VirtualJail mode="jailbreak" size={200} />
      </View>

      <Animated.Text style={[styles.title, { transform: [{ scale: pulse }] }]}>
        JAILBREAK
      </Animated.Text>
      <Text style={styles.subtitle}>PUT YOUR PHONE BACK</Text>

      <Text style={styles.recoverCount}>{recoverRemainingSec}</Text>
      <Text style={styles.recoverLabel}>to recover</Text>

      <Text style={styles.strikes}>
        Strike {Math.min(strikes, maxStrikes)}/{maxStrikes}
      </Text>

      <SessionTimer seconds={remainingSeconds} size="medium" color="rgba(255,255,255,0.7)" />

      <Pressable style={styles.endButton} onPress={endJail}>
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
  },
  hero: {
    marginTop: 4,
    marginBottom: 4,
  },
  title: {
    fontSize: 44,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 4,
    textAlign: 'center',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffd9d5',
    textAlign: 'center',
    marginBottom: 22,
    letterSpacing: 1,
  },
  recoverCount: {
    fontSize: 64,
    fontWeight: '900',
    color: '#fff',
    fontVariant: ['tabular-nums'],
    lineHeight: 68,
  },
  recoverLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 18,
  },
  strikes: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
    marginBottom: 18,
    textTransform: 'uppercase',
  },
  endButton: {
    marginTop: 22,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  endButtonText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
  },
});
