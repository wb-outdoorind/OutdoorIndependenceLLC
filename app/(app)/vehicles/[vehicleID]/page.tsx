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

type MaintenanceLogPreviewRow = {
  id: string;
  vehicle_id: string;
  created_at: string;
  request_id: string | null;
  mechanic_self_score: number | null;
  status_update: string | null;
  notes: string | null;
};

type AssetHealthSummary = {
  healthScore: number;
  operationalScore: number;
  mechanicScore: number;
  openRequests: number;
  pmStatus: "On Track" | "Due Soon" | "Overdue";
};

type HistoryPreviewItem = {
  id: string;
  type: "Maintenance Request" | "Maintenance Log" | "Vehicle PM";
  createdAt: string;
  title: string;
  status?: string;
  notes?: string;
};

type VehicleType = "truck" | "car" | "skidsteer" | "loader";
type Role =
  | "owner"
  | "operations_manager"
  | "office_admin"
  | "mechanic"
  | "employee"
  | "team_lead_1"
  | "team_lead_2"
  | "team_member_1"
  | "team_member_2";

type VehicleEditDraft = {
  name: string;
  type: string;
  make: string;
  model: string;
  year: string;
  plate: string;
  vin: string;
  fuel: string;
  mileage: string;
  status: string;
  asset: string;
};

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

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function mechanicScoreBand(score: number) {
  if (score <= 25) return "Intervention";
  if (score <= 50) return "Needs Review";
  if (score <= 75) return "Operational";
  return "Good";
}

function combineMechanicScore(objectiveScore: number, mechanicSelfScore?: number | null) {
  if (!Number.isFinite(Number(mechanicSelfScore))) return objectiveScore;
  const self = clampPercent(Number(mechanicSelfScore));
  return clampPercent(objectiveScore * 0.8 + self * 0.2);
}

function legacyAssetAllowance(year: number | null | undefined) {
  if (!Number.isFinite(Number(year))) return 0;
  const nowYear = new Date().getFullYear();
  const age = nowYear - Number(year);
  if (age >= 18) return 14;
  if (age >= 12) return 10;
  if (age >= 8) return 6;
  return 0;
}

function maintenanceLogQualityScore(log: MaintenanceLogPreviewRow) {
  let objectiveScore = 100;
  if (!log.request_id) objectiveScore -= 6;
  if ((log.status_update ?? "").trim() === "In Progress") objectiveScore -= 8;
  if (!(log.status_update ?? "").trim()) objectiveScore -= 10;
  const notesLength = (log.notes ?? "").trim().length;
  if (notesLength < 20) objectiveScore -= 8;
  if (notesLength === 0) objectiveScore -= 8;
  const objective = clampPercent(objectiveScore);
  return combineMechanicScore(objective, log.mechanic_self_score);
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

const detailInputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
};

const editPrimaryButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(126,255,167,0.35)",
  background: "rgba(126,255,167,0.14)",
  color: "inherit",
  fontWeight: 800,
  cursor: "pointer",
};

const editSecondaryButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "transparent",
  color: "inherit",
  fontWeight: 800,
  cursor: "pointer",
};

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
  const [logPreviewRows, setLogPreviewRows] = useState<MaintenanceLogPreviewRow[]>([]);
  const [requestPreviewError, setRequestPreviewError] = useState<string | null>(null);
  const [logPreviewError, setLogPreviewError] = useState<string | null>(null);
  const [openRequestCountForHealth, setOpenRequestCountForHealth] = useState(0);

  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [editDraft, setEditDraft] = useState<VehicleEditDraft | null>(null);
  const [vehicleLoading, setVehicleLoading] = useState(true);
  const [vehicleErr, setVehicleErr] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [userRole, setUserRole] = useState<Role>("employee");
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

      const { data: roleProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();
      setUserRole((roleProfile?.role as Role | undefined) ?? "employee");

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
        setEditDraft({
          name: row.name ?? "",
          type: row.type ?? "",
          make: row.make ?? "",
          model: row.model ?? "",
          year: typeof row.year === "number" ? String(row.year) : "",
          plate: row.plate ?? "",
          vin: row.vin ?? "",
          fuel: row.fuel ?? "",
          mileage: typeof row.mileage === "number" ? String(row.mileage) : "",
          status: row.status ?? "",
          asset: row.asset ?? "",
        });
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
          setEditDraft({
            name: row.name ?? "",
            type: row.type ?? "",
            make: row.make ?? "",
            model: row.model ?? "",
            year: typeof row.year === "number" ? String(row.year) : "",
            plate: row.plate ?? "",
            vin: row.vin ?? "",
            fuel: row.fuel ?? "",
            mileage: typeof row.mileage === "number" ? String(row.mileage) : "",
            status: row.status ?? "",
            asset: row.asset ?? "",
          });
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
          setEditDraft({
            name: row.name ?? "",
            type: row.type ?? "",
            make: row.make ?? "",
            model: row.model ?? "",
            year: typeof row.year === "number" ? String(row.year) : "",
            plate: row.plate ?? "",
            vin: row.vin ?? "",
            fuel: row.fuel ?? "",
            mileage: typeof row.mileage === "number" ? String(row.mileage) : "",
            status: row.status ?? "",
            asset: row.asset ?? "",
          });
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
      setLogPreviewError(null);

      const [requestsRes, logsRes, openRequestsCountRes] = await Promise.all([
        supabase
          .from("maintenance_requests")
          .select("id, created_at, status, urgency, system_affected, description, vehicle_id")
          .eq("vehicle_id", params.vehicleID)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("maintenance_logs")
          .select("id, vehicle_id, created_at, request_id, mechanic_self_score, status_update, notes")
          .eq("vehicle_id", params.vehicleID)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("maintenance_requests")
          .select("id", { count: "exact", head: true })
          .eq("vehicle_id", params.vehicleID)
          .in("status", ["Open", "In Progress"]),
      ]);

      if (!alive) return;

      if (requestsRes.error || !requestsRes.data) {
        if (requestsRes.error) {
          console.error("Vehicle preview requests load error:", requestsRes.error);
          setRequestPreviewError(requestsRes.error.message);
        }
        setRequestPreviewRows([]);
      } else {
        setRequestPreviewRows(requestsRes.data as MaintenanceRequestPreviewRow[]);
      }

      if (logsRes.error || !logsRes.data) {
        if (logsRes.error) {
          console.error("Vehicle preview logs load error:", logsRes.error);
          setLogPreviewError(logsRes.error.message);
        }
        setLogPreviewRows([]);
      } else {
        setLogPreviewRows(logsRes.data as MaintenanceLogPreviewRow[]);
      }

      if (openRequestsCountRes.error) {
        console.error("Vehicle open request count load error:", openRequestsCountRes.error);
        setOpenRequestCountForHealth(0);
      } else {
        setOpenRequestCountForHealth(openRequestsCountRes.count ?? 0);
      }
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

  const vehicleHealthSummary = useMemo<AssetHealthSummary>(() => {
    const interval = 5000;
    const dueSoonWindow = 500;
    const lastPmMileage = typeof lastOilChangeMileage === "number" ? lastOilChangeMileage : 0;
    const current = typeof currentMileage === "number" ? currentMileage : null;

    let pmStatus: AssetHealthSummary["pmStatus"] = "On Track";
    if (current != null) {
      const dueAt = lastPmMileage + interval;
      const delta = dueAt - current;
      if (current >= dueAt) pmStatus = "Overdue";
      else if (delta <= dueSoonWindow) pmStatus = "Due Soon";
    }

    const recentLogs = logPreviewRows.slice(0, 6);
    const mechanicScore = recentLogs.length
      ? Math.round(
          recentLogs.reduce((sum, row) => sum + maintenanceLogQualityScore(row), 0) / recentLogs.length
        )
      : 75;

    let operationalScore = 100;
    const status = (vehicle?.status ?? "").trim();
    if (status === "Red Tagged" || status === "Out of Service") operationalScore -= 30;
    operationalScore -= Math.min(36, openRequestCountForHealth * 12);
    if (pmStatus === "Overdue") operationalScore -= 20;
    if (pmStatus === "Due Soon") operationalScore -= 10;
    operationalScore += legacyAssetAllowance(vehicle?.year);
    operationalScore = clampPercent(operationalScore);

    const healthScore = clampPercent(operationalScore * 0.8 + mechanicScore * 0.2);

    return {
      healthScore,
      operationalScore,
      mechanicScore,
      openRequests: openRequestCountForHealth,
      pmStatus,
    };
  }, [currentMileage, lastOilChangeMileage, logPreviewRows, openRequestCountForHealth, vehicle?.status, vehicle?.year]);

  const historyPreview = useMemo<HistoryPreviewItem[]>(() => {
    const requestItems = requestPreviewRows.map((r) => {
      const parsed = parseTitleAndDescription(r.description);
      return {
        id: r.id,
        type: "Maintenance Request" as const,
        createdAt: r.created_at,
        title:
          parsed.title ||
          (r.system_affected?.trim() ? `${r.system_affected} issue` : "Maintenance Request"),
        status: r.status ?? undefined,
        notes: parsed.description || undefined,
      };
    });

    const logItems = logPreviewRows.map((r) => ({
      id: r.id,
      type: "Maintenance Log" as const,
      createdAt: r.created_at,
      title: r.status_update?.trim() || "Maintenance Log",
      status: undefined,
      notes: r.notes?.trim() || undefined,
    }));

    const pmItems = pmRecords.map((r) => ({
      id: r.id,
      type: "Vehicle PM" as const,
      createdAt: r.createdAt,
      title: "Preventative Maintenance",
      status: r.oilChangePerformed ? "Oil changed" : "Inspection complete",
      notes: r.notes?.trim() || undefined,
    }));

    return [...requestItems, ...logItems, ...pmItems]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 4);
  }, [requestPreviewRows, logPreviewRows, pmRecords]);

  function historyItemHref(item: HistoryPreviewItem) {
    const type = encodeURIComponent(item.type);
    const id = encodeURIComponent(item.id);
    return `/vehicles/${routeIdForLinks}/history?focusType=${type}&focusId=${id}`;
  }

  // ✅ IMPORTANT: stable id for links (never empty)
  const stableVehicleId = vehicle?.id ?? vehicleIdFromRoute;
  const routeIdForLinks = encodeURIComponent(stableVehicleId);
  const canShowVehiclePmButton = (vehicle?.type ?? "").trim().toLowerCase() === "truck";
  const canEditVehicle =
    userRole === "owner" ||
    userRole === "operations_manager" ||
    userRole === "office_admin" ||
    userRole === "mechanic";
  const canViewMechanicScore =
    userRole === "owner" ||
    userRole === "operations_manager" ||
    userRole === "office_admin" ||
    userRole === "mechanic";

  function updateDraft<K extends keyof VehicleEditDraft>(key: K, value: VehicleEditDraft[K]) {
    setEditDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function resetDraftFromVehicle() {
    if (!vehicle) return;
    setEditDraft({
      name: vehicle.name ?? "",
      type: vehicle.type ?? "",
      make: vehicle.make ?? "",
      model: vehicle.model ?? "",
      year: typeof vehicle.year === "number" ? String(vehicle.year) : "",
      plate: vehicle.plate ?? "",
      vin: vehicle.vin ?? "",
      fuel: vehicle.fuel ?? "",
      mileage: typeof vehicle.mileage === "number" ? String(vehicle.mileage) : "",
      status: vehicle.status ?? "",
      asset: vehicle.asset ?? "",
    });
  }

  async function saveVehicleEdits() {
    if (!vehicle || !editDraft || !canEditVehicle) return;
    setEditError(null);

    const nextName = editDraft.name.trim();
    const nextType = editDraft.type.trim();
    const nextStatus = editDraft.status.trim();
    if (!nextName) return setEditError("Vehicle name is required.");
    if (!nextType) return setEditError("Vehicle type is required.");
    if (!nextStatus) return setEditError("Vehicle status is required.");

    let parsedYear: number | null = null;
    if (editDraft.year.trim()) {
      const y = Number(editDraft.year);
      if (!Number.isInteger(y) || y < 1900) {
        return setEditError("Year must be a valid integer.");
      }
      parsedYear = y;
    }

    let parsedMileage: number | null = null;
    if (editDraft.mileage.trim()) {
      const m = Number(editDraft.mileage);
      if (!Number.isFinite(m) || m < 0) {
        return setEditError("Mileage must be a valid non-negative number.");
      }
      parsedMileage = m;
    }

    setEditSaving(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("vehicles")
      .update({
        name: nextName,
        type: nextType,
        make: editDraft.make.trim() || null,
        model: editDraft.model.trim() || null,
        year: parsedYear,
        plate: editDraft.plate.trim() || null,
        vin: editDraft.vin.trim() || null,
        fuel: editDraft.fuel.trim() || null,
        mileage: parsedMileage,
        status: nextStatus,
        asset: editDraft.asset.trim() || null,
      })
      .eq("id", vehicle.id);
    setEditSaving(false);

    if (error) {
      setEditError(error.message);
      return;
    }

    const updatedVehicle: VehicleRow = {
      ...vehicle,
      name: nextName,
      type: nextType,
      make: editDraft.make.trim() || null,
      model: editDraft.model.trim() || null,
      year: parsedYear,
      plate: editDraft.plate.trim() || null,
      vin: editDraft.vin.trim() || null,
      fuel: editDraft.fuel.trim() || null,
      mileage: parsedMileage,
      status: nextStatus,
      asset: editDraft.asset.trim() || null,
    };
    setVehicle(updatedVehicle);
    setIsEditing(false);
    setEditDraft({
      name: updatedVehicle.name ?? "",
      type: updatedVehicle.type ?? "",
      make: updatedVehicle.make ?? "",
      model: updatedVehicle.model ?? "",
      year: typeof updatedVehicle.year === "number" ? String(updatedVehicle.year) : "",
      plate: updatedVehicle.plate ?? "",
      vin: updatedVehicle.vin ?? "",
      fuel: updatedVehicle.fuel ?? "",
      mileage: typeof updatedVehicle.mileage === "number" ? String(updatedVehicle.mileage) : "",
      status: updatedVehicle.status ?? "",
      asset: updatedVehicle.asset ?? "",
    });

    if (typeof window !== "undefined") {
      localStorage.setItem(vehicleNameKey(updatedVehicle.id), updatedVehicle.name ?? "");
      localStorage.setItem(vehicleTypeKey(updatedVehicle.id), normalizeVehicleType(updatedVehicle.type));
      if (typeof updatedVehicle.mileage === "number") {
        localStorage.setItem(vehicleMileageKey(updatedVehicle.id), String(updatedVehicle.mileage));
      }
    }
  }

  return (
    <main style={{ paddingBottom: 40 }}>
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {canEditVehicle ? (
              isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={saveVehicleEdits}
                    style={editPrimaryButtonStyle}
                    disabled={editSaving}
                  >
                    {editSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditError(null);
                      resetDraftFromVehicle();
                    }}
                    style={editSecondaryButtonStyle}
                    disabled={editSaving}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(true);
                    setEditError(null);
                  }}
                  style={editSecondaryButtonStyle}
                >
                  Edit Vehicle
                </button>
              )
            ) : null}
            <div style={badgeStyle(displayStatus)}>{displayStatus}</div>
          </div>
        </div>

        {isEditing && editDraft ? (
          <>
            {editError ? (
              <div style={{ marginTop: 12, color: "#ff9d9d", fontSize: 13 }}>{editError}</div>
            ) : null}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
                marginTop: 14,
              }}
            >
              <div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Vehicle Name *</div>
                <input
                  value={editDraft.name}
                  onChange={(e) => updateDraft("name", e.target.value)}
                  style={detailInputStyle}
                />
              </div>
              <div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Vehicle Type *</div>
                <input
                  value={editDraft.type}
                  onChange={(e) => updateDraft("type", e.target.value)}
                  style={detailInputStyle}
                />
              </div>
              <div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Status *</div>
                <select
                  value={editDraft.status}
                  onChange={(e) => updateDraft("status", e.target.value)}
                  style={detailInputStyle}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Out of Service">Out of Service</option>
                  <option value="Retired">Retired</option>
                </select>
              </div>
              <div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Make</div>
                <input value={editDraft.make} onChange={(e) => updateDraft("make", e.target.value)} style={detailInputStyle} />
              </div>
              <div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Model</div>
                <input value={editDraft.model} onChange={(e) => updateDraft("model", e.target.value)} style={detailInputStyle} />
              </div>
              <div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Year</div>
                <input value={editDraft.year} onChange={(e) => updateDraft("year", e.target.value)} style={detailInputStyle} inputMode="numeric" />
              </div>
              <div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>License Plate</div>
                <input value={editDraft.plate} onChange={(e) => updateDraft("plate", e.target.value)} style={detailInputStyle} />
              </div>
              <div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>VIN</div>
                <input value={editDraft.vin} onChange={(e) => updateDraft("vin", e.target.value)} style={detailInputStyle} />
              </div>
              <div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Mileage</div>
                <input value={editDraft.mileage} onChange={(e) => updateDraft("mileage", e.target.value)} style={detailInputStyle} inputMode="numeric" />
              </div>
              <div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Fuel Type</div>
                <input value={editDraft.fuel} onChange={(e) => updateDraft("fuel", e.target.value)} style={detailInputStyle} />
              </div>
              <div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Asset Tag / QR</div>
                <input value={editDraft.asset} onChange={(e) => updateDraft("asset", e.target.value)} style={detailInputStyle} />
              </div>
              <div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Oil Life</div>
                <div style={{ fontWeight: 900, fontSize: 18, marginTop: 2 }}>
                  {oilLifePercent === null ? "—" : `${oilLifePercent}%`}
                </div>
              </div>
            </div>
          </>
        ) : (
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
        )}
      </div>

      <div style={{ marginTop: 18, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Asset Health Score</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: 10,
          }}
        >
          <div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>Health Score</div>
            <div style={{ fontWeight: 900, fontSize: 24 }}>{vehicleHealthSummary.healthScore}%</div>
          </div>
          <div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>Operational Score</div>
            <div style={{ fontWeight: 900, fontSize: 20 }}>{vehicleHealthSummary.operationalScore}%</div>
          </div>
          {canViewMechanicScore ? (
            <div>
              <div style={{ opacity: 0.7, fontSize: 12 }}>Mechanic Score</div>
              <div style={{ fontWeight: 900, fontSize: 20 }}>{vehicleHealthSummary.mechanicScore}%</div>
              <div style={{ opacity: 0.75, fontSize: 12 }}>{mechanicScoreBand(vehicleHealthSummary.mechanicScore)}</div>
            </div>
          ) : null}
          <div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>Open Requests</div>
            <div style={{ fontWeight: 900, fontSize: 20 }}>{vehicleHealthSummary.openRequests}</div>
          </div>
          <div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>PM Status</div>
            <div style={{ fontWeight: 900, fontSize: 20 }}>{vehicleHealthSummary.pmStatus}</div>
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

          {canShowVehiclePmButton ? (
            <Link href={`/vehicles/${routeIdForLinks}/forms/preventative-maintenance`} style={actionBtnStyle()}>
              <span>Preventative Maintenance</span>
              <span style={{ opacity: 0.75 }}>→</span>
            </Link>
          ) : null}

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
          <div style={{ opacity: 0.75, fontSize: 13 }}>Last 4 maintenance events</div>
        </div>

        <div style={{ marginTop: 12 }}>
          {requestPreviewError || logPreviewError ? (
            <div style={{ opacity: 0.9, color: "#ff9d9d" }}>
              Failed to load all maintenance history preview sources.
            </div>
          ) : historyPreview.length === 0 ? (
            <div style={{ opacity: 0.75 }}>
              No maintenance history yet.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {historyPreview.map((r, idx) => (
                <Link
                  key={`${r.type}:${r.createdAt}:${idx}`}
                  href={historyItemHref(r)}
                  style={{
                    display: "block",
                    textDecoration: "none",
                    color: "inherit",
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
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
