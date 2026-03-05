import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://agdyqrwwfbamgasovaxf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnZHlxcnd3ZmJhbWdhc292YXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5Njc1NjYsImV4cCI6MjA4NjU0MzU2Nn0.oIRoElFgClBC0jRwJF4dmwvBTka8mhEsQgEBfLdE8DA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
