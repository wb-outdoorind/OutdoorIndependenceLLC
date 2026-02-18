"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import AcademyAssetSection from "@/components/academy/AcademyAssetSection";

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

type MaintenanceRequestPreviewRow = {
  id: string;
  vehicle_id: string;
  created_at: string;
  status: string | null;
  urgency: string | null;
  system_affected: string | null;
  description: string | null;
};

type HistoryPreviewItem = {
  type: "Maintenance Request";
  createdAt: string;
  title: string;
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
  const routeVehicleId = params.vehicleID;
  const vehicleIdFromRoute = decodeURIComponent(routeVehicleId);

  const searchParams = useSearchParams();
  const assetParam = (searchParams.get("asset") || "").trim();
  const plateParam = (searchParams.get("plate") || "").trim();
  const [requestPreviewRows, setRequestPreviewRows] = useState<MaintenanceRequestPreviewRow[]>([]);
  const [requestPreviewError, setRequestPreviewError] = useState<string | null>(null);

  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [vehicleLoading, setVehicleLoading] = useState(true);
  const [vehicleErr, setVehicleErr] = useState<string | null>(null);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setHasMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const supabase = createSupabaseBrowser();
      setVehicleLoading(true);
      setVehicleErr(null);
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      console.log("[vehicle-detail] user present:", Boolean(authData.user));
      if (authErr) console.error("[vehicle-detail] auth check error:", authErr);
      if (!authData.user) {
        setVehicle(null);
        setVehicleErr("Not authenticated. Please sign in again.");
        setVehicleLoading(false);
        return;
      }

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
        console.error("Vehicle load by id error:", byId.error);
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
      console.log("[vehicle-detail] no vehicle row by id", {
        triedId: vehicleIdFromRoute,
        routeParam: routeVehicleId,
        userId: authData.user.id,
      });

      // 2) Fallback by asset
      if (assetParam) {
        const byAsset = await supabase
          .from("vehicles")
          .select("id,name,type,make,model,year,vin,plate,fuel,mileage,status,asset")
          .eq("asset", assetParam)
          .maybeSingle();

        if (!alive) return;

        if (byAsset.error) {
          console.error("Vehicle load by asset error:", byAsset.error);
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
          console.error("Vehicle load by plate error:", byPlate.error);
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
  }, [vehicleIdFromRoute, routeVehicleId, assetParam, plateParam]);

  const { localMileage, pmRecords } = useMemo(() => {
    if (!hasMounted || typeof window === "undefined") {
      return {
        localMileage: undefined as number | undefined,
        pmRecords: [] as VehiclePMRecord[],
      };
    }

    const storageId = vehicle?.id ?? vehicleIdFromRoute;

    const rawMileage = localStorage.getItem(vehicleMileageKey(storageId));
    const n = rawMileage ? Number(rawMileage) : NaN;
    const parsedLocalMileage = Number.isFinite(n) ? n : undefined;

    return {
      localMileage: parsedLocalMileage,
      pmRecords: safeParse<VehiclePMRecord[]>(
        localStorage.getItem(vehiclePmKey(storageId)),
        []
      ),
    };
  }, [hasMounted, vehicleIdFromRoute, vehicle?.id]);

  useEffect(() => {
    let alive = true;

    (async () => {
      const supabase = createSupabaseBrowser();
      setRequestPreviewError(null);
      const { data, error } = await supabase
        .from("maintenance_requests")
        .select("id, created_at, status, urgency, system_affected, description, vehicle_id")
        .eq("vehicle_id", params.vehicleID)
        .order("created_at", { ascending: false })
        .limit(4);

      if (!alive) return;
      if (error || !data) {
        if (error) {
          console.error("Vehicle preview requests load error:", error);
          setRequestPreviewError(error.message);
        }
        setRequestPreviewRows([]);
        return;
      }

      setRequestPreviewRows(data as MaintenanceRequestPreviewRow[]);
    })();

    return () => {
      alive = false;
    };
  }, [params.vehicleID]);

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
    return requestPreviewRows.map((r) => {
      const parsed = parseTitleAndDescription(r.description);
      return {
        type: "Maintenance Request",
        createdAt: r.created_at,
        title:
          parsed.title ||
          (r.system_affected?.trim() ? `${r.system_affected} issue` : "Maintenance Request"),
        status: r.status ?? undefined,
        notes: parsed.description || undefined,
      };
    });
  }, [requestPreviewRows]);

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

      <AcademyAssetSection vehicleId={stableVehicleId} assetType={vehicle?.type ?? ""} />

      {/* Maintenance history preview */}
      <div style={{ marginTop: 18, ...cardStyle() }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Recent Maintenance History</div>
          <div style={{ opacity: 0.75, fontSize: 13 }}>Last 4 maintenance requests</div>
        </div>

        <div style={{ marginTop: 12 }}>
          {requestPreviewError ? (
            <div style={{ opacity: 0.9, color: "#ff9d9d" }}>
              Failed to load maintenance requests preview.
            </div>
          ) : historyPreview.length === 0 ? (
            <div style={{ opacity: 0.75 }}>
              No maintenance requests yet.
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
                    {r.status ? <span>{r.status}</span> : null}
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
