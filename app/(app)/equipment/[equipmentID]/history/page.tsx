"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { readRoleViewOverride, resolveEffectiveRole, type AppRole } from "@/lib/roleView";

type EquipmentRequestRow = {
  id: string;
  equipment_id: string;
  created_at: string;
  status: string | null;
  urgency: string | null;
  system_affected: string | null;
  description: string | null;
};

type EquipmentLogRow = {
  id: string;
  equipment_id: string;
  created_at: string;
  request_id: string | null;
  hours: number | null;
  notes: string | null;
  status_update: string | null;
};

type EquipmentPmEventRow = {
  id: string;
  equipment_id: string;
  created_at: string;
  template_id: string | null;
  hours: number | null;
  notes: string | null;
  result: unknown;
};

type TimelineType = "Maintenance Request" | "Maintenance Log" | "Preventative Maintenance";

type TimelineItem = {
  id: string;
  type: TimelineType;
  createdAt: string;
  hours?: number;
  title: string;
  subtitle?: string;
  notes?: string;
};

type FilterValue = "All" | TimelineType;
type Role = AppRole;

function isTimelineType(value: string | null): value is TimelineType {
  return (
    value === "Maintenance Request" ||
    value === "Maintenance Log" ||
    value === "Preventative Maintenance"
  );
}

function canManageMaintenance(role: Role | null) {
  return role === "owner" || role === "operations_manager" || role === "sales_manager" || role === "office_admin" || role === "mechanic";
}

function parseTitleAndDescription(raw: string | null) {
  if (!raw) return { title: "", description: "" };
  const lines = raw.split("\n");
  const firstLine = lines[0]?.trim() ?? "";

  let title = "";
  if (firstLine.startsWith("Title:")) {
    title = firstLine.slice("Title:".length).trim();
  }

  if (lines.length <= 2) return { title, description: raw.trim() };
  const description = lines.slice(2).join("\n").trim();
  return { title, description };
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
  };
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 999,
    border: active ? "1px solid rgba(255,255,255,0.26)" : "1px solid rgba(255,255,255,0.14)",
    background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 800,
  };
}

function badgeStyle(type: TimelineType): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    fontWeight: 800,
  };

  if (type === "Maintenance Request") {
    return {
      ...base,
      border: "1px solid rgba(255,210,0,0.26)",
      background: "rgba(255,210,0,0.10)",
    };
  }

  if (type === "Maintenance Log") {
    return {
      ...base,
      border: "1px solid rgba(170,170,255,0.22)",
      background: "rgba(170,170,255,0.06)",
    };
  }

  return {
    ...base,
    border: "1px solid rgba(0,255,120,0.22)",
    background: "rgba(0,255,120,0.08)",
  };
}

