"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import LogoutButton from "@/app/logout-button";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import DevelopmentSectionCard from "@/components/development/DevelopmentSectionCard";
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
import { isWilliamPlanningUser } from "@/lib/williamPlanningAccess";

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

type NotificationPrefsState = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  queueEventsEnabled: boolean;
};

function deriveInitials(nameOrEmail: string) {
  const normalized = nameOrEmail.trim();
  if (!normalized) return "U";
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return normalized.slice(0, 1).toUpperCase();
}

export default function SettingsPage() {
  const [theme, setTheme] = useState<AppTheme>(() => readTheme());
  const [textSize, setTextSize] = useState<AppTextSize>(() => readTextSize());
  const [savedMessage, setSavedMessage] = useState("");
  const [actualRole, setActualRole] = useState<string | null>(null);
  const [viewAsRole, setViewAsRole] = useState<AppRole | null>(() => readRoleViewOverride());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [canAccessDevelopment, setCanAccessDevelopment] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [displayEmail, setDisplayEmail] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefsState>({
    emailEnabled: true,
    smsEnabled: false,
    queueEventsEnabled: true,
  });
  const [notificationPrefsBusy, setNotificationPrefsBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

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
          setCanAccessDevelopment(false);
          return;
        }
        setCurrentUserId(authData.user.id);
        setCanAccessDevelopment(isWilliamPlanningUser(null, authData.user));
        const { data: profile } = await supabase
          .from("profiles")
          .select("role,full_name,first_name,last_name,nickname,email")
          .eq("id", authData.user.id)
          .maybeSingle();
        if (!active) return;
        const nextRole = (profile?.role as string | undefined) ?? "employee";
        const nickname =
          typeof profile?.nickname === "string" ? profile.nickname.trim() : "";
        const firstName =
          typeof profile?.first_name === "string" ? profile.first_name.trim() : "";
        const lastName =
          typeof profile?.last_name === "string" ? profile.last_name.trim() : "";
        const fullName =
          typeof profile?.full_name === "string" ? profile.full_name.trim() : "";
        const preferredName =
          nickname || [firstName, lastName].filter(Boolean).join(" ").trim() || fullName;
        setDisplayName(
          preferredName
        );
        setDisplayEmail(
          (typeof profile?.email === "string" ? profile.email : authData.user.email || "").trim()
        );
        setCanAccessDevelopment(isWilliamPlanningUser(profile, authData.user));
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
          .select("theme,text_size,role_view_override,profile_photo_path")
          .eq("user_id", authData.user.id)
          .maybeSingle();
        if (!active) return;
        if (prefs) {
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
        }

        const { data: notificationPrefsRow } = await supabase
          .from("user_notification_prefs")
          .select("email_enabled,sms_enabled,queue_events_enabled")
          .eq("user_id", authData.user.id)
          .maybeSingle();
        if (!active) return;
        setNotificationPrefs({
          emailEnabled: notificationPrefsRow?.email_enabled ?? true,
          smsEnabled: notificationPrefsRow?.sms_enabled ?? false,
          queueEventsEnabled: notificationPrefsRow?.queue_events_enabled ?? true,
        });

        const photoRes = await fetch("/api/account/profile-photo", { method: "GET" });
        if (!active) return;
        if (photoRes.ok) {
          const photoJson = (await photoRes.json().catch(() => ({}))) as { url?: string | null };
          setProfilePhotoUrl(typeof photoJson.url === "string" ? photoJson.url : null);
        }
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

  async function refreshProfilePhotoUrl() {
    const res = await fetch("/api/account/profile-photo", { method: "GET" });
    const json = (await res.json().catch(() => ({}))) as { url?: string | null; error?: string };
    if (!res.ok) throw new Error(json.error || "Failed to load profile photo.");
    setProfilePhotoUrl(typeof json.url === "string" ? json.url : null);
  }

  async function uploadProfilePhoto(file: File) {
    setPhotoBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/account/profile-photo", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string | null; error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to upload profile photo.");
      setProfilePhotoUrl(typeof json.url === "string" ? json.url : null);
      setSavedMessage("Profile photo updated.");
      window.setTimeout(() => setSavedMessage(""), 1400);
    } catch (error) {
      setSavedMessage((error as Error).message || "Failed to upload profile photo.");
      window.setTimeout(() => setSavedMessage(""), 2200);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removeProfilePhoto() {
    setPhotoBusy(true);
    try {
      const res = await fetch("/api/account/profile-photo", { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to remove profile photo.");
      await refreshProfilePhotoUrl();
      setSavedMessage("Profile photo removed.");
      window.setTimeout(() => setSavedMessage(""), 1400);
    } catch (error) {
      setSavedMessage((error as Error).message || "Failed to remove profile photo.");
      window.setTimeout(() => setSavedMessage(""), 2200);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function saveNotificationPrefs(next: NotificationPrefsState) {
    if (!currentUserId) return;
    setNotificationPrefsBusy(true);
    setNotificationPrefs(next);
    try {
      const { error } = await createSupabaseBrowser().from("user_notification_prefs").upsert(
        {
          user_id: currentUserId,
          email_enabled: next.emailEnabled,
          sms_enabled: next.smsEnabled,
          queue_events_enabled: next.queueEventsEnabled,
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      setSavedMessage("Saved.");
      window.setTimeout(() => setSavedMessage(""), 1200);
    } catch (error) {
      setSavedMessage((error as Error).message || "Failed to save notification preferences.");
      window.setTimeout(() => setSavedMessage(""), 2200);
    } finally {
      setNotificationPrefsBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 780, margin: "0 auto", paddingBottom: 24 }}>
      <h1 style={{ marginBottom: 8 }}>Settings</h1>
      <div style={{ opacity: 0.75, marginBottom: 16 }}>
        Personal app preferences for readability and appearance.
      </div>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0, marginBottom: 12 }}>Profile</h2>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "120px minmax(0,1fr)" }}>
          <div
            style={{
              width: 120,
              height: 120,
              position: "relative",
              borderRadius: 999,
              overflow: "hidden",
              border: "1px solid var(--surface-border)",
              background: "rgba(255,255,255,0.05)",
              display: "grid",
              placeItems: "center",
              fontSize: 28,
              fontWeight: 900,
            }}
          >
            {profilePhotoUrl ? (
              <Image
                src={profilePhotoUrl}
                alt="Profile"
                unoptimized
                fill
                sizes="120px"
                style={{ objectFit: "cover" }}
              />
            ) : (
              <span>{deriveInitials(displayName || displayEmail || "U")}</span>
            )}
          </div>
          <div>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>{displayName || "Your account"}</div>
            <div style={{ opacity: 0.72, marginBottom: 10 }}>{displayEmail || "No email on file"}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                style={linkButtonStyle}
                onClick={() => photoInputRef.current?.click()}
                disabled={photoBusy}
              >
                {profilePhotoUrl ? "Replace Photo" : "Upload Photo"}
              </button>
              <button
                type="button"
                style={linkButtonStyle}
                onClick={() => void removeProfilePhoto()}
                disabled={photoBusy || !profilePhotoUrl}
              >
                Remove Photo
              </button>
            </div>
            <div style={{ opacity: 0.7, fontSize: 12, marginTop: 8 }}>
              Use JPG, PNG, WEBP, or HEIC. Max 6MB.
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0] ?? null;
                if (file) {
                  void uploadProfilePhoto(file);
                }
                e.currentTarget.value = "";
              }}
            />
          </div>
        </div>
      </section>

      <section style={{ ...cardStyle, marginTop: 14 }}>
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

      <section style={{ ...cardStyle, marginTop: 14 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12 }}>Notification Preferences</h2>
        <div style={{ opacity: 0.78, marginBottom: 10 }}>
          Control how you receive operational alerts and queue events.
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <label style={toggleRowStyle}>
            <input
              type="checkbox"
              checked={notificationPrefs.emailEnabled}
              disabled={notificationPrefsBusy}
              onChange={(e) =>
                void saveNotificationPrefs({
                  ...notificationPrefs,
                  emailEnabled: e.target.checked,
                })
              }
            />
            <span>Email alerts</span>
          </label>
          <label style={toggleRowStyle}>
            <input
              type="checkbox"
              checked={notificationPrefs.smsEnabled}
              disabled={notificationPrefsBusy}
              onChange={(e) =>
                void saveNotificationPrefs({
                  ...notificationPrefs,
                  smsEnabled: e.target.checked,
                })
              }
            />
            <span>SMS alerts</span>
          </label>
          <label style={toggleRowStyle}>
            <input
              type="checkbox"
              checked={notificationPrefs.queueEventsEnabled}
              disabled={notificationPrefsBusy}
              onChange={(e) =>
                void saveNotificationPrefs({
                  ...notificationPrefs,
                  queueEventsEnabled: e.target.checked,
                })
              }
            />
            <span>Queue event notifications</span>
          </label>
        </div>
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

      {canAccessDevelopment ? (
        <section style={{ ...cardStyle, marginTop: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <h2 style={{ marginTop: 0, marginBottom: 6 }}>Development</h2>
              <div style={{ opacity: 0.78 }}>
                Private planning area for future platform / SaaS strategy.
              </div>
            </div>

            <Link href="/settings/development/future-platform" style={linkButtonStyle}>
              Open
            </Link>
          </div>

          <DevelopmentSectionCard
            title="Future Platform Lab"
            description="William-only control panel for auditing current modules, mapping future workflows, and planning the app’s evolution into a SaaS platform."
            href="/settings/development/future-platform"
          />
        </section>
      ) : null}

      <section style={{ ...cardStyle, marginTop: 14 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12 }}>Account</h2>
        <div style={{ opacity: 0.78, marginBottom: 10 }}>
          Manage password and sign out from this device.
        </div>
        <div style={{ marginBottom: 10 }}>
          <a href="/change-password" style={linkButtonStyle}>
            Change Password
          </a>
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

const toggleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 0",
};
