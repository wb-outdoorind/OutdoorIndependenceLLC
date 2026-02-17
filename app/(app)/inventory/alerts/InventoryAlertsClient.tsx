"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type SubscriptionRow = {
  id: string;
  email: string;
  is_enabled: boolean;
  created_at: string;
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
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadData() {
    const supabase = createSupabaseBrowser();
    setLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("inventory_low_stock_subscriptions")
      .select("id,email,is_enabled,created_at")
      .order("email", { ascending: true });

    if (error) {
      console.error("[inventory-alerts] load error:", error);
      setErrorMessage(error.message || "Failed to load subscriptions.");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as SubscriptionRow[]);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function onAddEmail(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const email = newEmail.trim().toLowerCase();
    if (!email) return;

    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("inventory_low_stock_subscriptions")
      .upsert({ email, is_enabled: true }, { onConflict: "email" });

    if (error) {
      console.error("[inventory-alerts] add email error:", error);
      setSubmitError(error.message);
      return;
    }

    setNewEmail("");
    await loadData();
  }

  async function onToggle(row: SubscriptionRow) {
    setBusyId(row.id);

    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("inventory_low_stock_subscriptions")
      .update({ is_enabled: !row.is_enabled })
      .eq("id", row.id);

    if (error) {
      console.error("[inventory-alerts] toggle error:", error);
      alert(error.message || "Failed to update subscription.");
      setBusyId(null);
      return;
    }

    await loadData();
    setBusyId(null);
  }

  async function onDelete(row: SubscriptionRow) {
    const confirmed = window.confirm(`Delete ${row.email}?`);
    if (!confirmed) return;

    setBusyId(row.id);

    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("inventory_low_stock_subscriptions")
      .delete()
      .eq("id", row.id);

    if (error) {
      console.error("[inventory-alerts] delete error:", error);
      alert(error.message || "Failed to delete subscription.");
      setBusyId(null);
      return;
    }

    await loadData();
    setBusyId(null);
  }

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>Low-Stock Alerts</h1>
      <div style={{ opacity: 0.75 }}>Manage email subscriptions for inventory low-stock alerts.</div>

      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Add Subscription</div>

        <form onSubmit={onAddEmail}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) auto", gap: 10 }}>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="name@company.com"
              style={inputStyle()}
              required
            />
            <button type="submit" style={buttonStyle}>
              Add Email
            </button>
          </div>
          {submitError ? <div style={{ marginTop: 8, color: "#ff9d9d" }}>{submitError}</div> : null}
        </form>
      </div>

      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Subscriptions</div>

        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading subscriptions...</div>
        ) : errorMessage ? (
          <div style={{ color: "#ff9d9d" }}>{errorMessage}</div>
        ) : rows.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No subscriptions yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {rows.map((row) => (
              <div
                key={row.id}
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
                  <div style={{ fontWeight: 900 }}>{row.email}</div>
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

                <div style={{ opacity: 0.7, fontSize: 12 }}>Added: {formatDateTime(row.created_at)}</div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void onToggle(row)}
                    style={secondaryButtonStyle}
                    disabled={busyId === row.id}
                  >
                    {row.is_enabled ? "Disable" : "Enable"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void onDelete(row)}
                    style={dangerButtonStyle}
                    disabled={busyId === row.id}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
