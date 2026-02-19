"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";

const ALLOWED_PATHS = ["/login", "/change-password", "/auth/callback"];

export default function MustChangePasswordGate() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let active = true;

    async function run() {
      if (!pathname || ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
        return;
      }

      const supabase = createSupabaseBrowser();
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (!active || authErr || !authData.user) return;

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (!active || profileErr) return;

      if (profile?.must_change_password === true) {
        router.replace(`/change-password?next=${encodeURIComponent(pathname)}`);
      }
    }

    void run();
    return () => {
      active = false;
    };
  }, [pathname, router]);

  return null;
}
