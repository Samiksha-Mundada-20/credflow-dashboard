// src/lib/supabase.ts
// Single Supabase client instance shared across the entire dashboard.
// Import this wherever you need Supabase — never create a second client.

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// createClient is safe to call at module level — it does not make network
// requests until you call a method on it.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
