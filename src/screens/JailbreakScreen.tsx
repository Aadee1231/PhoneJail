import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { VirtualJail } from '../components/VirtualJail';
import { SessionTimer } from '../components/SessionTimer';
import { DebugPanel } from '../components/DebugPanel';
import { DebugSnapshot } from '../types';

interface Props {
  remainingSeconds: number;
  debug: DebugSnapshot;
  endJail: () => void;
}

export function JailbreakScreen({ remainingSeconds, debug, endJail }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <VirtualJail mode="jailbreak" size={230} />
      </View>

      <Animated.Text style={[styles.title, { transform: [{ scale: pulse }] }]}>
        JAILBREAK
      </Animated.Text>
      <Text style={styles.subtitle}>PUT YOUR PHONE BACK</Text>
      <SessionTimer seconds={remainingSeconds} size="large" />

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
    marginTop: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 44,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 4,
    textAlign: 'center',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffe1de',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 1,
  },
  endButton: {
    marginTop: 24,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  endButtonText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '600',
  },
});
