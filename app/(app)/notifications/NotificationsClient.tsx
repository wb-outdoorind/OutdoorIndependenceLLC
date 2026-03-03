"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  acknowledged_at: string | null;
  resolved_at: string | null;
};

type DigestRunRow = {
  id: number;
  run_source: "cron" | "manual";
  initiated_by: string | null;
  ran_at: string;
  success: boolean;
  skipped: boolean;
  date_key: string | null;
  sent_to: number;
  open_count: number;
  in_review_count: number;
  email_attempted: number;
  email_sent: number;
  email_failed: number;
  error_message: string | null;
};

type SlaRunRow = {
  id: number;
  run_source: "cron" | "manual";
  initiated_by: string | null;
  ran_at: string;
  success: boolean;
  skipped: boolean;
  date_key: string | null;
  approval_overdue: number;
  maintenance_overdue: number;
  flagged_overdue: number;
  notifications_attempted: number;
  error_message: string | null;
};

type SlaStatusFilter = "all" | "open" | "acknowledged" | "resolved";

type RangeKey = "all" | "today" | "week" | "month" | "quarter" | "year" | "custom";

function canTriageSla(role: string | null | undefined) {
  return role === "owner" || role === "operations_manager" || role === "office_admin" || role === "mechanic";
}

function isSlaStatusFilter(value: string | null): value is SlaStatusFilter {
  return value === "all" || value === "open" || value === "acknowledged" || value === "resolved";
}

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

function notificationHref(row: NotificationRow) {
  if (row.kind === "trend_actions_digest" && row.entity_id) {
    return `/notifications/digest/${encodeURIComponent(row.entity_id)}`;
  }
  if (row.kind.startsWith("flagged_queue_") && row.entity_id) {
    return `/form-reports?flagged=${encodeURIComponent(row.entity_id)}`;
  }
  if (row.kind === "trip_lead_signoff_request" && row.entity_id) {
    return `/approvals?inspection=${encodeURIComponent(row.entity_id)}`;
  }
  if (row.kind === "sla_lead_approval_overdue" && row.entity_id) {
    return `/approvals?inspection=${encodeURIComponent(row.entity_id)}`;
  }
  if (row.kind === "sla_maintenance_request_overdue" && row.entity_id) {
    if (row.entity_type === "equipment_maintenance_request") {
      return `/maintenance?section=queue&equipmentRequest=${encodeURIComponent(row.entity_id)}`;
    }
    return `/maintenance?section=queue&vehicleRequest=${encodeURIComponent(row.entity_id)}`;
  }
  if (row.kind === "sla_flagged_queue_overdue" && row.entity_id) {
    return `/form-reports?flagged=${encodeURIComponent(row.entity_id)}`;
  }
  return null;
}

function isSlaNotification(row: NotificationRow) {
  return row.kind.startsWith("sla_");
}

function parseVehicleIdFromBody(body: string) {
  const match = body.match(/\bVehicle\s+([A-Za-z0-9_-]+)/i);
  return match?.[1] ?? null;
}

function parseEquipmentIdFromBody(body: string) {
  const match = body.match(/\bEquipment\s+([A-Za-z0-9_-]+)/i);
  return match?.[1] ?? null;
}

