import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Set in .env / app config: EXPO_PUBLIC_* vars are safe to embed (anon key
// is public by design; RLS is the security boundary).
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://YOUR-PROJECT.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'YOUR-ANON-KEY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
