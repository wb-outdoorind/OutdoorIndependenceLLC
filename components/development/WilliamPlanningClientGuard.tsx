"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { isWilliamPlanningUser } from "@/lib/williamPlanningAccess";

type WilliamPlanningClientGuardProps = {
  children: React.ReactNode;
  nextPath: string;
  initialAllowed?: boolean;
};

export default function WilliamPlanningClientGuard({
  children,
  nextPath,
  initialAllowed = false,
}: WilliamPlanningClientGuardProps) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(initialAllowed);

  useEffect(() => {
    let active = true;

    void (async () => {
      const supabase = createSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();

      if (!active) return;
      if (!authData.user) {
        setAllowed(false);
        router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (!active) return;
      const permitted = isWilliamPlanningUser(profile, authData.user);
      setAllowed(permitted);

      if (!permitted) {
        router.replace("/not-authorized?reason=william_only_future_platform_lab&next=/settings");
      }
    })();

    return () => {
      active = false;
    };
  }, [nextPath, router]);

  if (!allowed) {
    return (
      <div style={{ maxWidth: 980, margin: "0 auto", paddingBottom: 32 }}>
        <section
          style={{
            border: "1px solid var(--surface-border)",
            borderRadius: 18,
            background: "var(--surface)",
            padding: 24,
          }}
        >
          <h1 style={{ marginTop: 0, marginBottom: 8 }}>Future Platform Lab</h1>
          <div style={{ opacity: 0.74 }}>Verifying access...</div>
        </section>
      </div>
    );
  }

  return <>{children}</>;
}