function notificationActions(row: NotificationRow) {
  const actions: Array<{ label: string; href: string }> = [];
  const primary = notificationHref(row);
  if (primary) {
    actions.push({ label: "View Details", href: primary });
  }

  if (row.kind === "vehicle_maintenance_request_created") {
    actions.push({ label: "Open Maintenance Center", href: "/maintenance?section=queue" });
    const vehicleId = parseVehicleIdFromBody(row.body);
    if (vehicleId) {
      actions.push({
        label: "Open Vehicle",
        href: `/vehicles/${encodeURIComponent(vehicleId)}`,
      });
    }
  }

  if (row.kind === "equipment_maintenance_request_created") {
    actions.push({ label: "Open Maintenance Center", href: "/maintenance?section=queue" });
    const equipmentId = parseEquipmentIdFromBody(row.body);
    if (equipmentId) {
      actions.push({
        label: "Open Equipment",
        href: `/equipment/${encodeURIComponent(equipmentId)}`,
      });
    }
  }

  if (row.kind === "form_accountability_flag" || row.kind === "accountability_falloff_reminder") {
    actions.push({ label: "Open Accountability Center", href: "/form-reports" });
  }

  if (row.kind.startsWith("flagged_queue_")) {
    actions.push({ label: "Open Accountability Center", href: "/form-reports" });
  }

  if (row.kind === "trip_lead_signoff_request") {
    actions.push({ label: "Open Approvals", href: "/approvals" });
  }

  return actions.filter((action, idx, arr) => arr.findIndex((x) => x.href === action.href) === idx);
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
  const [queueEventsEnabled, setQueueEventsEnabled] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [runNowBusy, setRunNowBusy] = useState(false);
  const [runNowMessage, setRunNowMessage] = useState<string | null>(null);
  const [runSlaBusy, setRunSlaBusy] = useState(false);
  const [runSlaMessage, setRunSlaMessage] = useState<string | null>(null);
  const [triageMessage, setTriageMessage] = useState<string | null>(null);
  const [digestRuns, setDigestRuns] = useState<DigestRunRow[]>([]);
  const [slaRuns, setSlaRuns] = useState<SlaRunRow[]>([]);
  const [slaStatusFilter, setSlaStatusFilter] = useState<SlaStatusFilter>(() => {
    const fromQuery = searchParams.get("sla");
    if (isSlaStatusFilter(fromQuery)) return fromQuery;
    return canTriageSla(role) ? "open" : "all";
  });
  const canTriageSlaRole = canTriageSla(role);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const shouldLoadRuns = role === "owner" || role === "mechanic";
    const shouldLoadSlaRuns =
      role === "owner" || role === "operations_manager" || role === "office_admin" || role === "mechanic";
    const [notificationsRes, prefsRes, runsRes, slaRunsRes] = await Promise.all([
      fetch("/api/notifications", { method: "GET" }),
      fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_prefs" }),
      }),
      shouldLoadRuns
        ? fetch("/api/trend-actions/digest/runs", { method: "GET" })
        : Promise.resolve(new Response(JSON.stringify({ runs: [] }), { status: 200 })),
      shouldLoadSlaRuns
        ? fetch("/api/sla-alerts/runs", { method: "GET" })
        : Promise.resolve(new Response(JSON.stringify({ runs: [] }), { status: 200 })),
    ]);

    const notificationsJson = await notificationsRes.json().catch(() => ({}));
    const prefsJson = await prefsRes.json().catch(() => ({}));
    const runsJson = await runsRes.json().catch(() => ({}));
    const slaRunsJson = await slaRunsRes.json().catch(() => ({}));

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
      setQueueEventsEnabled(prefsJson.prefs.queueEventsEnabled !== false);
    }
    if (shouldLoadRuns && runsRes.ok) {
      setDigestRuns((runsJson.runs ?? []) as DigestRunRow[]);
    } else {
      setDigestRuns([]);
    }
    if (shouldLoadSlaRuns && slaRunsRes.ok) {
      setSlaRuns((slaRunsJson.runs ?? []) as SlaRunRow[]);
    } else {
      setSlaRuns([]);
    }
    setLoading(false);
  }, [role]);

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
  }, [loadAll]);

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

      if (slaStatusFilter !== "all") {
        if (!isSlaNotification(row)) return false;
        const acknowledged = Boolean(row.acknowledged_at);
        const resolved = Boolean(row.resolved_at);
        if (slaStatusFilter === "open" && (acknowledged || resolved)) return false;
        if (slaStatusFilter === "acknowledged" && (!acknowledged || resolved)) return false;
        if (slaStatusFilter === "resolved" && !resolved) return false;
      }

      if (!q) return true;
      const hay = [row.title, row.body, row.kind, row.entity_type ?? "", row.entity_id ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, showUnreadOnly, range, customFrom, customTo, slaStatusFilter]);

  const unreadCount = useMemo(() => rows.filter((row) => !row.is_read).length, [rows]);
  const visibleSlaRows = useMemo(() => filtered.filter((row) => isSlaNotification(row)), [filtered]);
  const visibleSlaOpenCount = useMemo(
    () => visibleSlaRows.filter((row) => !row.acknowledged_at && !row.resolved_at).length,
    [visibleSlaRows]
  );
  const visibleSlaAcknowledgedCount = useMemo(
    () => visibleSlaRows.filter((row) => Boolean(row.acknowledged_at) && !row.resolved_at).length,
    [visibleSlaRows]
  );
  const visibleSlaResolvedCount = useMemo(
    () => visibleSlaRows.filter((row) => Boolean(row.resolved_at)).length,
    [visibleSlaRows]
  );
  const visibleUnacknowledgedSlaIds = useMemo(
    () => visibleSlaRows.filter((row) => !row.acknowledged_at && !row.resolved_at).map((row) => row.id),
    [visibleSlaRows]
  );
  const visibleUnresolvedSlaIds = useMemo(
    () => visibleSlaRows.filter((row) => !row.resolved_at).map((row) => row.id),
    [visibleSlaRows]
  );

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

  async function acknowledgeNotification(id: number) {
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "acknowledge", ids: [id] }),
    });
    if (!res.ok) return;
    const nowIso = new Date().toISOString();
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, acknowledged_at: row.acknowledged_at ?? nowIso } : row))
    );
  }

  async function acknowledgeNotifications(ids: number[]) {
    if (!ids.length) return;
    setTriageMessage(null);
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "acknowledge", ids }),
    });
    if (!res.ok) return;
    const nowIso = new Date().toISOString();
    const idSet = new Set(ids);
    setRows((prev) =>
      prev.map((row) => (idSet.has(row.id) ? { ...row, acknowledged_at: row.acknowledged_at ?? nowIso } : row))
    );
    setTriageMessage(`Acknowledged ${ids.length} SLA notification${ids.length === 1 ? "" : "s"}.`);
  }

  async function resolveNotification(id: number) {
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", ids: [id] }),
    });
    if (!res.ok) return;
    const nowIso = new Date().toISOString();
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              acknowledged_at: row.acknowledged_at ?? nowIso,
              resolved_at: nowIso,
              is_read: true,
              read_at: nowIso,
            }
          : row
      )
    );
  }

  async function resolveNotifications(ids: number[]) {
    if (!ids.length) return;
    setTriageMessage(null);
    const ok = window.confirm(
      `Resolve ${ids.length} visible SLA notification${ids.length === 1 ? "" : "s"}? This will mark them resolved and read.`
    );
    if (!ok) return;
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", ids }),
    });
    if (!res.ok) return;
    const nowIso = new Date().toISOString();
    const idSet = new Set(ids);
    setRows((prev) =>
      prev.map((row) =>
        idSet.has(row.id)
          ? {
              ...row,
              acknowledged_at: row.acknowledged_at ?? nowIso,
              resolved_at: nowIso,
              is_read: true,
              read_at: nowIso,
            }
          : row
      )
    );
    setTriageMessage(`Resolved ${ids.length} SLA notification${ids.length === 1 ? "" : "s"}.`);
  }

  async function savePrefs(
    nextEmailEnabled: boolean,
    nextSmsEnabled: boolean,
    nextQueueEventsEnabled: boolean
  ) {
    setPrefsSaving(true);
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "prefs",
        emailEnabled: nextEmailEnabled,
        smsEnabled: nextSmsEnabled,
        queueEventsEnabled: nextQueueEventsEnabled,
      }),
    });
    if (!res.ok) {
      setPrefsSaving(false);
      return;
    }
    setEmailEnabled(nextEmailEnabled);
    setSmsEnabled(nextSmsEnabled);
    setQueueEventsEnabled(nextQueueEventsEnabled);
    setPrefsSaving(false);
  }

  async function runDigestNow() {
    setRunNowBusy(true);
    setRunNowMessage(null);
    const res = await fetch("/api/trend-actions/digest", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 429 && json?.cooldown?.nextAvailableAt) {
        const next = new Date(String(json.cooldown.nextAvailableAt));
        const nextLabel = Number.isNaN(next.getTime()) ? String(json.cooldown.nextAvailableAt) : next.toLocaleString();
        setRunNowMessage(`Manual cooldown active. Next run available at ${nextLabel}.`);
      } else {
        setRunNowMessage(json?.error || "Failed to run digest.");
      }
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

  async function runSlaNow() {
    setRunSlaBusy(true);
    setRunSlaMessage(null);
    const res = await fetch("/api/sla-alerts", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRunSlaMessage(json?.error || "Failed to run SLA scan.");
      setRunSlaBusy(false);
      return;
    }
    setRunSlaMessage(
      `SLA scan complete: approvals ${Number(json?.metrics?.approvalOverdue ?? 0)}, maintenance ${Number(
        json?.metrics?.maintenanceOverdue ?? 0
      )}, flagged ${Number(json?.metrics?.flaggedOverdue ?? 0)}. Notifications attempted ${Number(
        json?.notificationsAttempted ?? 0
      )}.`
    );
    setRunSlaBusy(false);
    await loadAll();
  }

  function toCsvCell(value: string | number | boolean | null | undefined) {
    const raw = value == null ? "" : String(value);
    const escaped = raw.replaceAll('"', '""');
    return `"${escaped}"`;
  }

  function exportSlaCsv() {
    const slaRows = filtered.filter((row) => isSlaNotification(row));
    const headers = [
      "id",
      "title",
      "severity",
      "kind",
      "entity_type",
      "entity_id",
      "created_at",
      "acknowledged_at",
      "resolved_at",
      "is_read",
      "body",
    ];
    const lines = [headers.map((h) => toCsvCell(h)).join(",")];
    for (const row of slaRows) {
      lines.push(
        [
          row.id,
          row.title,
          row.severity,
          row.kind,
          row.entity_type,
          row.entity_id,
          row.created_at,
          row.acknowledged_at,
          row.resolved_at,
          row.is_read,
          row.body,
        ]
          .map((v) => toCsvCell(v))
          .join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
    a.href = url;
    a.download = `sla-notifications-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
            {role === "owner" || role === "operations_manager" || role === "mechanic" ? (
              <button type="button" onClick={() => void runSlaNow()} style={buttonStyle()} disabled={runSlaBusy}>
                {runSlaBusy ? "Running..." : "Run SLA Scan Now"}
              </button>
            ) : null}
          </div>
        </div>
        {runNowMessage ? (
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>{runNowMessage}</div>
        ) : null}
        {runSlaMessage ? (
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>{runSlaMessage}</div>
        ) : null}
        {triageMessage ? (
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>{triageMessage}</div>
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
              onChange={(e) => void savePrefs(e.target.checked, smsEnabled, queueEventsEnabled)}
            />
            Email alerts
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={smsEnabled}
              disabled={prefsSaving}
              onChange={(e) => void savePrefs(emailEnabled, e.target.checked, queueEventsEnabled)}
            />
            SMS alerts
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={queueEventsEnabled}
              disabled={prefsSaving}
              onChange={(e) => void savePrefs(emailEnabled, smsEnabled, e.target.checked)}
            />
            Queue event alerts
          </label>
        </div>
      </div>

      {role === "owner" || role === "mechanic" ? (
        <div style={{ marginTop: 12, ...cardStyle() }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Recent Digest Runs</div>
          {digestRuns.length === 0 ? (
            <div style={{ opacity: 0.75 }}>No digest runs logged yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {digestRuns.map((run) => (
                <div
                  key={run.id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    padding: 10,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 800 }}>
                      {run.run_source.toUpperCase()} · {run.success ? "Success" : "Failed"}
                      {run.skipped ? " (Skipped)" : ""}
                    </div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>{formatDateTime(run.ran_at)}</div>
                  </div>
                  <div style={{ marginTop: 6, opacity: 0.85, fontSize: 13 }}>
                    Date: {run.date_key || "n/a"} · In-app: {run.sent_to} · Open: {run.open_count} · In Review: {run.in_review_count}
                  </div>
                  <div style={{ marginTop: 4, opacity: 0.85, fontSize: 13 }}>
                    Email attempted: {run.email_attempted} · sent: {run.email_sent} · failed: {run.email_failed}
                  </div>
                  {run.error_message ? (
                    <div style={{ marginTop: 4, color: "#ff9d9d", fontSize: 13 }}>{run.error_message}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {role === "owner" || role === "operations_manager" || role === "office_admin" || role === "mechanic" ? (
        <div style={{ marginTop: 12, ...cardStyle() }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Recent SLA Scan Runs</div>
          {slaRuns.length === 0 ? (
            <div style={{ opacity: 0.75 }}>No SLA scan runs logged yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {slaRuns.map((run) => (
                <div
                  key={run.id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    padding: 10,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 800 }}>
                      {run.run_source.toUpperCase()} · {run.success ? "Success" : "Failed"}
                      {run.skipped ? " (Skipped)" : ""}
                    </div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>{formatDateTime(run.ran_at)}</div>
                  </div>
                  <div style={{ marginTop: 6, opacity: 0.85, fontSize: 13 }}>
                    Overdue approvals: {run.approval_overdue} · maintenance: {run.maintenance_overdue} · flagged:{" "}
                    {run.flagged_overdue}
                  </div>
                  <div style={{ marginTop: 4, opacity: 0.85, fontSize: 13 }}>
                    Notifications attempted: {run.notifications_attempted}
                  </div>
                  {run.error_message ? (
                    <div style={{ marginTop: 4, color: "#ff9d9d", fontSize: 13 }}>{run.error_message}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        {canTriageSlaRole ? (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
              opacity: 0.92,
              fontSize: 13,
            }}
          >
            <span style={{ padding: "4px 9px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)" }}>
              Visible SLA Open: {visibleSlaOpenCount}
            </span>
            <span style={{ padding: "4px 9px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)" }}>
              Visible SLA Acknowledged: {visibleSlaAcknowledgedCount}
            </span>
            <span style={{ padding: "4px 9px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)" }}>
              Visible SLA Resolved: {visibleSlaResolvedCount}
            </span>
          </div>
        ) : null}
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
          <select
            value={slaStatusFilter}
            onChange={(e) => setSlaStatusFilter(e.target.value as SlaStatusFilter)}
            style={inputStyle()}
          >
            <option value="all">SLA status: all</option>
            <option value="open">SLA status: open</option>
            <option value="acknowledged">SLA status: acknowledged</option>
            <option value="resolved">SLA status: resolved</option>
          </select>
          <button type="button" onClick={exportSlaCsv} style={buttonStyle()}>
            Export SLA CSV
          </button>
          {canTriageSlaRole ? (
            <>
              <button
                type="button"
                onClick={() => void acknowledgeNotifications(visibleUnacknowledgedSlaIds)}
                style={buttonStyle()}
                disabled={visibleUnacknowledgedSlaIds.length === 0}
              >
                Acknowledge Visible SLA ({visibleUnacknowledgedSlaIds.length})
              </button>
              <button
                type="button"
                onClick={() => void resolveNotifications(visibleUnresolvedSlaIds)}
                style={buttonStyle()}
                disabled={visibleUnresolvedSlaIds.length === 0}
              >
                Resolve Visible SLA ({visibleUnresolvedSlaIds.length})
              </button>
            </>
          ) : null}
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
                    {isSlaNotification(row) && !row.acknowledged_at ? (
                      <button type="button" onClick={() => void acknowledgeNotification(row.id)} style={buttonStyle()}>
                        Acknowledge
                      </button>
                    ) : null}
                    {isSlaNotification(row) && !row.resolved_at ? (
                      <button type="button" onClick={() => void resolveNotification(row.id)} style={buttonStyle()}>
                        Resolve
                      </button>
                    ) : null}
                    {notificationActions(row).map((action) => (
                      <Link key={`${row.id}-${action.href}`} href={action.href} style={buttonStyle()}>
                        {action.label}
                      </Link>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 8, opacity: 0.9 }}>{row.body}</div>
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {row.acknowledged_at ? (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: 11,
                        border: "1px solid rgba(140,220,255,0.25)",
                        background: "rgba(120,180,255,0.2)",
                      }}
                    >
                      Acknowledged
                    </span>
                  ) : null}
                  {row.resolved_at ? (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: 11,
                        border: "1px solid rgba(126,255,167,0.3)",
                        background: "rgba(126,255,167,0.2)",
                      }}
                    >
                      Resolved
                    </span>
                  ) : null}
                </div>
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
