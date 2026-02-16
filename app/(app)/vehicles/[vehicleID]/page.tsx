"use client";

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

/* =========================
   Supabase client
========================= */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* =========================
   Types
========================= */

type VehicleRow = {
  id: string;
  name: string | null;
  type: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  plate: string | null;
  fuel: string | null;
  mileage: number | null;
  status: string | null;
  asset: string | null;
};

type VehiclePMRecord = {
  id: string;
  vehicleId: string;
  createdAt: string;
  mileage: number;
  oilChangePerformed: boolean;
  notes?: string;
};

type MaintenanceLogRecord = {
  id: string;
  vehicleId: string;
  createdAt: string;
  mileage: number;
  title: string;
  status: "Closed" | "In Progress";
  notes: string;
};

type HistoryPreviewItem = {
  type: "Vehicle PM" | "Maintenance Log";
  createdAt: string;
  title: string;
  mileage?: number;
  status?: string;
  notes?: string;
};

type VehicleType = "truck" | "car" | "skidsteer" | "loader";

/* =========================
   Local storage keys
========================= */

function vehiclePmKey(vehicleId: string) {
  return `vehicle:${vehicleId}:vehicle_pm`;
}
function maintenanceLogKey(vehicleId: string) {
  return `vehicle:${vehicleId}:maintenance_log`;
}
function vehicleMileageKey(vehicleId: string) {
  return `vehicle:${vehicleId}:mileage`;
}
function vehicleTypeKey(vehicleId: string) {
  return `vehicle:${vehicleId}:type`;
}
function vehicleNameKey(vehicleId: string) {
  return `vehicle:${vehicleId}:name`;
}

/* =========================
   Helpers
========================= */

function normalizeVehicleType(t: string | null): VehicleType {
  const x = (t ?? "").trim().toLowerCase();
  if (x === "truck") return "truck";
  if (x === "car") return "car";
  if (x === "skidsteer" || x === "skid steer" || x === "skid_steer")
    return "skidsteer";
  if (x === "loader") return "loader";
  return "truck";
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
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

function pillStyle(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    fontSize: 13,
    fontWeight: 800,
    textDecoration: "none",
    color: "inherit",
  };
}

function actionBtnStyle(): React.CSSProperties {
  return {
    textDecoration: "none",
    color: "inherit",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 14,
    padding: 14,
    background: "rgba(255,255,255,0.03)",
    fontWeight: 900,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  };
}

function badgeStyle(label: string): React.CSSProperties {
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

  if (label === "Active")
    return {
      ...base,
      border: "1px solid rgba(0,255,120,0.22)",
      background: "rgba(0,255,120,0.08)",
    };
  if (label === "Inactive")
    return {
      ...base,
      border: "1px solid rgba(255,210,0,0.26)",
      background: "rgba(255,210,0,0.10)",
    };
  if (label === "Retired" || label === "Out of Service")
    return {
      ...base,
      border: "1px solid rgba(255,80,80,0.28)",
      background: "rgba(255,80,80,0.10)",
    };

  return base;
}

function computeOilLifePercent(
  currentMileage: number | undefined,
  lastOilChangeMileage: number | undefined
) {
  if (typeof currentMileage !== "number") return null;
  if (typeof lastOilChangeMileage !== "number") return null;

  const interval = 5000;
  const used = currentMileage - lastOilChangeMileage;
  const remaining = interval - used;
  const pct = Math.round((remaining / interval) * 100);

  return Math.max(0, Math.min(100, pct));
}

/* =========================
   Page
========================= */

