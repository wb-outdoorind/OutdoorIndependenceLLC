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

  const canViewAs = canUseRoleView(actualRole);

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
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authData.user.id)
          .maybeSingle();
        if (!active) return;
        const nextRole = (profile?.role as string | undefined) ?? "employee";
        if (!canUseRoleView(nextRole)) {
          writeRoleViewOverride(null);
        }
        setActualRole(nextRole);
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
    setSavedMessage("Saved.");
    window.setTimeout(() => setSavedMessage(""), 1200);
  }

  function applyRoleView(nextRole: AppRole | null) {
    setViewAsRole(nextRole);
    writeRoleViewOverride(nextRole);
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
