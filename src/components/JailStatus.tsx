import { StyleSheet, Text, View } from 'react-native';

interface Props {
  label: string;
  color: string;
}

/** Small status pill, e.g. "VIRTUAL JAIL ACTIVE". */
export function JailStatus({ label, color }: Props) {
  return (
    <View style={styles.pill} accessible accessibilityLabel={label}>
      <View style={[styles.dot, { backgroundColor: color, shadowColor: color }]} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(127,169,213,0.06)',
    paddingVertical: 9,
    paddingHorizontal: 15,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(153,187,223,0.16)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 10,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 6,
  },
  text: {
    flexShrink: 1,
    color: '#CEDFF1',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});