export default function VehicleDetailPage() {
  // folder: /vehicles/[vehicleID]
  const params = useParams<{ vehicleID: string }>();
  const vehicleIdFromRoute = decodeURIComponent(params.vehicleID);

  const searchParams = useSearchParams();
  const assetParam = (searchParams.get("asset") || "").trim();
  const plateParam = (searchParams.get("plate") || "").trim();

  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [vehicleLoading, setVehicleLoading] = useState(true);
  const [vehicleErr, setVehicleErr] = useState<string | null>(null);

  const [localMileage, setLocalMileage] = useState<number | undefined>(undefined);
  const [pmRecords, setPmRecords] = useState<VehiclePMRecord[]>([]);
  const [logRecords, setLogRecords] = useState<MaintenanceLogRecord[]>([]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setVehicleLoading(true);
      setVehicleErr(null);

      const hydrateLocal = (row: VehicleRow) => {
        if (typeof window === "undefined") return;

        // ✅ type
        const vt = normalizeVehicleType(row.type);
        localStorage.setItem(vehicleTypeKey(row.id), vt);

        // ✅ name (so forms can display it)
        localStorage.setItem(vehicleNameKey(row.id), row.name ?? "");

        // ✅ mileage
        if (typeof row.mileage === "number") {
          localStorage.setItem(vehicleMileageKey(row.id), String(row.mileage));
        }
      };

      // 1) Try lookup by id
      const byId = await supabase
        .from("vehicles")
        .select("id,name,type,make,model,year,vin,plate,fuel,mileage,status,asset")
        .eq("id", vehicleIdFromRoute)
        .maybeSingle();

      if (!alive) return;

      if (byId.error) {
        setVehicle(null);
        setVehicleErr(byId.error.message);
        setVehicleLoading(false);
        return;
      }

      if (byId.data) {
        const row = byId.data as VehicleRow;
        hydrateLocal(row);
        setVehicle(row);
        setVehicleLoading(false);
        return;
      }

      // 2) Fallback by asset
      if (assetParam) {
        const byAsset = await supabase
          .from("vehicles")
          .select("id,name,type,make,model,year,vin,plate,fuel,mileage,status,asset")
          .eq("asset", assetParam)
          .maybeSingle();

        if (!alive) return;

        if (byAsset.error) {
          setVehicle(null);
          setVehicleErr(byAsset.error.message);
          setVehicleLoading(false);
          return;
        }

        if (byAsset.data) {
          const row = byAsset.data as VehicleRow;
          hydrateLocal(row);
          setVehicle(row);
          setVehicleLoading(false);
          return;
        }
      }

      // 3) Fallback by plate
      if (plateParam) {
        const byPlate = await supabase
          .from("vehicles")
          .select("id,name,type,make,model,year,vin,plate,fuel,mileage,status,asset")
          .eq("plate", plateParam)
          .maybeSingle();

        if (!alive) return;

        if (byPlate.error) {
          setVehicle(null);
          setVehicleErr(byPlate.error.message);
          setVehicleLoading(false);
          return;
        }

        if (byPlate.data) {
          const row = byPlate.data as VehicleRow;
          hydrateLocal(row);
          setVehicle(row);
          setVehicleLoading(false);
          return;
        }
      }

      setVehicle(null);
      setVehicleErr(
        `Vehicle not found. Tried id="${vehicleIdFromRoute}"` +
          (assetParam ? `, asset="${assetParam}"` : "") +
          (plateParam ? `, plate="${plateParam}"` : "")
      );
      setVehicleLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [vehicleIdFromRoute, assetParam, plateParam]);

  // Load localStorage values (PM/logs + local mileage)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const storageId = vehicle?.id ?? vehicleIdFromRoute;

    const rawMileage = localStorage.getItem(vehicleMileageKey(storageId));
    const n = rawMileage ? Number(rawMileage) : NaN;
    setLocalMileage(Number.isFinite(n) ? n : undefined);

    const pms = safeParse<VehiclePMRecord[]>(
      localStorage.getItem(vehiclePmKey(storageId)),
      []
    );
    const logs = safeParse<MaintenanceLogRecord[]>(
      localStorage.getItem(maintenanceLogKey(storageId)),
      []
    );

    setPmRecords(pms);
    setLogRecords(logs);
  }, [vehicleIdFromRoute, vehicle?.id]);

  // Display fields
  const displayName = vehicle?.name ?? "Vehicle";
  const displayMake = vehicle?.make ?? "—";
  const displayModel = vehicle?.model ?? "—";
  const displayYear = typeof vehicle?.year === "number" ? vehicle.year : undefined;
  const displayPlate = vehicle?.plate ?? "—";
  const displayVin = vehicle?.vin ?? "—";
  const displayFuel = vehicle?.fuel ?? "—";
  const displayStatus = vehicle?.status ?? "—";

  const currentMileage = useMemo(() => {
    const supa = typeof vehicle?.mileage === "number" ? vehicle.mileage : undefined;
    if (typeof supa === "number" && typeof localMileage === "number")
      return Math.max(supa, localMileage);
    return typeof localMileage === "number" ? localMileage : supa;
  }, [vehicle?.mileage, localMileage]);

  const lastOilChangeMileage = useMemo(() => {
    const oilChanges = pmRecords
      .filter((x) => x.oilChangePerformed && typeof x.mileage === "number")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return oilChanges.length ? oilChanges[0].mileage : undefined;
  }, [pmRecords]);

  const oilLifePercent = computeOilLifePercent(currentMileage, lastOilChangeMileage);

  const historyPreview = useMemo<HistoryPreviewItem[]>(() => {
    const pmItems: HistoryPreviewItem[] = pmRecords.map((x) => ({
      type: "Vehicle PM",
      createdAt: x.createdAt,
      title: x.oilChangePerformed ? "Vehicle PM — Oil Change Performed" : "Vehicle PM",
      mileage: x.mileage,
      status: x.oilChangePerformed ? "Oil life reset" : undefined,
      notes: x.notes,
    }));

    const logItems: HistoryPreviewItem[] = logRecords.map((x) => ({
      type: "Maintenance Log",
      createdAt: x.createdAt,
      title: x.title?.trim() ? x.title : "Maintenance Log",
      mileage: x.mileage,
      status: x.status,
      notes: x.notes,
    }));

    return [...pmItems, ...logItems]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 4);
  }, [pmRecords, logRecords]);

  // ✅ IMPORTANT: stable id for links (never empty)
  const stableVehicleId = vehicle?.id ?? vehicleIdFromRoute;
  const routeIdForLinks = encodeURIComponent(stableVehicleId);

  return (
    <main style={{ padding: 32, maxWidth: 1100, margin: "0 auto", paddingBottom: 40 }}>
      {/* Top row */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>{displayName}</h1>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            Vehicle ID: <strong>{vehicle?.id ?? vehicleIdFromRoute}</strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/vehicles" style={pillStyle()}>
            ← Back to Vehicles
          </Link>

          <Link href={`/vehicles/${routeIdForLinks}/history`} style={pillStyle()}>
            Full History →
          </Link>
        </div>
      </div>

      {/* Load/error banner */}
      {vehicleLoading ? (
        <div style={{ marginTop: 14, opacity: 0.75 }}>Loading vehicle from Supabase…</div>
      ) : vehicleErr ? (
        <div
          style={{
            marginTop: 14,
            border: "1px solid rgba(255,80,80,0.30)",
            background: "rgba(255,80,80,0.06)",
            padding: 12,
            borderRadius: 12,
          }}
        >
          <div style={{ fontWeight: 900 }}>Couldn’t load vehicle</div>
          <div style={{ opacity: 0.8, marginTop: 6, fontSize: 13 }}>{vehicleErr}</div>
        </div>
      ) : null}

      {/* General info card */}
      <div style={{ marginTop: 18, ...cardStyle(), position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>General Information</div>
          <div style={badgeStyle(displayStatus)}>{displayStatus}</div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginTop: 14,
          }}
        >
          <div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>Make</div>
            <div style={{ fontWeight: 900 }}>{displayMake}</div>
          </div>
          <div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>Model</div>
            <div style={{ fontWeight: 900 }}>{displayModel}</div>
          </div>
          <div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>Year</div>
            <div style={{ fontWeight: 900 }}>{typeof displayYear === "number" ? displayYear : "—"}</div>
          </div>
          <div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>License Plate</div>
            <div style={{ fontWeight: 900 }}>{displayPlate}</div>
          </div>
          <div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>VIN</div>
            <div style={{ fontWeight: 900, wordBreak: "break-all" }}>{displayVin}</div>
          </div>
          <div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>Mileage</div>
            <div style={{ fontWeight: 900 }}>
              {typeof currentMileage === "number" ? `${currentMileage.toLocaleString()} mi` : "—"}
            </div>
          </div>
          <div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>Fuel Type</div>
            <div style={{ fontWeight: 900 }}>{displayFuel}</div>
          </div>
          <div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>Oil Life</div>
            <div style={{ fontWeight: 900, fontSize: 18, marginTop: 2 }}>
              {oilLifePercent === null ? "—" : `${oilLifePercent}%`}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ marginTop: 18, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Forms</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
          <Link href={`/vehicles/${routeIdForLinks}/forms/pre-trip`} style={actionBtnStyle()}>
            <span>Pre-Trip Inspection</span>
            <span style={{ opacity: 0.75 }}>→</span>
          </Link>

          <Link href={`/vehicles/${routeIdForLinks}/forms/post-trip`} style={actionBtnStyle()}>
            <span>Post-Trip Inspection</span>
            <span style={{ opacity: 0.75 }}>→</span>
          </Link>

          <Link href={`/vehicles/${routeIdForLinks}/forms/maintenance-request`} style={actionBtnStyle()}>
            <span>Maintenance Request</span>
            <span style={{ opacity: 0.75 }}>→</span>
          </Link>

          <Link href={`/vehicles/${routeIdForLinks}/forms/maintenance-log`} style={actionBtnStyle()}>
            <span>Maintenance Log</span>
            <span style={{ opacity: 0.75 }}>→</span>
          </Link>

          <Link href={`/vehicles/${routeIdForLinks}/forms/preventative-maintenance`} style={actionBtnStyle()}>
            <span>Preventative Maintenance</span>
            <span style={{ opacity: 0.75 }}>→</span>
          </Link>

          <Link href={`/vehicles/${routeIdForLinks}/history`} style={actionBtnStyle()}>
            <span>Full History</span>
            <span style={{ opacity: 0.75 }}>→</span>
          </Link>
        </div>
      </div>

      {/* Maintenance history preview */}
      <div style={{ marginTop: 18, ...cardStyle() }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Recent Maintenance History</div>
          <div style={{ opacity: 0.75, fontSize: 13 }}>Last 4 items (PM + Maintenance Logs)</div>
        </div>

        <div style={{ marginTop: 12 }}>
          {historyPreview.length === 0 ? (
            <div style={{ opacity: 0.75 }}>
              No maintenance history yet for this vehicle.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {historyPreview.map((r, idx) => (
                <div
                  key={`${r.type}:${r.createdAt}:${idx}`}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 14,
                    padding: 12,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900 }}>
                      {r.title}
                      <span style={{ marginLeft: 10, opacity: 0.75, fontWeight: 800, fontSize: 12 }}>
                        • {r.type}
                      </span>
                    </div>
                    <div style={{ opacity: 0.75, fontSize: 13 }}>{formatDateTime(r.createdAt)}</div>
                  </div>

                  <div style={{ marginTop: 6, opacity: 0.82, fontSize: 13 }}>
                    {typeof r.mileage === "number" ? <span>{r.mileage.toLocaleString()} mi</span> : null}
                    {r.status ? <span>{typeof r.mileage === "number" ? " • " : ""}{r.status}</span> : null}
                  </div>

                  {r.notes?.trim() ? (
                    <div style={{ marginTop: 8, opacity: 0.75, lineHeight: 1.35 }}>{r.notes}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
