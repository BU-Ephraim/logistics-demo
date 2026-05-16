import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

declare global {
  var __deliverTrackSupabase__: SupabaseClient<Database> | undefined;
}

function createBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getSupabaseBrowserClient() {
  if (typeof window === "undefined") {
    throw new Error("Supabase browser client can only be used in the browser.");
  }

  if (!globalThis.__deliverTrackSupabase__) {
    globalThis.__deliverTrackSupabase__ = createBrowserClient();
  }

  return globalThis.__deliverTrackSupabase__;
}