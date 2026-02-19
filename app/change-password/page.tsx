"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<main style={{ maxWidth: 440, margin: "0 auto", padding: 32 }}>Loading...</main>}>
      <ChangePasswordPageContent />
    </Suspense>
  );
}

function ChangePasswordPageContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!password || password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createSupabaseBrowser();
      const { error: passwordErr } = await supabase.auth.updateUser({ password });
      if (passwordErr) {
        setMessage(passwordErr.message);
        return;
      }

      const res = await fetch("/api/auth/complete-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const text = await res.text();
        setMessage(text || "Password updated, but failed to finalize onboarding.");
        return;
      }

      router.replace(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 440, margin: "0 auto", padding: 32 }}>
      <h1 style={{ marginBottom: 8 }}>Change Password</h1>
      <div style={{ opacity: 0.75, marginBottom: 18 }}>
        First login detected. Set a new password to continue.
      </div>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <div>
          <div style={labelStyle}>New Password</div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            type="password"
            autoComplete="new-password"
            style={inputStyle}
          />
        </div>

        <div>
          <div style={labelStyle}>Confirm Password</div>
          <input
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            type="password"
            autoComplete="new-password"
            style={inputStyle}
          />
        </div>

        {message ? (
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.04)",
              padding: 10,
              borderRadius: 12,
              fontSize: 13,
              opacity: 0.95,
            }}
          >
            {message}
          </div>
        ) : null}

        <button disabled={busy} type="submit" style={buttonStyle}>
          {busy ? "Saving..." : "Save New Password"}
        </button>
      </form>
    </main>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.75,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontWeight: 900,
  cursor: "pointer",
};
