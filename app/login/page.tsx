"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<main style={{ maxWidth: 440, margin: "0 auto", padding: 32 }}>Loading...</main>}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const em = email.trim().toLowerCase();
    if (!em) return setMessage("Please enter your email.");
    if (!password) return setMessage("Please enter your password.");

    setBusy(true);
    try {
      const supabase = createSupabaseBrowser();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: em,
        password,
      });
      if (error) {
        setMessage(error.message);
        return;
      }

      const userId = data.user?.id;
      if (userId) {
        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("must_change_password")
          .eq("id", userId)
          .maybeSingle();
        if (profileErr) {
          console.error("Failed to check must_change_password:", profileErr);
        }
        if (profile?.must_change_password === true) {
          router.replace(`/change-password?next=${encodeURIComponent(next)}`);
          return;
        }
      }

      router.replace(next);
    } finally {
      setBusy(false);
    }
  }

  async function onForgotPassword() {
    setMessage(null);
    const em = email.trim().toLowerCase();
    if (!em) {
      setMessage("Enter your email first, then click Forgot password.");
      return;
    }

    setResetBusy(true);
    try {
      const supabase = createSupabaseBrowser();
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo });
      if (error) {
        setMessage(error.message);
        return;
      }
      setMessage("Password reset email sent. Check your inbox.");
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 440, margin: "0 auto", padding: 32 }}>
      <h1 style={{ marginBottom: 8 }}>Sign in</h1>
      <div style={{ opacity: 0.75, marginBottom: 18 }}>
        Use your company login to access the app.
      </div>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <div>
          <div style={labelStyle}>Email</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            autoComplete="email"
            inputMode="email"
            style={inputStyle}
          />
        </div>

        <div>
          <div style={labelStyle}>Password</div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            autoComplete="current-password"
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
          {busy ? "Signing in..." : "Sign in"}
        </button>

        <button
          type="button"
          onClick={onForgotPassword}
          disabled={resetBusy || busy}
          style={secondaryButtonStyle}
        >
          {resetBusy ? "Sending reset..." : "Forgot password?"}
        </button>

        <div style={{ fontSize: 12, opacity: 0.65, lineHeight: 1.4 }}>
          First login users should use the temporary password provided by admin,
          then you will be asked to change it.
        </div>
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

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "transparent",
  color: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};
