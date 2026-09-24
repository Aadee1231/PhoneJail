import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Client for the shared `aadee-platform` Supabase project.
 *
 * The client authenticates with the user's Clerk session token (Supabase
 * third-party auth integration) so every request is authorized by the Clerk
 * identity. Only the publishable anon key ships in the bundle — the
 * service-role key must never be added here.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_AADEE_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_AADEE_SUPABASE_ANON_KEY;

export const aadeeSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClient | null = null;

export function getAadeeSupabase(getToken: () => Promise<string | null>): SupabaseClient | null {
  if (!aadeeSupabaseConfigured) return null;
  if (!client) {
    client = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      accessToken: async () => getToken(),
    });
  }
  return client;
}
