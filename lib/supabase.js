// lib/supabase.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
// ⚠️ Service role key should ONLY be used in server-side code.

export const supabase = createClient(supabaseUrl, supabaseKey);
