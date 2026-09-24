import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@clerk/expo';
import { AuthScreen } from './AuthScreen';
import { useUserSync } from './useUserSync';

/**
 * Gates the app on Aadee Account auth:
 * - Clerk still resolving the persisted session → branded splash
 * - signed out → auth onboarding
 * - signed in → the app + a one-shot central-user sync
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  useUserSync();

  if (!isLoaded) {
    return (
      <View style={styles.splash}>
        <StatusBar style="light" />
        <View style={styles.brandDot} />
        <Text style={styles.brand}>PhoneJail</Text>
        <ActivityIndicator style={styles.spinner} color="#2E9DFF" />
      </View>
    );
  }

  if (!isSignedIn) {
    return (
      <View style={styles.splash}>
        <StatusBar style="light" />
        <AuthScreen />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#060c16',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2E9DFF',
    shadowColor: '#2E9DFF',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    marginBottom: 14,
  },
  brand: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8A9CB0',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 28,
  },
  spinner: {
    position: 'absolute',
    bottom: 80,
  },
});
