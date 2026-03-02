"use client";

import { useEffect, useMemo, useState } from "react";

type AuditLogRow = {
  id: number;
  created_at: string;
  action: string | null;
  table_name: string | null;
  record_id: string | null;
  meta: Record<string, unknown> | null;
  actor_id: string | null;
  actor_role: string | null;
  event_type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
};

export default function AuditTrailClient() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventType, setEventType] = useState("");
  const [entityType, setEntityType] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ limit: "250" });
    if (eventType) query.set("eventType", eventType);
    if (entityType) query.set("entityType", entityType);

    const res = await fetch(`/api/audit-logs?${query.toString()}`, { method: "GET" });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRows([]);
      setError(payload?.error || "Failed to load audit logs.");
      setLoading(false);
      return;
    }

    setRows(Array.isArray(payload?.logs) ? payload.logs : []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, entityType]);

  const eventTypeOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => (r.event_type || "").trim()).filter(Boolean))).sort(),
    [rows]
  );
  const entityTypeOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => (r.entity_type || "").trim()).filter(Boolean))).sort(),
    [rows]
  );

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", paddingBottom: 24 }}>
      <h1 style={{ marginBottom: 6 }}>Audit Trail</h1>
      <div style={{ opacity: 0.75, marginBottom: 14 }}>
        Who changed what, when, and where. Includes approvals, role/invite changes, and scoring-related events.
      </div>

      <section style={cardStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
          <select value={eventType} onChange={(e) => setEventType(e.target.value)} style={inputStyle}>
            <option value="">All event types</option>
            {eventTypeOptions.map((v) => (
              <option key={`event-${v}`} value={v}>{v}</option>
            ))}
          </select>
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)} style={inputStyle}>
            <option value="">All entities</option>
            {entityTypeOptions.map((v) => (
              <option key={`entity-${v}`} value={v}>{v}</option>
            ))}
          </select>
          <button type="button" onClick={() => void load()} style={buttonStyle}>
            Refresh
          </button>
        </div>
      </section>

      <section style={{ ...cardStyle, marginTop: 12 }}>
        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading...</div>
        ) : error ? (
          <div style={{ color: "#ff9d9d" }}>{error}</div>
        ) : rows.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No audit entries found.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {rows.map((row) => (
              <div key={`audit-${row.id}`} style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 800 }}>{row.event_type || row.action || "event"}</div>
                  <div style={{ opacity: 0.75, fontSize: 12 }}>{new Date(row.created_at).toLocaleString()}</div>
                </div>
                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.86 }}>
                  Actor: {row.actor_role || "unknown"} · {row.actor_id || "system"}
                </div>
                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.86 }}>
                  Entity: {row.entity_type || row.table_name || "n/a"} · {row.entity_id || row.record_id || "n/a"}
                </div>
                {row.meta ? (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ cursor: "pointer", opacity: 0.88 }}>Details</summary>
                    <pre style={{ marginTop: 6, whiteSpace: "pre-wrap", fontSize: 12, opacity: 0.82 }}>
                      {JSON.stringify(row.meta, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 16,
  padding: 14,
  background: "rgba(255,255,255,0.03)",
};

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};
