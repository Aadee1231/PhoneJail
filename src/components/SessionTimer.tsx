import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { formatTime } from '../util';

interface Props {
  seconds: number;
  size?: 'huge' | 'large' | 'medium';
  color?: string;
}

const SIZES = {
  huge: 96,
  large: 64,
  medium: 26,
};

export function SessionTimer({ seconds, size = 'huge', color = '#F1F6FF' }: Props) {
  const { width } = useWindowDimensions();
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  const fontSize = Math.min(SIZES[size], Math.max(24, (width - 48) / 3.5));

  return (
    <View style={styles.wrap}>
      <Text
        style={[styles.timer, { fontSize, color, letterSpacing: size === 'medium' ? 0 : -3 }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
        accessibilityLabel={`${minutes} minutes, ${remainder} seconds remaining`}
      >
        {formatTime(safeSeconds)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    width: '100%',
  },
  timer: {
    maxWidth: '100%',
    fontWeight: '500',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
});
