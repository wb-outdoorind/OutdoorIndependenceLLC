"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type NotificationRow = {
  id: number;
  title: string;
  body: string;
  severity: "info" | "warning" | "high" | "critical";
  kind: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
};

type RangeKey = "all" | "today" | "week" | "month" | "quarter" | "year" | "custom";

function isRangeKey(value: string | null): value is RangeKey {
  return (
    value === "all" ||
    value === "today" ||
    value === "week" ||
    value === "month" ||
    value === "quarter" ||
    value === "year" ||
    value === "custom"
  );
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function startOfMonth(date: Date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function startOfQuarter(date: Date) {
  const d = startOfDay(date);
  const month = d.getMonth();
  const quarterStart = Math.floor(month / 3) * 3;
  d.setMonth(quarterStart, 1);
  return d;
}

function startOfYear(date: Date) {
  const d = startOfDay(date);
  d.setMonth(0, 1);
  return d;
}

function toDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
  };
}

function buttonStyle(): React.CSSProperties {
  return {
    padding: "9px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "inherit",
    fontWeight: 800,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
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

function severityColor(severity: NotificationRow["severity"]) {
  if (severity === "critical") return "rgba(255,90,90,0.2)";
  if (severity === "high") return "rgba(255,140,100,0.2)";
  if (severity === "warning") return "rgba(255,210,90,0.2)";
  return "rgba(120,180,255,0.18)";
}

export default function NotificationsClient({ role }: { role: string | null }) {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [range, setRange] = useState<RangeKey>(() => {
    const fromQuery = searchParams.get("range");
    return isRangeKey(fromQuery) ? fromQuery : "today";
  });
  const [customFrom, setCustomFrom] = useState(() => toDateInputValue(new Date()));
  const [customTo, setCustomTo] = useState(() => toDateInputValue(new Date()));
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [runNowBusy, setRunNowBusy] = useState(false);
  const [runNowMessage, setRunNowMessage] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setErrorMessage(null);
    const [notificationsRes, prefsRes] = await Promise.all([
      fetch("/api/notifications", { method: "GET" }),
      fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_prefs" }),
      }),
    ]);

    const notificationsJson = await notificationsRes.json().catch(() => ({}));
    const prefsJson = await prefsRes.json().catch(() => ({}));

    if (!notificationsRes.ok) {
      setErrorMessage(notificationsJson?.error || "Failed to load notifications.");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((notificationsJson.notifications ?? []) as NotificationRow[]);
    if (prefsJson?.prefs) {
      setEmailEnabled(prefsJson.prefs.emailEnabled !== false);
      setSmsEnabled(prefsJson.prefs.smsEnabled === true);
    }
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      void loadAll();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    const startToday = startOfDay(now).getTime();
    const startWeek = startOfWeek(now).getTime();
    const startMonth = startOfMonth(now).getTime();
    const startQuarter = startOfQuarter(now).getTime();
    const startYear = startOfYear(now).getTime();
    const customFromDate = new Date(`${customFrom}T00:00:00`);
    const customToDate = new Date(`${customTo}T23:59:59.999`);
    const customFromMs = Number.isNaN(customFromDate.getTime()) ? null : customFromDate.getTime();
    const customToMs = Number.isNaN(customToDate.getTime()) ? null : customToDate.getTime();

    return rows.filter((row) => {
      if (showUnreadOnly && row.is_read) return false;
      const createdMs = new Date(row.created_at).getTime();
      if (Number.isNaN(createdMs)) return false;

      if (range === "today" && createdMs < startToday) return false;
      if (range === "week" && createdMs < startWeek) return false;
      if (range === "month" && createdMs < startMonth) return false;
      if (range === "quarter" && createdMs < startQuarter) return false;
      if (range === "year" && createdMs < startYear) return false;
      if (range === "custom") {
        if (customFromMs !== null && createdMs < customFromMs) return false;
        if (customToMs !== null && createdMs > customToMs) return false;
      }

      if (!q) return true;
      const hay = [row.title, row.body, row.kind, row.entity_type ?? "", row.entity_id ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, showUnreadOnly, range, customFrom, customTo]);

  const unreadCount = useMemo(() => rows.filter((row) => !row.is_read).length, [rows]);

  async function markOneRead(id: number) {
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_read", ids: [id] }),
    });
    if (!res.ok) return;
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, is_read: true } : row)));
  }

  async function markAllRead() {
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    if (!res.ok) return;
    setRows((prev) => prev.map((row) => ({ ...row, is_read: true })));
  }

  async function savePrefs(nextEmailEnabled: boolean, nextSmsEnabled: boolean) {
    setPrefsSaving(true);
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "prefs",
        emailEnabled: nextEmailEnabled,
        smsEnabled: nextSmsEnabled,
      }),
    });
    if (!res.ok) {
      setPrefsSaving(false);
      return;
    }
    setEmailEnabled(nextEmailEnabled);
    setSmsEnabled(nextSmsEnabled);
    setPrefsSaving(false);
  }

  async function runDigestNow() {
    setRunNowBusy(true);
    setRunNowMessage(null);
    const res = await fetch("/api/trend-actions/digest", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRunNowMessage(json?.error || "Failed to run digest.");
      setRunNowBusy(false);
      return;
    }
    const sentTo = Number(json?.sentTo ?? 0);
    const sent = Number(json?.email?.sent ?? 0);
    const failed = Number(json?.email?.failed ?? 0);
    setRunNowMessage(`Digest queued: in-app ${sentTo}, email sent ${sent}, failed ${failed}.`);
    setRunNowBusy(false);
    await loadAll();
  }

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>Notifications</h1>
      <div style={{ opacity: 0.75 }}>
        Alerts for maintenance, form accountability, and operational events.
      </div>

      <div style={{ marginTop: 14, ...cardStyle() }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Unread</div>
            <div style={{ fontWeight: 900, fontSize: 24 }}>{unreadCount}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => void markAllRead()} style={buttonStyle()}>
              Mark All Read
            </button>
            {role === "owner" ? (
              <button
                type="button"
                onClick={() => void runDigestNow()}
                style={buttonStyle()}
                disabled={runNowBusy}
              >
                {runNowBusy ? "Running..." : "Run Digest Now"}
              </button>
            ) : null}
          </div>
        </div>
        {runNowMessage ? (
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>{runNowMessage}</div>
        ) : null}
      </div>

      <div style={{ marginTop: 12, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Notification Preferences</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={emailEnabled}
              disabled={prefsSaving}
              onChange={(e) => void savePrefs(e.target.checked, smsEnabled)}
            />
            Email alerts
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={smsEnabled}
              disabled={prefsSaving}
              onChange={(e) => void savePrefs(emailEnabled, e.target.checked)}
            />
            SMS alerts
          </label>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle(), minWidth: 240, flex: "1 1 240px" }}
            placeholder="Search notifications..."
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={showUnreadOnly}
              onChange={(e) => setShowUnreadOnly(e.target.checked)}
            />
            Unread only
          </label>
          <select value={range} onChange={(e) => setRange(e.target.value as RangeKey)} style={inputStyle()}>
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="quarter">This quarter</option>
            <option value="year">This year</option>
            <option value="custom">Custom range</option>
          </select>
        </div>

        {range === "custom" ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>From</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={inputStyle()}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>To</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={inputStyle()}
              />
            </label>
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 12, ...cardStyle() }}>
        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading notifications...</div>
        ) : errorMessage ? (
          <div style={{ color: "#ff9d9d" }}>{errorMessage}</div>
        ) : filtered.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No notifications found for the selected filters.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((row) => (
              <div
                key={row.id}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  padding: 12,
                  background: row.is_read ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900 }}>{row.title}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: 11,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: severityColor(row.severity),
                      }}
                    >
                      {row.severity}
                    </span>
                    {!row.is_read ? (
                      <button type="button" onClick={() => void markOneRead(row.id)} style={buttonStyle()}>
                        Mark Read
                      </button>
                    ) : null}
                  </div>
                </div>
                <div style={{ marginTop: 8, opacity: 0.9 }}>{row.body}</div>
                <div style={{ marginTop: 8, opacity: 0.65, fontSize: 12 }}>
                  {formatDateTime(row.created_at)}
                  {row.entity_type ? ` • ${row.entity_type}` : ""}
                  {row.entity_id ? ` • ${row.entity_id}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
