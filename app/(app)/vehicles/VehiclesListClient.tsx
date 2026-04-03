"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { buildVehicleAssetIdPrefix } from "@/lib/assetIdFormat";
import { MAINTENANCE_ACTIVE_STATUSES } from "@/lib/maintenanceStatus";
import {
  ASSET_LIFECYCLE_STATUSES,
  assetLifecycleStatusTone,
  normalizeAssetLifecycleStatus,
  sortLifecycleStatusesForFilter,
} from "@/lib/assetLifecycleStatus";

/* ======================
   Supabase setup
====================== */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/* ======================
   Types
====================== */

type VehicleRecord = {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  status: string | null;
  type: string | null;
  mileage: number | null;
  asset: string | null;
};

type PmStatus = "On Track" | "Due Soon" | "Overdue";

type VehicleOperationalSummary = {
  pmStatus: PmStatus;
  openRequests: number;
};

type VehiclePmEventRow = {
  vehicle_id: string | null;
  created_at: string;
  mileage: number | null;
  result: unknown;
};

const DEFAULT_OPERATIONAL_SUMMARY: VehicleOperationalSummary = {
  pmStatus: "On Track",
  openRequests: 0,
};

function normalizeVehicleType(t: string | null): "truck" | "car" | "skidsteer" | "loader" {
  const x = (t ?? "").trim().toLowerCase();
  if (x === "truck") return "truck";
  if (x === "car") return "car";
  if (x === "skidsteer" || x === "skid steer" || x === "skid_steer") return "skidsteer";
  if (x === "loader") return "loader";
  return "truck";
}

function isHoursBasedVehicleType(t: "truck" | "car" | "skidsteer" | "loader") {
  return t === "skidsteer" || t === "loader";
}

function vehiclePmInterval(t: "truck" | "car" | "skidsteer" | "loader") {
  return isHoursBasedVehicleType(t) ? 200 : 5000;
}

function vehicleDueSoonWindow(t: "truck" | "car" | "skidsteer" | "loader") {
  const interval = vehiclePmInterval(t);
  return isHoursBasedVehicleType(t)
    ? Math.max(10, Math.round(interval * 0.1))
    : Math.max(100, Math.round(interval * 0.1));
}

function isOilChangeFromResult(result: unknown) {
  const root = result && typeof result === "object" ? (result as Record<string, unknown>) : null;
  const truckPm =
    root && root.truckPm && typeof root.truckPm === "object"
      ? (root.truckPm as Record<string, unknown>)
      : null;
  const rawOilChange = truckPm?.oilChangePerformed ?? root?.oilChangePerformed;
  return rawOilChange === true || rawOilChange === "yes";
}

/* ======================
   Styles
====================== */

function cardStyle(): CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
  };
}

function inputStyle(): CSSProperties {
  return {
    width: "100%",
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.03)",
    color: "inherit",
  };
}

