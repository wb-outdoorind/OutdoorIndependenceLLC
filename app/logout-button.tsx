"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowser } from "../lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      const supabase = createSupabaseBrowser();
      await supabase.auth.signOut();
      router.replace("/login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={logout} disabled={busy} style={buttonStyle}>
      {busy ? "Signing out..." : "Log out"}
    </button>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontWeight: 800,
  cursor: "pointer",
};
