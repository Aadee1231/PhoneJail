import { useEffect, useRef } from 'react';
import { useAuth, useUser } from '@clerk/expo';
import { getAadeeSupabase } from '../lib/aadeeSupabase';

/**
 * Ensures the signed-in Clerk user exists in the central aadee-platform
 * `users` table. Uses an upsert keyed on `clerk_user_id` — the canonical
 * shared identity across Aadee products — so repeat sign-ins never create
 * duplicate rows.
 *
 * Sync failures (e.g. the Supabase Clerk third-party integration or RLS
 * policies not yet configured) never block the app; they are logged for
 * diagnosis and retried on the next app launch.
 */
export function useUserSync() {
  const { getToken, isSignedIn } = useAuth();
  const { isLoaded, user } = useUser();
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    if (syncedFor.current === user.id) return;
    syncedFor.current = user.id;

    const supabase = getAadeeSupabase(getToken);
    if (!supabase) {
      if (__DEV__) {
        console.warn(
          '[AadeeSync] Skipped — EXPO_PUBLIC_AADEE_SUPABASE_URL / EXPO_PUBLIC_AADEE_SUPABASE_ANON_KEY not set',
        );
      }
      return;
    }

    const displayName =
      user.fullName ?? [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ?? null;

    void (async () => {
      try {
        const { error } = await supabase.from('users').upsert(
          {
            clerk_user_id: user.id,
            email: user.primaryEmailAddress?.emailAddress ?? null,
            display_name: displayName || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'clerk_user_id' },
        );
        if (error && __DEV__) {
          console.warn('[AadeeSync] User upsert failed', error.message);
        }
      } catch (error) {
        if (__DEV__) console.warn('[AadeeSync] User upsert threw', error);
      }
    })();
  }, [isLoaded, isSignedIn, user?.id, getToken]);
}