function statusBadgeStyle(status: string | null | undefined): CSSProperties {
  const rawStatus = (normalizeAssetLifecycleStatus(status) ?? "").toLowerCase();
  const base: CSSProperties = {
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

function pmStateTextStyle(pmStatus: PmStatus): CSSProperties {
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

/* ======================
   Page
====================== */

export default function VehiclesListClient({
  canCreateVehicle,
}: {
  canCreateVehicle: boolean;
}) {
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [hoveredVehicleId, setHoveredVehicleId] = useState<string | null>(null);
  const [operationalByVehicleId, setOperationalByVehicleId] = useState<
    Record<string, VehicleOperationalSummary>
  >({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Debug info
  const [rawCount, setRawCount] = useState<number | null>(null);
  const [debug, setDebug] = useState<string>("");

  const envOk = Boolean(SUPABASE_URL && SUPABASE_ANON);
  const isDev = process.env.NODE_ENV === "development";
  const [showDebug, setShowDebug] = useState(false);

  const displayAssetIdByVehicleId = useMemo(() => {
    const maxByPrefix: Record<string, number> = {};
    for (const row of vehicles) {
      const existing = (row.asset ?? "").trim();
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
    for (const row of vehicles) {
      const existing = (row.asset ?? "").trim();
      if (existing) {
        const simpleMatch = /^(Truck|Trailer)_(\d+)$/i.exec(existing);
        if (simpleMatch) {
          map[row.id] = `Truck_${Number(simpleMatch[2])}`;
        } else {
          map[row.id] = existing;
        }
        continue;
      }
      const prefix = buildVehicleAssetIdPrefix({
        vehicleType: row.type,
        make: row.make,
      });
      const seq = (maxByPrefix[prefix] ?? 0) + 1;
      maxByPrefix[prefix] = seq;
      map[row.id] = prefix === "Truck" ? `Truck_${seq}` : `${prefix}-${seq}`;
    }
    return map;
  }, [vehicles]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);
      setDebug("");

      try {
        const supabase = createSupabaseBrowser();

        const res = await supabase
          .from("vehicles")
          .select("id,name,make,model,year,status,type,mileage,asset")
          .order("id", { ascending: true });

        if (!alive) return;

        if (res.error) {
          setErr(`${res.error.message}\n\n${JSON.stringify(res.error, null, 2)}`);
          setVehicles([]);
          setRawCount(null);
        } else {
          const rows = (res.data ?? []) as VehicleRecord[];
          setVehicles(rows);
          setRawCount(rows.length);
          setDebug(`Loaded ${rows.length} rows from vehicles`);
        }
      } catch (e) {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : String(e);
        setErr(msg);
        setVehicles([]);
        setRawCount(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (vehicles.length === 0) {
        if (alive) setOperationalByVehicleId({});
        return;
      }

      const supabase = createSupabaseBrowser();
      const vehicleIds = vehicles.map((v) => v.id);

      const [openRequestsRes, pmEventsRes] = await Promise.all([
        supabase
          .from("maintenance_requests")
          .select("vehicle_id,status")
          .in("vehicle_id", vehicleIds)
          .in("status", MAINTENANCE_ACTIVE_STATUSES),
        supabase
          .from("vehicle_pm_events")
          .select("vehicle_id,created_at,mileage,result")
          .in("vehicle_id", vehicleIds)
          .order("created_at", { ascending: false })
          .limit(5000),
      ]);

      if (!alive) return;

      const openRequestsByVehicleId: Record<string, number> = {};
      if (!openRequestsRes.error && Array.isArray(openRequestsRes.data)) {
        for (const row of openRequestsRes.data as Array<{ vehicle_id: string | null }>) {
          const vehicleId = row.vehicle_id ?? "";
          if (!vehicleId) continue;
          openRequestsByVehicleId[vehicleId] = (openRequestsByVehicleId[vehicleId] ?? 0) + 1;
        }
      }

      const lastOilChangeMileageByVehicleId: Record<string, number> = {};
      if (!pmEventsRes.error && Array.isArray(pmEventsRes.data)) {
        for (const row of pmEventsRes.data as VehiclePmEventRow[]) {
          const vehicleId = row.vehicle_id ?? "";
          if (!vehicleId || vehicleId in lastOilChangeMileageByVehicleId) continue;
          const mileage = Number(row.mileage);
          if (!Number.isFinite(mileage)) continue;
          if (!isOilChangeFromResult(row.result)) continue;
          lastOilChangeMileageByVehicleId[vehicleId] = mileage;
        }
      }

      const summaryByVehicleId: Record<string, VehicleOperationalSummary> = {};
      for (const vehicle of vehicles) {
        const normalizedType = normalizeVehicleType(vehicle.type ?? null);
        const interval = vehiclePmInterval(normalizedType);
        const dueSoonWindow = vehicleDueSoonWindow(normalizedType);
        const currentReading = Number(vehicle.mileage);
        const hasReading = Number.isFinite(currentReading) && currentReading >= 0;
        const lastPmReading = lastOilChangeMileageByVehicleId[vehicle.id] ?? 0;

        let pmStatus: PmStatus = "On Track";
        if (hasReading) {
          const dueAt = lastPmReading + interval;
          const delta = dueAt - currentReading;
          if (currentReading >= dueAt) pmStatus = "Overdue";
          else if (delta <= dueSoonWindow) pmStatus = "Due Soon";
        }

        summaryByVehicleId[vehicle.id] = {
          pmStatus,
          openRequests: openRequestsByVehicleId[vehicle.id] ?? 0,
        };
      }

      setOperationalByVehicleId(summaryByVehicleId);
    })();

    return () => {
      alive = false;
    };
  }, [vehicles]);

  const statuses = useMemo(() => {
    const set = new Set<string>(ASSET_LIFECYCLE_STATUSES);
    let hasUnknown = false;
    for (const row of vehicles) {
      const normalized = normalizeAssetLifecycleStatus(row.status);
      if (normalized) set.add(normalized);
      else hasUnknown = true;
    }
    const ordered = sortLifecycleStatusesForFilter(Array.from(set));
    if (hasUnknown && !ordered.includes("Unknown")) ordered.push("Unknown");
    return ["All", ...ordered];
  }, [vehicles]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const result = vehicles.filter((v) => {
      const normalizedStatus = normalizeAssetLifecycleStatus(v.status);
      const displayStatus = normalizedStatus ?? "Unknown";
      if (statusFilter !== "All" && displayStatus !== statusFilter) return false;
      if (!query) return true;

      const hay = [
        v.id,
        v.name,
        v.make ?? "",
        v.model ?? "",
        typeof v.year === "number" ? String(v.year) : "",
        v.status ?? "",
        v.type ?? "",
        v.asset ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(query);
    });

    result.sort((a, b) => {
      const aOperational = operationalByVehicleId[a.id] ?? DEFAULT_OPERATIONAL_SUMMARY;
      const bOperational = operationalByVehicleId[b.id] ?? DEFAULT_OPERATIONAL_SUMMARY;

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
  }, [operationalByVehicleId, q, statusFilter, vehicles]);

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", paddingBottom: 32 }}>
      {/* DEBUG PANEL (dev only) */}
      {showDebug && (
        <div style={{ marginTop: 16, ...cardStyle() }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Debug</div>
          <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.4 }}>
            <div>
              SUPABASE_URL:{" "}
              <strong>{SUPABASE_URL ? "✅ set" : "❌ missing"}</strong>
            </div>
            <div>
              SUPABASE_ANON_KEY:{" "}
              <strong>{SUPABASE_ANON ? "✅ set" : "❌ missing"}</strong>
            </div>
            <div>
              Raw rows returned:{" "}
              <strong>{rawCount === null ? "—" : rawCount}</strong>
            </div>

            {debug ? <div style={{ marginTop: 6 }}>{debug}</div> : null}
            {!envOk ? (
              <div style={{ marginTop: 8, opacity: 0.9 }}>
                Fix: add env vars to <code>.env.local</code> and restart dev
                server.
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Header */}
      {isDev && (
        <button
          onClick={() => setShowDebug((s) => !s)}
          style={{
            marginTop: 12,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.05)",
            color: "inherit",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          {showDebug ? "Hide Debug" : "Show Debug"}
        </button>
      )}

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
          <h1 style={{ margin: 0 }}>Vehicles</h1>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            {loading ? "Loading vehicles..." : "Click a vehicle to view details."}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by ID, name, make, model, year..."
            style={{ ...inputStyle(), width: 320, maxWidth: "100%" }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ ...inputStyle(), width: 180 }}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {canCreateVehicle ? (
        <div style={{ marginTop: 12 }}>
          <Link href="/vehicles/new" style={addButtonStyle}>
            + Add Vehicle
          </Link>
        </div>
      ) : null}

      {/* List */}
      <div style={{ marginTop: 16, ...cardStyle() }}>
        {err ? (
          <div style={{ opacity: 0.95 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>
              Couldn’t load vehicles
            </div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                opacity: 0.85,
                fontSize: 12,
                margin: 0,
              }}
            >
              {err}
            </pre>
          </div>
        ) : (
          <>
            <div style={{ opacity: 0.8, fontSize: 13, marginBottom: 10 }}>
              Showing <strong>{filtered.length}</strong> vehicle
              {filtered.length === 1 ? "" : "s"}.
            </div>

            {filtered.length === 0 ? (
              <div style={{ opacity: 0.75 }}>
                {loading ? "Loading..." : "No vehicles found."}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {filtered.map((v) => (
                  <Link
                    key={v.id}
                    href={`/vehicles/${encodeURIComponent(v.id)}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    {(() => {
                      const operational = operationalByVehicleId[v.id] ?? DEFAULT_OPERATIONAL_SUMMARY;
                      const lifecycleLabel = normalizeAssetLifecycleStatus(v.status) ?? "Unknown";
                      const isHovered = hoveredVehicleId === v.id;
                      const isOverdue = operational.pmStatus === "Overdue";
                      return (
                    <div
                      onMouseEnter={() => setHoveredVehicleId(v.id)}
                      onMouseLeave={() => setHoveredVehicleId((curr) => (curr === v.id ? null : curr))}
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
                          <div style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.15 }}>
                            {v.name}
                          </div>
                          <div
                            style={{
                              marginTop: 4,
                              opacity: 0.62,
                              fontSize: 12,
                            }}
                          >
                            <span style={{ opacity: 0.7 }}>Asset ID:</span>{" "}
                            <strong style={{ opacity: 0.9 }}>{displayAssetIdByVehicleId[v.id] ?? v.id}</strong>
                          </div>
                          <div style={{ marginTop: 5, opacity: 0.66, fontSize: 12.5, fontWeight: 500 }}>
                            {compactLine([v.make, v.model, typeof v.year === "number" ? v.year : null, v.type])}
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
                              {typeof v.mileage === "number" ? `${v.mileage.toLocaleString()} mi` : "—"}
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
          </>
        )}
      </div>
    </main>
  );
}

const addButtonStyle: CSSProperties = {
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
