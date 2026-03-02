"use client";

import { useEffect, useState } from "react";
import LogoutButton from "@/app/logout-button";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import {
  AppTextSize,
  AppTheme,
  applyPreferences,
  readTextSize,
  readTheme,
  saveTextSize,
  saveTheme,
} from "@/components/AppPreferences";
import {
  AppRole,
  canUseRoleView,
  readRoleViewOverride,
  roleLabel,
  writeRoleViewOverride,
} from "@/lib/roleView";

const VIEWABLE_ROLES: AppRole[] = [
  "owner",
  "operations_manager",
  "office_admin",
  "mechanic",
  "team_lead_1",
  "team_lead_2",
  "team_member_1",
  "team_member_2",
  "apprentice",
  "employee",
];

export default function SettingsPage() {
  const [theme, setTheme] = useState<AppTheme>(() => readTheme());
  const [textSize, setTextSize] = useState<AppTextSize>(() => readTextSize());
  const [savedMessage, setSavedMessage] = useState("");
  const [actualRole, setActualRole] = useState<string | null>(null);
  const [viewAsRole, setViewAsRole] = useState<AppRole | null>(() => readRoleViewOverride());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const canViewAs = canUseRoleView(actualRole);
  const canViewRunbook =
    actualRole === "owner" ||
    actualRole === "operations_manager" ||
    actualRole === "office_admin";

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        const supabase = createSupabaseBrowser();
        const { data: authData } = await supabase.auth.getUser();
        if (!active) return;
        if (!authData.user) {
          setActualRole("employee");
          return;
        }
        setCurrentUserId(authData.user.id);
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authData.user.id)
          .maybeSingle();
        if (!active) return;
        const nextRole = (profile?.role as string | undefined) ?? "employee";
        if (!canUseRoleView(nextRole)) {
          writeRoleViewOverride(null);
          void supabase
            .from("user_ui_preferences")
            .upsert(
              {
                user_id: authData.user.id,
                role_view_override: null,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id" }
            );
        }
        setActualRole(nextRole);

        const { data: prefs } = await supabase
          .from("user_ui_preferences")
          .select("theme,text_size,role_view_override")
          .eq("user_id", authData.user.id)
          .maybeSingle();
        if (!active || !prefs) return;

        const nextTheme = prefs.theme === "light" ? "light" : "dark";
        const nextTextSize: AppTextSize =
          prefs.text_size === "sm" || prefs.text_size === "md" || prefs.text_size === "lg"
            ? prefs.text_size
            : "md";
        setTheme(nextTheme);
        setTextSize(nextTextSize);
        saveTheme(nextTheme);
        saveTextSize(nextTextSize);
        applyPreferences(nextTheme, nextTextSize);

        const dbRoleView =
          (prefs.role_view_override as AppRole | null | undefined) ?? null;
        setViewAsRole(dbRoleView);
        writeRoleViewOverride(dbRoleView);
      })();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  function applyAndSave(nextTheme: AppTheme, nextTextSize: AppTextSize) {
    setTheme(nextTheme);
    setTextSize(nextTextSize);
    saveTheme(nextTheme);
    saveTextSize(nextTextSize);
    applyPreferences(nextTheme, nextTextSize);
    if (currentUserId) {
      void createSupabaseBrowser().from("user_ui_preferences").upsert(
        {
          user_id: currentUserId,
          theme: nextTheme,
          text_size: nextTextSize,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    }
    setSavedMessage("Saved.");
    window.setTimeout(() => setSavedMessage(""), 1200);
  }

  function applyRoleView(nextRole: AppRole | null) {
    setViewAsRole(nextRole);
    writeRoleViewOverride(nextRole);
    if (currentUserId) {
      void createSupabaseBrowser().from("user_ui_preferences").upsert(
        {
          user_id: currentUserId,
          role_view_override: nextRole,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    }
    setSavedMessage("Saved.");
    window.setTimeout(() => setSavedMessage(""), 1200);
  }

  return (
    <main style={{ maxWidth: 780, margin: "0 auto", paddingBottom: 24 }}>
      <h1 style={{ marginBottom: 8 }}>Settings</h1>
      <div style={{ opacity: 0.75, marginBottom: 16 }}>
        Personal app preferences for readability and appearance.
      </div>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0, marginBottom: 12 }}>Appearance</h2>
        <div style={gridStyle}>
          <Field label="Theme">
            <select
              value={theme}
              onChange={(e) => applyAndSave(e.target.value as AppTheme, textSize)}
              style={inputStyle}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </Field>

          <Field label="Text size">
            <select
              value={textSize}
              onChange={(e) => applyAndSave(theme, e.target.value as AppTextSize)}
              style={inputStyle}
            >
              <option value="sm">Small</option>
              <option value="md">Medium</option>
              <option value="lg">Large</option>
            </select>
          </Field>
        </div>
        {savedMessage ? <div style={{ marginTop: 10, opacity: 0.8 }}>{savedMessage}</div> : null}
      </section>

      {canViewAs ? (
        <section style={{ ...cardStyle, marginTop: 14 }}>
          <h2 style={{ marginTop: 0, marginBottom: 12 }}>Role View</h2>
          <div style={{ opacity: 0.78, marginBottom: 10 }}>
            Preview the app as another role without changing permissions or database access.
          </div>
          <div style={gridStyle}>
            <Field label="Actual role">
              <div style={inputStyle}>{roleLabel(actualRole)}</div>
            </Field>
            <Field label="View as">
              <select
                value={viewAsRole ?? ""}
                onChange={(e) => applyRoleView((e.target.value || null) as AppRole | null)}
                style={inputStyle}
              >
                <option value="">Actual role</option>
                {VIEWABLE_ROLES.map((role) => (
                  <option key={`view-as-${role}`} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>
      ) : null}

      <section style={{ ...cardStyle, marginTop: 14 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12 }}>Account</h2>
        <div style={{ opacity: 0.78, marginBottom: 10 }}>
          Sign out from this device.
        </div>
        <LogoutButton />
      </section>

      <section style={{ ...cardStyle, marginTop: 14 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12 }}>Legal</h2>
        <div style={{ opacity: 0.78, marginBottom: 10 }}>
          Privacy, terms, and support links for web and App Store review.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href="https://outdoorind.org/privacy" target="_blank" rel="noreferrer" style={linkButtonStyle}>
            Privacy Policy
          </a>
          <a href="https://outdoorind.org/terms" target="_blank" rel="noreferrer" style={linkButtonStyle}>
            Terms of Use
          </a>
          <a href="mailto:alerts@outdoorind.org" style={linkButtonStyle}>
            Support Contact
          </a>
        </div>
      </section>

      {canViewRunbook ? (
        <section style={{ ...cardStyle, marginTop: 14 }}>
          <h2 style={{ marginTop: 0, marginBottom: 12 }}>Deployment Runbook</h2>
          <div style={{ opacity: 0.78, marginBottom: 10 }}>
            Web + iOS release checklist used for production deployments.
          </div>
          <a
            href="https://github.com/wb-outdoorind/OutdoorIndependenceLLC/blob/main/docs/deploy.md"
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-block",
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid var(--surface-border)",
              background: "var(--surface)",
              color: "inherit",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Open Runbook
          </a>
        </section>
      ) : null}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, opacity: 0.74, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--surface-border)",
  borderRadius: 16,
  padding: 16,
  background: "var(--surface)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 12,
  border: "1px solid var(--surface-border)",
  background: "var(--surface)",
  color: "inherit",
};

const linkButtonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid var(--surface-border)",
  background: "var(--surface)",
  color: "inherit",
  textDecoration: "none",
  fontWeight: 700,
};
