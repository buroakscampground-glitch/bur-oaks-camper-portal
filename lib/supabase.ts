import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mzywctpxnpejglnspyqi.supabase.co'

const supabaseAnonKey =
  'sb_publishable_ksynp497bY8X4MJ-NlRtgg_qYnwMAGv'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)