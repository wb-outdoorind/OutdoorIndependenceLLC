"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type RecipientRow = {
  profile_id: string;
  is_enabled: boolean;
  created_at: string;
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
  } | null;
};

type ProfileOption = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
  };
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.03)",
    color: "inherit",
  };
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function InventoryAlertsClient() {
  const [rows, setRows] = useState<RecipientRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerBusy, setPickerBusy] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedProfileIds), [selectedProfileIds]);
  const recipientIds = useMemo(() => new Set(rows.map((r) => r.profile_id)), [rows]);

  const filteredProfiles = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    const base = profiles.filter((p) => !recipientIds.has(p.id));
    if (!q) return base;

    return base.filter((p) => {
      const hay = [p.full_name ?? "", p.email ?? "", p.role ?? ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [pickerSearch, profiles, recipientIds]);

  async function loadData() {
    const supabase = createSupabaseBrowser();
    setLoading(true);
    setErrorMessage(null);

    const [recipientsRes, profilesRes] = await Promise.all([
      supabase
        .from("inventory_alert_recipients")
        .select("profile_id,is_enabled,created_at,profiles!inner(id,full_name,email,role)")
        .order("created_at", { ascending: true }),
      supabase
        .from("profiles")
        .select("id,full_name,email,role")
        .order("full_name", { ascending: true }),
    ]);

    if (recipientsRes.error || profilesRes.error) {
      console.error("[inventory-alerts] load error:", {
        recipientsError: recipientsRes.error,
        profilesError: profilesRes.error,
      });
      setErrorMessage(recipientsRes.error?.message || profilesRes.error?.message || "Failed to load recipients.");
      setRows([]);
      setProfiles([]);
      setLoading(false);
      return;
    }

    const rawRows = (recipientsRes.data ?? []) as unknown[];
    const nextRows: RecipientRow[] = rawRows.map((entry) => {
      const row = entry as {
        profile_id: string;
        is_enabled: boolean;
        created_at: string;
        profiles: ProfileOption[] | ProfileOption | null;
      };
      const profile = Array.isArray(row.profiles) ? (row.profiles[0] ?? null) : row.profiles;
      return {
        profile_id: row.profile_id,
        is_enabled: row.is_enabled,
        created_at: row.created_at,
        profile,
      };
    });

    setRows(nextRows);
    setProfiles((profilesRes.data ?? []) as ProfileOption[]);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function onToggle(row: RecipientRow) {
    setBusyId(row.profile_id);

    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("inventory_alert_recipients")
      .update({ is_enabled: !row.is_enabled })
      .eq("profile_id", row.profile_id);

    if (error) {
      console.error("[inventory-alerts] toggle error:", error);
      alert(error.message || "Failed to update recipient.");
      setBusyId(null);
      return;
    }

    await loadData();
    setBusyId(null);
  }

  async function onRemove(row: RecipientRow) {
    const nameOrEmail = row.profile?.full_name || row.profile?.email || row.profile_id;
    const confirmed = window.confirm(`Remove ${nameOrEmail} from alerts?`);
    if (!confirmed) return;

    setBusyId(row.profile_id);

    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("inventory_alert_recipients")
      .delete()
      .eq("profile_id", row.profile_id);

    if (error) {
      console.error("[inventory-alerts] remove error:", error);
      alert(error.message || "Failed to remove recipient.");
      setBusyId(null);
      return;
    }

    await loadData();
    setBusyId(null);
  }

  function openPicker() {
    setPickerError(null);
    setPickerSearch("");
    setSelectedProfileIds([]);
    setShowPicker(true);
  }

  function toggleSelect(profileId: string) {
    setSelectedProfileIds((prev) => {
      if (prev.includes(profileId)) return prev.filter((id) => id !== profileId);
      return [...prev, profileId];
    });
  }

  async function onConfirmAddRecipients() {
    if (selectedProfileIds.length === 0) {
      setPickerError("Select at least one employee.");
      return;
    }

    setPickerBusy(true);
    setPickerError(null);

    const supabase = createSupabaseBrowser();
    const payload = selectedProfileIds.map((profileId) => ({ profile_id: profileId, is_enabled: true }));

    const { error } = await supabase
      .from("inventory_alert_recipients")
      .upsert(payload, { onConflict: "profile_id" });

    if (error) {
      console.error("[inventory-alerts] add recipients error:", error);
      setPickerError(error.message || "Failed to add recipients.");
      setPickerBusy(false);
      return;
    }

    setShowPicker(false);
    setPickerBusy(false);
    await loadData();
  }

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>Inventory Alert Recipients</h1>
      <div style={{ opacity: 0.75 }}>Manage employee recipients for low-stock inventory emails.</div>

      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Recipients</div>
          <button type="button" onClick={openPicker} style={buttonStyle}>
            Add Recipients
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          {loading ? (
            <div style={{ opacity: 0.75 }}>Loading recipients...</div>
          ) : errorMessage ? (
            <div style={{ color: "#ff9d9d" }}>{errorMessage}</div>
          ) : rows.length === 0 ? (
            <div style={{ opacity: 0.75 }}>No recipients configured.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {rows.map((row) => (
                <div
                  key={row.profile_id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    padding: 12,
                    background: "rgba(255,255,255,0.02)",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{row.profile?.full_name ?? "(No name)"}</div>
                      <div style={{ opacity: 0.8, fontSize: 13 }}>{row.profile?.email ?? "No email"}</div>
                      <div style={{ opacity: 0.68, fontSize: 12 }}>Role: {row.profile?.role ?? "-"}</div>
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        padding: "3px 10px",
                        borderRadius: 999,
                        border: row.is_enabled
                          ? "1px solid rgba(0,255,120,0.22)"
                          : "1px solid rgba(255,190,100,0.30)",
                        background: row.is_enabled
                          ? "rgba(0,255,120,0.08)"
                          : "rgba(255,190,100,0.10)",
                      }}
                    >
                      {row.is_enabled ? "Enabled" : "Disabled"}
                    </div>
                  </div>

                  <div style={{ opacity: 0.68, fontSize: 12 }}>Added: {formatDateTime(row.created_at)}</div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => void onToggle(row)}
                      style={secondaryButtonStyle}
                      disabled={busyId === row.profile_id}
                    >
                      {row.is_enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onRemove(row)}
                      style={dangerButtonStyle}
                      disabled={busyId === row.profile_id}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showPicker ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 60,
          }}
        >
          <div
            style={{
              width: "min(760px, 100%)",
              maxHeight: "80vh",
              overflow: "auto",
              ...cardStyle(),
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ fontWeight: 900 }}>Add Recipients</div>
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                style={secondaryButtonStyle}
                disabled={pickerBusy}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: 10 }}>
              <input
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search employees by name, email, role"
                style={inputStyle()}
              />
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {filteredProfiles.length === 0 ? (
                <div style={{ opacity: 0.75 }}>No employees available to add.</div>
              ) : (
                filteredProfiles.map((profile) => (
                  <label
                    key={profile.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr",
                      gap: 10,
                      alignItems: "start",
                      padding: 10,
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSet.has(profile.id)}
                      onChange={() => toggleSelect(profile.id)}
                    />
                    <div>
                      <div style={{ fontWeight: 800 }}>{profile.full_name ?? "(No name)"}</div>
                      <div style={{ opacity: 0.8, fontSize: 13 }}>{profile.email ?? "No email"}</div>
                      <div style={{ opacity: 0.68, fontSize: 12 }}>Role: {profile.role ?? "-"}</div>
                    </div>
                  </label>
                ))
              )}
            </div>

            {pickerError ? <div style={{ marginTop: 10, color: "#ff9d9d" }}>{pickerError}</div> : null}

            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                style={secondaryButtonStyle}
                disabled={pickerBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onConfirmAddRecipients()}
                style={buttonStyle}
                disabled={pickerBusy}
              >
                {pickerBusy ? "Saving..." : "Add Selected"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

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
  ...buttonStyle,
  background: "rgba(255,255,255,0.03)",
};

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  border: "1px solid rgba(255,120,120,0.30)",
  background: "rgba(255,120,120,0.08)",
};
