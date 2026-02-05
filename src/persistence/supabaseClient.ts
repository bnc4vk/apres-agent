import { createClient } from "@supabase/supabase-js";
import { appConfig } from "../config/appConfig";

export const supabaseAdmin = createClient(appConfig.supabaseUrl, appConfig.supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
