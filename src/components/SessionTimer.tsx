import { StyleSheet, Text, View } from 'react-native';
import { formatTime } from '../util';

interface Props {
  seconds: number;
  size?: 'huge' | 'large' | 'medium';
  color?: string;
}

const SIZES = {
  huge: 76,
  large: 56,
  medium: 24,
};

export function SessionTimer({ seconds, size = 'huge', color = '#f5f6fa' }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={[styles.timer, { fontSize: SIZES[size], color }]}>{formatTime(seconds)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  timer: {
    fontWeight: '800',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
});
