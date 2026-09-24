import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth, useUser } from '@clerk/expo';
import { useState } from 'react';

/**
 * Minimal Aadee Account summary: avatar, name, email, and sign-out.
 * Signing out ends the Clerk session locally; it does not delete the
 * Clerk account or the central aadee-platform user row.
 */
export function AccountCard() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;

  const name = user.fullName ?? [user.firstName, user.lastName].filter(Boolean).join(' ') ?? null;
  const email = user.primaryEmailAddress?.emailAddress ?? null;

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      if (__DEV__) console.warn('[Auth] signOut failed', error);
      setSigningOut(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.sectionLabel}>Aadee Account</Text>
      <View style={styles.row}>
        {user.imageUrl ? (
          <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>
              {(name ?? email ?? 'A').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.identity}>
          {name ? <Text style={styles.name} numberOfLines={1}>{name}</Text> : null}
          {email ? (
            <Text style={styles.email} numberOfLines={1}>
              {email}
            </Text>
          ) : null}
        </View>
      </View>

      <Pressable
        onPress={handleSignOut}
        disabled={signingOut}
        style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed, signingOut && styles.dimmed]}
      >
        {signingOut ? (
          <ActivityIndicator color="#ff8fa3" />
        ) : (
          <Text style={styles.signOutText}>Sign Out</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#16161f',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#232332',
    marginBottom: 16,
  },
  sectionLabel: {
    color: '#8a8a9e',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarFallback: {
    backgroundColor: '#2E9DFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  identity: {
    flex: 1,
  },
  name: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  email: {
    color: '#8a8a9e',
    fontSize: 13,
    fontWeight: '600',
  },
  signOutButton: {
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,122,144,0.35)',
    backgroundColor: 'rgba(255,122,144,0.08)',
  },
  signOutText: {
    color: '#ff8fa3',
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
  dimmed: {
    opacity: 0.5,
  },
});
