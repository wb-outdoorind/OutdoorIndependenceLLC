"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getApprovalSla, type SlaLevel } from "@/lib/sla";

type ApprovalRow = {
  id: string;
  vehicleId: string;
  inspectionType: string;
  mileage: number | null;
  createdAt: string;
  requestedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  note: string | null;
  status: "pending" | "approved" | "rejected" | "not_requested";
  teammateName: string;
  inspectionDate: string;
};

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

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function slaBadgeStyle(level: SlaLevel): React.CSSProperties {
  if (level === "overdue") {
    return {
      border: "1px solid rgba(255,120,120,0.45)",
      background: "rgba(120,20,20,0.35)",
      color: "#ffd7d7",
    };
  }
  if (level === "due_soon") {
    return {
      border: "1px solid rgba(255,197,94,0.45)",
      background: "rgba(120,82,12,0.35)",
      color: "#ffe6b8",
    };
  }
  return {
    border: "1px solid rgba(126,255,167,0.4)",
    background: "rgba(20,98,49,0.35)",
    color: "#d6ffe2",
  };
}

export default function LeadApprovalsClient() {
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [noteById, setNoteById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/inspections/lead-approvals", { method: "GET" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(json?.error || "Failed to load approvals."));
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((json.rows ?? []) as ApprovalRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      void load();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [load]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return rows;
    return rows.filter((row) => row.status === statusFilter);
  }, [rows, statusFilter]);

  async function decide(inspectionId: string, decision: "approved" | "rejected") {
    setBusyId(inspectionId);
    setError(null);
    const res = await fetch("/api/inspections/lead-approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "decide",
        inspectionId,
        decision,
        note: (noteById[inspectionId] || "").trim() || undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(String(json?.error || "Failed to update approval."));
      return;
    }
    await load();
  }

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>Lead Approvals</h1>
      <div style={{ opacity: 0.75 }}>
        Review and sign off on submitted pre-trip and post-trip inspections.
      </div>

      <div style={{ marginTop: 14, ...cardStyle(), display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "pending" | "approved" | "rejected" | "all")}
          style={{ ...inputStyle(), maxWidth: 220 }}
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
        <button type="button" style={buttonStyle()} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error ? (
        <div style={{ marginTop: 12, ...cardStyle(), color: "#ff9d9d" }}>{error}</div>
      ) : null}

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {loading ? (
          <div style={cardStyle()}>Loading approvals...</div>
        ) : filtered.length === 0 ? (
          <div style={cardStyle()}>No inspections found for this filter.</div>
        ) : (
          filtered.map((row) => {
            const isPending = row.status === "pending";
            const approvalSla = getApprovalSla({
              requestedAt: row.requestedAt,
              status: row.status,
            });
            return (
              <div key={row.id} style={cardStyle()}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 800 }}>
                    {row.inspectionType} · Vehicle {row.vehicleId}
                  </div>
                  <div style={{ opacity: 0.72, fontSize: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>Status: {row.status.toUpperCase()}</span>
                    {approvalSla ? (
                      <span
                        style={{
                          ...slaBadgeStyle(approvalSla.level),
                          borderRadius: 999,
                          padding: "2px 8px",
                          fontWeight: 800,
                        }}
                      >
                        SLA: {approvalSla.text}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div style={{ marginTop: 6, fontSize: 13, opacity: 0.86 }}>
                  Teammate: {row.teammateName || "Unknown"} · Inspection date: {row.inspectionDate || "—"} · Mileage: {row.mileage ?? "—"}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                  Requested: {fmtDateTime(row.requestedAt)} · Decided: {fmtDateTime(row.approvedAt)}
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link href={`/vehicles/${encodeURIComponent(row.vehicleId)}/history`} style={buttonStyle()}>
                    Open Vehicle History
                  </Link>
                </div>

                {isPending ? (
                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    <textarea
                      value={noteById[row.id] ?? ""}
                      onChange={(e) => setNoteById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      placeholder="Optional sign-off note..."
                      rows={2}
                      style={{ ...inputStyle(), resize: "vertical" }}
                    />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        style={buttonStyle()}
                        disabled={busyId === row.id}
                        onClick={() => void decide(row.id, "approved")}
                      >
                        {busyId === row.id ? "Saving..." : "Approve"}
                      </button>
                      <button
                        type="button"
                        style={buttonStyle()}
                        disabled={busyId === row.id}
                        onClick={() => void decide(row.id, "rejected")}
                      >
                        {busyId === row.id ? "Saving..." : "Reject"}
                      </button>
                    </div>
                  </div>
                ) : row.note ? (
                  <div style={{ marginTop: 8, opacity: 0.82 }}>Note: {row.note}</div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