export default function EquipmentHistoryPage() {
  const params = useParams<{ equipmentID: string }>();
  const searchParams = useSearchParams();
  const equipmentId = decodeURIComponent(params.equipmentID);
  const focusId = (searchParams.get("focusId") || "").trim();
  const focusTypeRaw = (searchParams.get("focusType") || "").trim();
  const focusType: TimelineType | null = isTimelineType(focusTypeRaw) ? focusTypeRaw : null;

  const [filter, setFilter] = useState<FilterValue>(focusType ?? "All");
  const [requestRows, setRequestRows] = useState<EquipmentRequestRow[]>([]);
  const [logRows, setLogRows] = useState<EquipmentLogRow[]>([]);
  const [pmRows, setPmRows] = useState<EquipmentPmEventRow[]>([]);

  const [requestError, setRequestError] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const [pmError, setPmError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      const supabase = createSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      if (!active) return;

      if (!authData.user) {
        setUserRole("employee");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (!active) return;
      setUserRole(
        resolveEffectiveRole(
          (profile?.role as Role | undefined) ?? "employee",
          readRoleViewOverride()
        ) as Role
      );
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadRequests() {
      const supabase = createSupabaseBrowser();
      setRequestError(null);

      const { data, error } = await supabase
        .from("equipment_maintenance_requests")
        .select("id,equipment_id,created_at,status,urgency,system_affected,description")
        .eq("equipment_id", params.equipmentID)
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (error || !data) {
        if (error) console.error("[equipment-history] requests load error:", error);
        setRequestError(error?.message || "Failed to load maintenance requests.");
        setRequestRows([]);
        return;
      }

      setRequestRows(data as EquipmentRequestRow[]);
    }

    loadRequests();

    return () => {
      alive = false;
    };
  }, [params.equipmentID]);

  useEffect(() => {
    let alive = true;

    async function loadLogs() {
      const supabase = createSupabaseBrowser();
      setLogError(null);

      const { data, error } = await supabase
        .from("equipment_maintenance_logs")
        .select("id,equipment_id,created_at,request_id,hours,notes,status_update")
        .eq("equipment_id", params.equipmentID)
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (error || !data) {
        if (error) console.error("[equipment-history] logs load error:", error);
        setLogError(error?.message || "Failed to load maintenance logs.");
        setLogRows([]);
        return;
      }

      setLogRows(data as EquipmentLogRow[]);
    }

    loadLogs();

    return () => {
      alive = false;
    };
  }, [params.equipmentID]);

  useEffect(() => {
    let alive = true;

    async function loadPmEvents() {
      const supabase = createSupabaseBrowser();
      setPmError(null);

      const { data, error } = await supabase
        .from("equipment_pm_events")
        .select("id,equipment_id,created_at,template_id,hours,notes,result")
        .eq("equipment_id", params.equipmentID)
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (error || !data) {
        if (error) console.error("[equipment-history] pm events load error:", error);
        setPmError(error?.message || "Failed to load preventative maintenance events.");
        setPmRows([]);
        return;
      }

      setPmRows(data as EquipmentPmEventRow[]);
    }

    loadPmEvents();

    return () => {
      alive = false;
    };
  }, [params.equipmentID]);

  const items = useMemo(() => {
    const requests: TimelineItem[] = requestRows.map((r) => {
      const parsed = parseTitleAndDescription(r.description);
      const details = [
        r.status ?? null,
        r.urgency ? `Urgency: ${r.urgency}` : null,
        r.system_affected ? `System: ${r.system_affected}` : null,
      ]
        .filter(Boolean)
        .join(" • ");

      return {
        id: r.id,
        type: "Maintenance Request",
        createdAt: r.created_at,
        title:
          parsed.title ||
          (r.system_affected?.trim() ? `${r.system_affected} issue` : "Maintenance Request"),
        subtitle: details || undefined,
        notes: parsed.description || undefined,
      };
    });

    const logs: TimelineItem[] = logRows.map((r) => ({
      id: r.id,
      type: "Maintenance Log",
      createdAt: r.created_at,
      hours: r.hours ?? undefined,
      title: "Maintenance Log",
      subtitle: r.status_update ?? undefined,
      notes: r.notes ?? undefined,
    }));

    const pmEvents: TimelineItem[] = pmRows.map((r) => {
      let resultSummary: string | undefined;
      if (r.result && typeof r.result === "object") {
        const maybeResult = r.result as { templateName?: unknown; summary?: unknown };
        const parts: string[] = [];
        if (typeof maybeResult.templateName === "string" && maybeResult.templateName.trim()) {
          parts.push(maybeResult.templateName.trim());
        }
        if (typeof maybeResult.summary === "string" && maybeResult.summary.trim()) {
          parts.push(maybeResult.summary.trim());
        }
        if (parts.length) resultSummary = parts.join(" • ");
      }

      return {
        id: r.id,
        type: "Preventative Maintenance",
        createdAt: r.created_at,
        hours: r.hours ?? undefined,
        title: "Preventative Maintenance",
        subtitle: resultSummary,
        notes: r.notes ?? undefined,
      };
    });

    return [...requests, ...logs, ...pmEvents].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [requestRows, logRows, pmRows]);

  const filtered = useMemo(() => {
    if (filter === "All") return items;
    return items.filter((x) => x.type === filter);
  }, [items, filter]);
  const canManage = canManageMaintenance(userRole);

  async function deleteEquipmentRequest(id: string) {
    if (!canManage) return;
    const ok = window.confirm("Delete this maintenance request?");
    if (!ok) return;
    setActionBusyKey(`request:${id}`);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("equipment_maintenance_requests")
      .delete()
      .eq("id", id)
      .eq("equipment_id", equipmentId);
    setActionBusyKey(null);
    if (error) {
      alert(error.message || "Failed to delete maintenance request.");
      return;
    }
    setRequestRows((prev) => prev.filter((row) => row.id !== id));
  }

  async function deleteEquipmentLog(id: string) {
    if (!canManage) return;
    const ok = window.confirm("Delete this maintenance log?");
    if (!ok) return;
    setActionBusyKey(`log:${id}`);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("equipment_maintenance_logs")
      .delete()
      .eq("id", id)
      .eq("equipment_id", equipmentId);
    setActionBusyKey(null);
    if (error) {
      alert(error.message || "Failed to delete maintenance log.");
      return;
    }
    setLogRows((prev) => prev.filter((row) => row.id !== id));
  }

  async function editEquipmentPmDate(id: string, currentIso: string) {
    if (!canManage) return;
    const suggested = /^\d{4}-\d{2}-\d{2}/.test(currentIso) ? currentIso.slice(0, 10) : "";
    const input = window.prompt("Set PM date (YYYY-MM-DD)", suggested)?.trim() ?? "";
    if (!input) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      alert("Date must be in YYYY-MM-DD format.");
      return;
    }

    setActionBusyKey(`pm:${id}`);
    const response = await fetch("/api/pm-events/update-date", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetType: "equipment",
        assetId: equipmentId,
        eventId: id,
        date: input,
      }),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string; createdAt?: string };
    setActionBusyKey(null);

    if (!response.ok) {
      alert(json.error || "Failed to update PM date.");
      return;
    }

    const createdAt = json.createdAt || `${input}T12:00:00.000Z`;
    setPmRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, created_at: createdAt } : row))
    );
  }

  useEffect(() => {
    if (!focusId) return;
    const timer = window.setTimeout(() => {
      const node = document.getElementById(`timeline-item-${focusId}`);
      if (!node) return;
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusId, filtered.length]);

  return (
    <main style={{ paddingBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Equipment History</h1>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            Equipment ID: <strong>{equipmentId}</strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link
            href={`/equipment/${encodeURIComponent(equipmentId)}`}
            style={{
              textDecoration: "none",
              color: "inherit",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.04)",
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            ← Back to Equipment
          </Link>
        </div>
      </div>

      {requestError ? (
        <div style={{ marginTop: 12, ...cardStyle(), color: "#ff9d9d", opacity: 0.95 }}>
          {requestError}
        </div>
      ) : null}

      {logError ? (
        <div style={{ marginTop: 12, ...cardStyle(), color: "#ff9d9d", opacity: 0.95 }}>
          {logError}
        </div>
      ) : null}

      {pmError ? (
        <div style={{ marginTop: 12, ...cardStyle(), color: "#ff9d9d", opacity: 0.95 }}>
          {pmError}
        </div>
      ) : null}

      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Filter</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setFilter("All")} style={chipStyle(filter === "All")}>All</button>
          <button onClick={() => setFilter("Maintenance Request")} style={chipStyle(filter === "Maintenance Request")}>
            Maintenance Requests
          </button>
          <button onClick={() => setFilter("Maintenance Log")} style={chipStyle(filter === "Maintenance Log")}>Maintenance Logs</button>
          <button
            onClick={() => setFilter("Preventative Maintenance")}
            style={chipStyle(filter === "Preventative Maintenance")}
          >
            Preventative Maintenance
          </button>
        </div>

        <div style={{ marginTop: 10, opacity: 0.7, fontSize: 13 }}>
          Showing <strong>{filtered.length}</strong> item{filtered.length === 1 ? "" : "s"}.
        </div>
      </div>

      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Timeline</div>

        {filtered.length === 0 ? (
          <div style={{ opacity: 0.75 }}>
            No history yet. Submit a <strong>Maintenance Request</strong>, <strong>Maintenance Log</strong>, or <strong>Preventative Maintenance</strong> event.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((x) => {
              const isManageableType = x.type === "Maintenance Request" || x.type === "Maintenance Log";
              const canEditDelete = canManage && isManageableType;
              const focusQuery = new URLSearchParams({
                focusType: x.type,
                focusId: x.id,
              }).toString();
              const backToHistory = `/equipment/${encodeURIComponent(equipmentId)}/history?${focusQuery}`;
              const editHref =
                x.type === "Maintenance Request"
                  ? `/equipment/${encodeURIComponent(equipmentId)}/forms/maintenance-request?editId=${encodeURIComponent(x.id)}&returnTo=${encodeURIComponent(backToHistory)}`
                  : x.type === "Maintenance Log"
                    ? `/equipment/${encodeURIComponent(equipmentId)}/forms/maintenance-log?editId=${encodeURIComponent(x.id)}&returnTo=${encodeURIComponent(backToHistory)}`
                    : "";

              return (
                <div
                  key={`${x.type}:${x.id}`}
                  id={`timeline-item-${x.id}`}
                  style={{
                    border:
                      focusId === x.id && (!focusType || focusType === x.type)
                        ? "1px solid rgba(126,255,167,0.45)"
                        : "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 14,
                    padding: 12,
                    background:
                      focusId === x.id && (!focusType || focusType === x.type)
                        ? "rgba(126,255,167,0.10)"
                        : "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={badgeStyle(x.type)}>{x.type}</span>
                      <div style={{ fontWeight: 900 }}>{x.title}</div>
                    </div>

                    <div style={{ opacity: 0.75, fontSize: 13 }}>{formatDateTime(x.createdAt)}</div>
                  </div>

                  <div style={{ marginTop: 6, opacity: 0.82, fontSize: 13 }}>
                    {typeof x.hours === "number" ? <span>{x.hours.toLocaleString()} hrs</span> : null}
                    {x.subtitle ? <span>{typeof x.hours === "number" ? " • " : ""}{x.subtitle}</span> : null}
                  </div>

                  {x.notes ? <div style={{ marginTop: 8, opacity: 0.75, lineHeight: 1.35 }}>{x.notes}</div> : null}

                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Link
                      href={backToHistory}
                      style={{
                        textDecoration: "none",
                        color: "inherit",
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(255,255,255,0.04)",
                        fontSize: 13,
                        fontWeight: 800,
                      }}
                    >
                      See Form
                    </Link>
                  {canEditDelete ? (
                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <Link
                        href={editHref}
                        style={{
                          textDecoration: "none",
                          color: "inherit",
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.14)",
                          background: "rgba(255,255,255,0.04)",
                          fontSize: 13,
                          fontWeight: 800,
                        }}
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          if (x.type === "Maintenance Request") {
                            void deleteEquipmentRequest(x.id);
                          } else {
                            void deleteEquipmentLog(x.id);
                          }
                        }}
                        disabled={actionBusyKey === `${x.type === "Maintenance Request" ? "request" : "log"}:${x.id}`}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(255,120,120,0.35)",
                          background: "rgba(255,120,120,0.10)",
                          color: "inherit",
                          fontSize: 13,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        {actionBusyKey === `${x.type === "Maintenance Request" ? "request" : "log"}:${x.id}`
                          ? "Deleting..."
                          : "Delete"}
                      </button>
                    </div>
                  ) : null}

                  {canManage && x.type === "Preventative Maintenance" ? (
                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => void editEquipmentPmDate(x.id, x.createdAt)}
                        disabled={actionBusyKey === `pm:${x.id}`}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.14)",
                          background: "rgba(255,255,255,0.04)",
                          color: "inherit",
                          fontSize: 13,
                          fontWeight: 800,
                          cursor: "pointer",
                          opacity: actionBusyKey === `pm:${x.id}` ? 0.65 : 1,
                        }}
                      >
                        {actionBusyKey === `pm:${x.id}` ? "Saving..." : "Edit PM Date"}
                      </button>
                    </div>
                  ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
