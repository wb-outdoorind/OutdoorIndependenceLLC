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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
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

    setBusy(true);
    try {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.signInWithPassword({
        email: em,
        password,
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      router.replace(next);
    } finally {
      setBusy(false);
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
