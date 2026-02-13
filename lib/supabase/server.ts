// lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Server-side Supabase client (cookie-based).
 * Use this in Server Components / Route Handlers when you need a Supabase client.
 */
export async function createServerSupabase() {
  // ✅ cookies() is async in newer Next versions
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // In Server Components, setting cookies may throw; middleware/proxy handles refresh.
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // no-op
          }
        },
      },
    }
  );
}

/**
 * Returns the current authed user + their profile row (or null if not logged in).
 * This is your primary helper for role checks on server pages.
 */
export async function getCurrentUserProfile() {
  const supabase = await createServerSupabase();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes?.user) return null;

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userRes.user.id)
    .single();

  // If profile missing (or blocked by RLS), treat as not logged in for safety
  if (profileErr || !profile) return { user: userRes.user, profile: null };

  return { user: userRes.user, profile };
}
