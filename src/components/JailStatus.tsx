import { StyleSheet, Text, View } from 'react-native';

interface Props {
  label: string;
  color: string;
}

/** Small status pill, e.g. "VIRTUAL JAIL ACTIVE". */
export function JailStatus({ label, color }: Props) {
  return (
    <View style={styles.pill}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 9,
  },
  text: {
    color: '#f5f6fa',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
