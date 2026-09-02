import { StyleSheet, Text, View } from 'react-native';
import { VirtualJail } from '../components/VirtualJail';

interface Props {
  secondsLeft: number;
}

export function CalibrationScreen({ secondsLeft }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Place your phone where you want to leave it.</Text>
      <Text style={styles.subtitle}>
        Once the jail activates, moving it will trigger the alarm.
      </Text>

      <VirtualJail mode="calibrating" size={260} />

      <Text style={styles.countdown}>{secondsLeft}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f5f6fa',
    textAlign: 'center',
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  subtitle: {
    fontSize: 15,
    color: '#7c8199',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 30,
  },
  countdown: {
    fontSize: 60,
    fontWeight: '900',
    color: '#f5f6fa',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
});
