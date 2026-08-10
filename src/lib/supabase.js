import { createClient } from '@supabase/supabase-js'
import { validatePublicSupabaseConfig } from '../config/runtimeConfig'

const { supabaseUrl, publishableKey } = validatePublicSupabaseConfig({
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
})

export const supabase = createClient(supabaseUrl, publishableKey)
