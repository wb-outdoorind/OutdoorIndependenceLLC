"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { readRoleViewOverride, resolveEffectiveRole, type AppRole } from "@/lib/roleView";
import { buildEquipmentAssetIdPrefix } from "@/lib/assetIdFormat";
import { MAINTENANCE_ACTIVE_STATUSES } from "@/lib/maintenanceStatus";
import {
  ASSET_LIFECYCLE_STATUSES,
  assetLifecycleStatusTone,
  normalizeAssetLifecycleStatus,
  sortLifecycleStatusesForFilter,
} from "@/lib/assetLifecycleStatus";

type EquipmentRow = {
  id: string;
  name: string;
  equipment_type: string | null;
  season: string | null;
  external_id: string | null;
  status: string | null;
  current_hours: number | null;
  make: string | null;
  model: string | null;
  year: number | null;
};
type Role = AppRole;
type PmStatus = "On Track" | "Due Soon" | "Overdue";
type EquipmentOperationalSummary = {
  pmStatus: PmStatus;
  openRequests: number;
};
type EquipmentPmEventRow = {
  equipment_id: string | null;
  created_at: string;
  hours: number | null;
};

const DEFAULT_OPERATIONAL_SUMMARY: EquipmentOperationalSummary = {
  pmStatus: "On Track",
  openRequests: 0,
};

function buildEquipmentDisplayIds(rows: EquipmentRow[]) {
  const maxByPrefix: Record<string, number> = {};
  for (const row of rows) {
    const existing = (row.external_id ?? "").trim();
    if (!existing) continue;
    const simpleMatch = /^(Truck|Trailer)_(\d+)$/i.exec(existing);
    if (simpleMatch) {
      const rawPrefix = simpleMatch[1][0].toUpperCase() + simpleMatch[1].slice(1).toLowerCase();
      const prefix = rawPrefix === "Trailer" ? "Truck" : rawPrefix;
      const seq = Number(simpleMatch[2]);
      if (Number.isInteger(seq)) {
        maxByPrefix[prefix] = Math.max(maxByPrefix[prefix] ?? 0, seq);
      }
      continue;
    }
    const structuredMatch = /^(.*)-(\d+)$/.exec(existing);
    if (!structuredMatch) continue;
    const prefix = structuredMatch[1];
    const seq = Number(structuredMatch[2]);
    if (Number.isInteger(seq) && prefix) {
      maxByPrefix[prefix] = Math.max(maxByPrefix[prefix] ?? 0, seq);
    }
  }

  const map: Record<string, string> = {};
  for (const row of rows) {
    const existing = (row.external_id ?? "").trim();
    if (existing) {
      const simpleMatch = /^(Truck|Trailer)_(\d+)$/i.exec(existing);
      if (simpleMatch) {
        map[row.id] = `Truck_${Number(simpleMatch[2])}`;
      } else {
        map[row.id] = existing;
      }
      continue;
    }
    const prefix = buildEquipmentAssetIdPrefix({
      season: row.season,
      equipmentType: row.equipment_type,
      make: row.make,
      name: row.name,
      id: row.id,
    });
    const seq = (maxByPrefix[prefix] ?? 0) + 1;
    maxByPrefix[prefix] = seq;
    map[row.id] = prefix === "Truck" ? `Truck_${seq}` : `${prefix}-${seq}`;
  }
  return map;
}

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

