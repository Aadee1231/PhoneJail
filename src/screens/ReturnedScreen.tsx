import { StyleSheet, Text, View } from 'react-native';
import { VirtualJail } from '../components/VirtualJail';

export function ReturnedScreen() {
  return (
    <View style={styles.container}>
      <VirtualJail mode="returned" size={220} />
      <Text style={styles.title}>CONTAINED</Text>
      <Text style={styles.subtitle}>Back in jail.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#3b82f6',
    marginTop: 24,
    letterSpacing: 3,
  },
  subtitle: {
    fontSize: 15,
    color: '#7c8199',
    marginTop: 8,
  },
});
