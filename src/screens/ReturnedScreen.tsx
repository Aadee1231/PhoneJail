import { StyleSheet, Text, View } from 'react-native';
import { VirtualJail } from '../components/VirtualJail';

export function ReturnedScreen() {
  return (
    <View style={styles.container}>
      <VirtualJail mode="returned" size={220} />
      <Text style={styles.title}>Back in jail.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#3b82f6',
    marginTop: 24,
  },
});