function statusBadgeStyle(status: string | null | undefined): React.CSSProperties {
  const rawStatus = (normalizeAssetLifecycleStatus(status) ?? "").toLowerCase();
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    fontWeight: 900,
    whiteSpace: "nowrap",
  };

  if (rawStatus === "red tagged") {
    return {
      ...base,
      border: "1px solid rgba(255,72,72,0.62)",
      background: "rgba(120,16,16,0.46)",
      color: "rgba(255,230,230,0.98)",
    };
  }
  if (rawStatus === "out of service") {
    return {
      ...base,
      border: "1px solid rgba(255,114,114,0.44)",
      background: "rgba(132,30,30,0.30)",
      color: "rgba(255,236,236,0.95)",
    };
  }
  if (rawStatus === "inactive") {
    return {
      ...base,
      border: "1px solid rgba(255,210,0,0.22)",
      background: "rgba(255,210,0,0.08)",
      color: "rgba(255,242,191,0.9)",
    };
  }
  if (rawStatus === "retired") {
    return {
      ...base,
      border: "1px solid rgba(180,180,180,0.22)",
      background: "rgba(180,180,180,0.08)",
      color: "rgba(220,220,220,0.82)",
    };
  }

  const tone = assetLifecycleStatusTone(status);
  if (tone === "active" || rawStatus === "active") {
    return {
      ...base,
      border: "1px solid rgba(130,255,190,0.18)",
      background: "rgba(130,255,190,0.06)",
      color: "rgba(210,255,226,0.84)",
    };
  }
  if (tone === "warning") {
    return {
      ...base,
      border: "1px solid rgba(255,80,80,0.28)",
      background: "rgba(255,80,80,0.10)",
    };
  }
  if (tone === "danger") {
    return {
      ...base,
      border: "1px solid rgba(255,80,80,0.42)",
      background: "rgba(120,20,20,0.34)",
    };
  }
  if (tone === "retired") {
    return {
      ...base,
      border: "1px solid rgba(180,180,180,0.30)",
      background: "rgba(180,180,180,0.10)",
    };
  }
  return base;
}

function pmStateTextStyle(pmStatus: PmStatus): React.CSSProperties {
  if (pmStatus === "Overdue") return { color: "#ff8a8a" };
  if (pmStatus === "Due Soon") return { color: "#ffd88a" };
  return { color: "rgba(255,255,255,0.75)" };
}

function compactLine(parts: Array<string | number | null | undefined>) {
  const compact = parts
    .map((part) => (part ?? "").toString().trim())
    .filter((part) => part.length > 0);
  return compact.length ? compact.join(" · ") : "—";
}

function lifecycleSortPriority(status: string | null | undefined) {
  const normalized = normalizeAssetLifecycleStatus(status);
  if (normalized === "Red Tagged") return 1;
  if (normalized === "Out of Service") return 2;
  return 99;
}

