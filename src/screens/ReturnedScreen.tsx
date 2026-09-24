import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { HolographicJailGraphic } from '../components/HolographicJailPreview';
import { JailStatus } from '../components/JailStatus';

export function ReturnedScreen() {
  const { width, height } = useWindowDimensions();
  const heroSize = Math.max(140, Math.min(320, width - 48, height * 0.38));

  return (
    <View style={styles.container}>
      <JailStatus label="Containment restored" color="#79DDE8" />
      <View style={styles.hero}>
        <HolographicJailGraphic mode="returned" size={heroSize} />
      </View>
      <Text style={styles.title} accessibilityRole="header">CONTAINED</Text>
      <Text style={styles.subtitle}>BACK IN JAIL</Text>
      <Text style={styles.detail}>Your focus continues.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingVertical: 24,
  },
  hero: {
    marginTop: 24,
    marginBottom: 24,
  },
  title: {
    fontSize: 34,
    fontWeight: '600',
    color: '#A4ECF5',
    letterSpacing: 2.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#79C9E3',
    letterSpacing: 2.4,
    textAlign: 'center',
    marginTop: 12,
  },
  detail: {
    fontSize: 15,
    color: '#A2B6CD',
    textAlign: 'center',
    marginTop: 24,
  },
});
