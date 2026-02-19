// app/login/page.tsx
"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
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

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // If already logged in, bounce to next
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
    if (mode === "signup" && !confirmPassword) {
      return setMessage("Please confirm your password.");
    }
    if (mode === "signup" && password !== confirmPassword) {
      return setMessage("Passwords do not match.");
    }

    setBusy(true);
    try {
      const supabase = createSupabaseBrowser();
      if (mode === "signup") {
        const emailRedirectTo =
          typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
        const { error } = await supabase.auth.signUp({
          email: em,
          password,
          options: { emailRedirectTo },
        });
        if (error) {
          setMessage(error.message);
          return;
        }
        setMessage("Sign-up email sent. Check your inbox to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: em,
          password,
        });
        if (error) {
          setMessage(error.message);
          return;
        }
        router.replace(next);
      }
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
      <h1 style={{ marginBottom: 8 }}>{mode === "signup" ? "Sign up" : "Sign in"}</h1>
      <div style={{ opacity: 0.75, marginBottom: 18 }}>
        {mode === "signup"
          ? "Create your account, then confirm from the email link."
          : "Use your company login to access the app."}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setMode("signin")}
          style={mode === "signin" ? activeModeButtonStyle : modeButtonStyle}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          style={mode === "signup" ? activeModeButtonStyle : modeButtonStyle}
        >
          Sign up
        </button>
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

        {mode === "signup" ? (
          <div>
            <div style={labelStyle}>Confirm Password</div>
            <input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              type="password"
              autoComplete="new-password"
              style={inputStyle}
            />
          </div>
        ) : null}

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
          {busy ? (mode === "signup" ? "Creating account..." : "Signing in...") : mode === "signup" ? "Create account" : "Sign in"}
        </button>

        {mode === "signin" ? (
          <button
            type="button"
            onClick={onForgotPassword}
            disabled={resetBusy || busy}
            style={secondaryButtonStyle}
          >
            {resetBusy ? "Sending reset..." : "Forgot password?"}
          </button>
        ) : null}

        <div style={{ fontSize: 12, opacity: 0.65, lineHeight: 1.4 }}>
          Tip: On phones, you should stay signed in unless the browser clears site
          data or you log out.
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

const modeButtonStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};

const activeModeButtonStyle: React.CSSProperties = {
  ...modeButtonStyle,
  background: "rgba(255,255,255,0.1)",
  border: "1px solid rgba(255,255,255,0.28)",
};