export default function EquipmentListPage() {
  const [rows, setRows] = useState<EquipmentRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [hoveredEquipmentId, setHoveredEquipmentId] = useState<string | null>(null);
  const [operationalByEquipmentId, setOperationalByEquipmentId] = useState<
    Record<string, EquipmentOperationalSummary>
  >({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canCreateEquipment, setCanCreateEquipment] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadEquipment() {
      setLoading(true);
      setErrorMessage(null);

      const supabase = createSupabaseBrowser();
      const { data, error } = await supabase
        .from("equipment")
        .select("id,name,equipment_type,season,external_id,status,current_hours,make,model,year")
        .order("name", { ascending: true });

      if (!alive) return;
      if (error || !data) {
        if (error) console.error("[equipment-list] load error:", error);
        setErrorMessage(error?.message || "Failed to load equipment.");
        setRows([]);
        setLoading(false);
        return;
      }

      setRows(data as EquipmentRow[]);
      setLoading(false);
    }

    loadEquipment();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (rows.length === 0) {
        if (alive) setOperationalByEquipmentId({});
        return;
      }

      const supabase = createSupabaseBrowser();
      const equipmentIds = rows.map((row) => row.id);

      const [openRequestsRes, pmEventsRes] = await Promise.all([
        supabase
          .from("equipment_maintenance_requests")
          .select("equipment_id,status")
          .in("equipment_id", equipmentIds)
          .in("status", MAINTENANCE_ACTIVE_STATUSES),
        supabase
          .from("equipment_pm_events")
          .select("equipment_id,created_at,hours")
          .in("equipment_id", equipmentIds)
          .order("created_at", { ascending: false })
          .limit(5000),
      ]);

      if (!alive) return;

      const openRequestsByEquipmentId: Record<string, number> = {};
      if (!openRequestsRes.error && Array.isArray(openRequestsRes.data)) {
        for (const row of openRequestsRes.data as Array<{ equipment_id: string | null }>) {
          const equipmentId = row.equipment_id ?? "";
          if (!equipmentId) continue;
          openRequestsByEquipmentId[equipmentId] = (openRequestsByEquipmentId[equipmentId] ?? 0) + 1;
        }
      }

      const latestPmHoursByEquipmentId: Record<string, number> = {};
      if (!pmEventsRes.error && Array.isArray(pmEventsRes.data)) {
        for (const row of pmEventsRes.data as EquipmentPmEventRow[]) {
          const equipmentId = row.equipment_id ?? "";
          if (!equipmentId || equipmentId in latestPmHoursByEquipmentId) continue;
          const hours = Number(row.hours);
          if (!Number.isFinite(hours) || hours < 0) continue;
          latestPmHoursByEquipmentId[equipmentId] = hours;
        }
      }

      const summaryByEquipmentId: Record<string, EquipmentOperationalSummary> = {};
      for (const row of rows) {
        const interval = 250;
        const dueSoonWindow = 25;
        const currentHours = Number(row.current_hours);
        const hasCurrentHours = Number.isFinite(currentHours) && currentHours >= 0;
        const lastPmHours = latestPmHoursByEquipmentId[row.id] ?? 0;

        let pmStatus: PmStatus = "On Track";
        if (hasCurrentHours) {
          const dueAt = lastPmHours + interval;
          const delta = dueAt - currentHours;
          if (currentHours >= dueAt) pmStatus = "Overdue";
          else if (delta <= dueSoonWindow) pmStatus = "Due Soon";
        }

        summaryByEquipmentId[row.id] = {
          pmStatus,
          openRequests: openRequestsByEquipmentId[row.id] ?? 0,
        };
      }

      setOperationalByEquipmentId(summaryByEquipmentId);
    })();

    return () => {
      alive = false;
    };
  }, [rows]);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const supabase = createSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      if (!alive || !authData.user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (!alive) return;
      const role = resolveEffectiveRole(
        (profile?.role as Role | undefined) ?? "employee",
        readRoleViewOverride()
      ) as Role;
      setCanCreateEquipment(
        role === "owner" || role === "operations_manager" || role === "sales_manager" || role === "office_admin" || role === "mechanic"
      );
    })();

    return () => {
      alive = false;
    };
  }, []);

  const statuses = useMemo(() => {
    const set = new Set<string>(ASSET_LIFECYCLE_STATUSES);
    let hasUnknown = false;
    for (const r of rows) {
      const normalized = normalizeAssetLifecycleStatus(r.status);
      if (normalized) set.add(normalized);
      else hasUnknown = true;
    }
    const ordered = sortLifecycleStatusesForFilter(Array.from(set));
    if (hasUnknown && !ordered.includes("Unknown")) ordered.push("Unknown");
    return ["All", ...ordered];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    const result = rows.filter((r) => {
      const normalizedStatus = normalizeAssetLifecycleStatus(r.status);
      const displayStatus = normalizedStatus ?? "Unknown";
      if (statusFilter !== "All" && displayStatus !== statusFilter) return false;
      if (!q) return true;

      const hay = [
        r.id,
        r.name,
        r.equipment_type ?? "",
        r.external_id ?? "",
        r.status ?? "",
        r.season ?? "",
        typeof r.current_hours === "number" ? String(r.current_hours) : "",
        r.make ?? "",
        r.model ?? "",
        typeof r.year === "number" ? String(r.year) : "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });

    result.sort((a, b) => {
      const aOperational = operationalByEquipmentId[a.id] ?? DEFAULT_OPERATIONAL_SUMMARY;
      const bOperational = operationalByEquipmentId[b.id] ?? DEFAULT_OPERATIONAL_SUMMARY;

      const aLifecyclePriority = lifecycleSortPriority(a.status);
      const bLifecyclePriority = lifecycleSortPriority(b.status);
      if (aLifecyclePriority !== bLifecyclePriority) return aLifecyclePriority - bLifecyclePriority;

      const aBucket =
        aOperational.pmStatus === "Overdue"
          ? 3
          : aOperational.openRequests > 0
            ? 4
            : aOperational.pmStatus === "Due Soon"
              ? 5
              : 6;
      const bBucket =
        bOperational.pmStatus === "Overdue"
          ? 3
          : bOperational.openRequests > 0
            ? 4
            : bOperational.pmStatus === "Due Soon"
              ? 5
              : 6;
      if (aBucket !== bBucket) return aBucket - bBucket;

      if (aOperational.openRequests !== bOperational.openRequests) {
        return bOperational.openRequests - aOperational.openRequests;
      }

      return (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
    });

    return result;
  }, [operationalByEquipmentId, rows, search, statusFilter]);

  const displayAssetIdByEquipmentId = useMemo(() => buildEquipmentDisplayIds(rows), [rows]);

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", paddingBottom: 32 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginTop: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Equipment</h1>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            {loading ? "Loading equipment..." : "Click a record to view details."}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID, name, type, status..."
            style={{ ...inputStyle(), width: 320, maxWidth: "100%" }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ ...inputStyle(), width: 180 }}
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {canCreateEquipment ? (
        <div style={{ marginTop: 12 }}>
          <Link href="/equipment/new" style={addButtonStyle}>
            + Add Equipment
          </Link>
        </div>
      ) : null}

      <div style={{ marginTop: 16, ...cardStyle() }}>
        {errorMessage ? (
          <div style={{ opacity: 0.9, color: "#ff9d9d" }}>{errorMessage}</div>
        ) : filtered.length === 0 ? (
          <div style={{ opacity: 0.75 }}>{loading ? "Loading..." : "No equipment found."}</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((r) => (
              <Link
                key={r.id}
                href={`/equipment/${encodeURIComponent(r.id)}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                {(() => {
                  const operational = operationalByEquipmentId[r.id] ?? DEFAULT_OPERATIONAL_SUMMARY;
                  const lifecycleLabel = normalizeAssetLifecycleStatus(r.status) ?? "Unknown";
                  const isHovered = hoveredEquipmentId === r.id;
                  const isOverdue = operational.pmStatus === "Overdue";
                  return (
                <div
                  onMouseEnter={() => setHoveredEquipmentId(r.id)}
                  onMouseLeave={() => setHoveredEquipmentId((curr) => (curr === r.id ? null : curr))}
                  style={{
                    border: isOverdue
                      ? isHovered
                        ? "1px solid rgba(255,120,120,0.46)"
                        : "1px solid rgba(255,96,96,0.32)"
                      : isHovered
                        ? "1px solid rgba(255,255,255,0.24)"
                        : "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 14,
                    padding: 10,
                    background: isOverdue
                      ? isHovered
                        ? "rgba(76,20,20,0.20)"
                        : "rgba(58,16,16,0.16)"
                      : isHovered
                        ? "rgba(255,255,255,0.032)"
                        : "rgba(255,255,255,0.02)",
                    boxShadow: isHovered ? "0 9px 22px rgba(0,0,0,0.30)" : "none",
                    transform: isHovered ? "translateY(-1px)" : "translateY(0)",
                    transition:
                      "transform 0.15s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                      alignItems: "flex-start",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 16 }}>
                        {r.name}
                      </div>
                      <div style={{ marginTop: 4, opacity: 0.62, fontSize: 12 }}>
                        <span style={{ opacity: 0.7 }}>Asset ID:</span>{" "}
                        <strong style={{ opacity: 0.9 }}>{displayAssetIdByEquipmentId[r.id] ?? r.id}</strong>
                      </div>
                      <div style={{ marginTop: 4, opacity: 0.66, fontSize: 12.5, fontWeight: 500 }}>
                        {compactLine([
                          r.equipment_type,
                          r.make,
                          r.model,
                          typeof r.year === "number" ? r.year : null,
                        ])}
                      </div>
                      <div
                        style={{
                          marginTop: 5,
                          fontSize: 12,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ color: "rgba(255,255,255,0.58)", fontWeight: 600 }}>
                          {typeof r.current_hours === "number" ? `${r.current_hours.toLocaleString()} hrs` : "—"}
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.32)" }}>·</span>
                        <span style={{ ...pmStateTextStyle(operational.pmStatus), fontWeight: 900 }}>
                          PM {operational.pmStatus}
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.32)" }}>·</span>
                        <span style={{ color: "rgba(255,255,255,0.78)", fontWeight: 700 }}>
                          <span
                            style={{
                              color:
                                operational.openRequests > 0
                                  ? "rgba(255,255,255,0.96)"
                                  : "rgba(255,255,255,0.74)",
                              fontWeight: 900,
                            }}
                          >
                            {operational.openRequests}
                          </span>{" "}
                          Open Request{operational.openRequests === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 0,
                      }}
                    >
                      <span style={statusBadgeStyle(lifecycleLabel)}>{lifecycleLabel}</span>
                    </div>
                  </div>
                </div>
                  );
                })()}
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

const addButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
  color: "inherit",
  fontWeight: 900,
  border: "1px solid rgba(126,255,167,0.35)",
  background: "rgba(126,255,167,0.14)",
  borderRadius: 12,
  padding: "10px 14px",
};
