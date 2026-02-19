"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type OpsTab = "Overview" | "PM Due" | "Downtime" | "Failures" | "Performance";
type PmStatusFilter = "All" | "Due Soon" | "Overdue";
type AssetTypeFilter = "All" | "Vehicles" | "Equipment";

type VehicleRow = {
  id: string;
  name: string;
  status: string | null;
  mileage: number | null;
  updated_at: string;
};

type EquipmentRow = {
  id: string;
  name: string;
  status: string | null;
  current_hours: number | null;
  updated_at: string;
};

type RequestRow = {
  id: string;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  status: string | null;
  description: string | null;
  system_affected?: string | null;
  vehicle_id?: string | null;
  equipment_id?: string | null;
};

type MaintenanceLogRow = {
  id: string;
  created_at: string;
  created_by?: string | null;
  request_id?: string | null;
  notes?: string | null;
  status_update?: string | null;
  vehicle_id?: string | null;
  equipment_id?: string | null;
};

type LowStockRow = {
  quantity: number;
  minimum_quantity: number;
};

type EquipmentPmEventRow = {
  id: string;
  equipment_id: string;
  created_at: string;
  hours: number | null;
};

type VehiclePmRecord = {
  id: string;
  createdAt: string;
  mileage: number;
};

type PmBoardRow = {
  assetId: string;
  assetName: string;
  assetType: "Vehicle" | "Equipment";
  currentValue: number;
  unit: "miles" | "hours";
  lastPmValue: number | null;
  lastPmDate: string | null;
  dueAt: number;
  status: "Due Soon" | "Overdue";
  overdueAmount: number;
  pmFormHref: string;
  historyHref: string;
};

type DowntimeStatus = "Red Tagged" | "Out of Service";

type DowntimeRow = {
  assetId: string;
  assetName: string;
  assetType: "Vehicle" | "Equipment";
  status: DowntimeStatus;
  downSince: string;
  daysDown: number;
  openRequestsCount: number;
  lastMaintenanceLogDate: string | null;
  latestIssueSummary: string | null;
  detailHref: string;
  historyHref: string;
  maintenanceHref: string;
};

type FailureRow = {
  id: string;
  created_at: string;
  request_id: string | null;
  assetType: "Vehicle" | "Equipment";
  assetId: string;
  assetName: string;
  systemAffected: string;
  description: string;
  detailHref: string;
  historyHref: string;
};

const VEHICLE_PM_INTERVAL_MILES = 5000;
const EQUIPMENT_PM_INTERVAL_HOURS = 250;
const VEHICLE_DUE_SOON_WINDOW_MILES = Math.max(100, Math.round(VEHICLE_PM_INTERVAL_MILES * 0.1));
const EQUIPMENT_DUE_SOON_WINDOW_HOURS = Math.max(10, Math.round(EQUIPMENT_PM_INTERVAL_HOURS * 0.1));

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
  };
}

function metricStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 12,
    background: "rgba(255,255,255,0.02)",
  };
}

function daysBetween(from: string, to: string) {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function statusChipStyle(overdue: boolean): React.CSSProperties {
  return {
    borderRadius: 999,
    border: overdue
      ? "1px solid rgba(255,120,120,0.35)"
      : "1px solid rgba(255,230,120,0.35)",
    background: overdue ? "rgba(255,120,120,0.14)" : "rgba(255,230,120,0.12)",
    padding: "4px 9px",
    fontSize: 12,
    fontWeight: 800,
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

function toDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function csvCell(value: string | number | null | undefined) {
  const raw = value == null ? "" : String(value);
  return `"${raw.replaceAll('"', '""')}"`;
}

function weekStartIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const day = date.getDay();
  const offset = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - offset);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const lines = [headers.map((h) => csvCell(h)).join(","), ...rows.map((row) => row.map((cell) => csvCell(cell)).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function vehiclePmStorageKey(vehicleId: string) {
  return `vehicle:${vehicleId}:vehicle_pm`;
}

function parseVehiclePmFromStorage(vehicleId: string): VehiclePmRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(vehiclePmStorageKey(vehicleId));
    if (!raw) return null;
    const rows = JSON.parse(raw) as Array<VehiclePmRecord>;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const valid = rows
      .filter((r) => Number.isFinite(Number(r.mileage)) && Number(r.mileage) >= 0)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return valid[0] ?? null;
  } catch {
    return null;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

export default function OpsPage({
  embedded = false,
  title = "Maintenance Operations",
}: {
  embedded?: boolean;
  title?: string;
} = {}) {
  const [tab, setTab] = useState<OpsTab>("Overview");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [equipmentPmEvents, setEquipmentPmEvents] = useState<EquipmentPmEventRow[]>([]);
  const [allRequests, setAllRequests] = useState<RequestRow[]>([]);
  const [allMaintenanceLogs, setAllMaintenanceLogs] = useState<MaintenanceLogRow[]>([]);

  const [outOfServiceCount, setOutOfServiceCount] = useState(0);
  const [openRequestCount, setOpenRequestCount] = useState(0);
  const [lowInventoryCount, setLowInventoryCount] = useState(0);
  const [closedLast7Days, setClosedLast7Days] = useState(0);
  const [avgDaysToClose, setAvgDaysToClose] = useState(0);

  const [pmStatusFilter, setPmStatusFilter] = useState<PmStatusFilter>("All");
  const [pmAssetTypeFilter, setPmAssetTypeFilter] = useState<AssetTypeFilter>("All");
  const [pmSearch, setPmSearch] = useState("");
  const [downtimeStatusFilter, setDowntimeStatusFilter] = useState<"All" | DowntimeStatus>("All");
  const [downtimeAssetTypeFilter, setDowntimeAssetTypeFilter] = useState<AssetTypeFilter>("All");
  const [downtimeSearch, setDowntimeSearch] = useState("");
  const [failureStartDate, setFailureStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return toDateInputValue(d);
  });
  const [failureEndDate, setFailureEndDate] = useState(() => toDateInputValue(new Date()));
  const [failureAssetTypeFilter, setFailureAssetTypeFilter] = useState<AssetTypeFilter>("All");
  const [failureSystemFilter, setFailureSystemFilter] = useState("All");
  const [performanceStartDate, setPerformanceStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputValue(d);
  });
  const [performanceEndDate, setPerformanceEndDate] = useState(() => toDateInputValue(new Date()));
  const [profileNameById, setProfileNameById] = useState<Record<string, string>>({});
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setErrorMessage(null);

        const supabase = createSupabaseBrowser();
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) {
          console.error("[ops] auth check error:", userError);
          setErrorMessage(userError.message || "Failed to verify authentication.");
          setIsAuthenticated(false);
          setLoading(false);
          return;
        }
        if (!user) {
          setIsAuthenticated(false);
          setErrorMessage("You must be signed in to view Maintenance Operations.");
          setLoading(false);
          router.replace("/login");
          return;
        }
        setIsAuthenticated(true);

        const fetchRequestsWithOptionalClosedAt = async (
          table: "maintenance_requests" | "equipment_maintenance_requests",
          assetKey: "vehicle_id" | "equipment_id"
        ) => {
          const withClosed = await supabase
            .from(table)
            .select(`id,${assetKey},created_at,updated_at,closed_at,status,description,system_affected`);
          if (!withClosed.error) return withClosed;
          const code = (withClosed.error as { code?: string }).code;
          if (code !== "42703") return withClosed;
          return supabase
            .from(table)
            .select(`id,${assetKey},created_at,updated_at,status,description,system_affected`);
        };

        const [vehiclesRes, equipmentRes, vehicleReqRes, equipmentReqRes, lowInvRes, eqPmRes, vehicleLogsRes, equipmentLogsRes] = await Promise.all([
          supabase.from("vehicles").select("id,name,status,mileage,updated_at"),
          supabase.from("equipment").select("id,name,status,current_hours,updated_at"),
          fetchRequestsWithOptionalClosedAt("maintenance_requests", "vehicle_id"),
          fetchRequestsWithOptionalClosedAt("equipment_maintenance_requests", "equipment_id"),
          supabase
            .from("inventory_items")
            .select("quantity,minimum_quantity")
            .eq("is_active", true),
          supabase
            .from("equipment_pm_events")
            .select("id,equipment_id,created_at,hours")
            .order("created_at", { ascending: false }),
          supabase
            .from("maintenance_logs")
            .select("id,vehicle_id,created_at,created_by,request_id,notes,status_update")
            .order("created_at", { ascending: false }),
          supabase
            .from("equipment_maintenance_logs")
            .select("id,equipment_id,created_at,created_by,request_id,notes,status_update")
            .order("created_at", { ascending: false }),
        ]);

        if (
          vehiclesRes.error ||
          equipmentRes.error ||
          vehicleReqRes.error ||
          equipmentReqRes.error ||
          lowInvRes.error ||
          eqPmRes.error ||
          vehicleLogsRes.error ||
          equipmentLogsRes.error
        ) {
          console.error("[ops] load error:", {
            vehiclesError: vehiclesRes.error,
            equipmentError: equipmentRes.error,
            vehicleRequestsError: vehicleReqRes.error,
            equipmentRequestsError: equipmentReqRes.error,
            lowInventoryError: lowInvRes.error,
            equipmentPmError: eqPmRes.error,
            vehicleLogsError: vehicleLogsRes.error,
            equipmentLogsError: equipmentLogsRes.error,
          });
          setErrorMessage(
            vehiclesRes.error?.message ||
              equipmentRes.error?.message ||
              vehicleReqRes.error?.message ||
              equipmentReqRes.error?.message ||
              lowInvRes.error?.message ||
              eqPmRes.error?.message ||
              vehicleLogsRes.error?.message ||
              equipmentLogsRes.error?.message ||
              "Failed to load operations overview."
          );
          setLoading(false);
          return;
        }

        const vehicleRows = (vehiclesRes.data ?? []) as VehicleRow[];
        const equipmentRows = (equipmentRes.data ?? []) as EquipmentRow[];
        const eqPmRows = (eqPmRes.data ?? []) as EquipmentPmEventRow[];

        const requestRows: RequestRow[] = [
          ...(((vehicleReqRes.data ?? []) as RequestRow[]) || []),
          ...(((equipmentReqRes.data ?? []) as RequestRow[]) || []),
        ];
        const maintenanceLogRows: MaintenanceLogRow[] = [
          ...((((vehicleLogsRes.data ?? []) as MaintenanceLogRow[]) || []).map((row) => ({
            id: row.id,
            created_at: row.created_at,
            created_by: row.created_by ?? null,
            request_id: row.request_id ?? null,
            notes: row.notes ?? null,
            status_update: row.status_update ?? null,
            vehicle_id: row.vehicle_id ?? null,
            equipment_id: null,
          }))),
          ...((((equipmentLogsRes.data ?? []) as MaintenanceLogRow[]) || []).map((row) => ({
            id: row.id,
            created_at: row.created_at,
            created_by: row.created_by ?? null,
            request_id: row.request_id ?? null,
            notes: row.notes ?? null,
            status_update: row.status_update ?? null,
            vehicle_id: null,
            equipment_id: row.equipment_id ?? null,
          }))),
        ];

        const uniqueCreatorIds = Array.from(
          new Set(
            maintenanceLogRows
              .map((row) => row.created_by)
              .filter((id): id is string => typeof id === "string" && id.length > 0)
          )
        );
        if (uniqueCreatorIds.length > 0) {
          const profilesRes = await supabase
            .from("profiles")
            .select("id,full_name,email")
            .in("id", uniqueCreatorIds);
          if (profilesRes.error) {
            console.error("[ops] profiles lookup error:", profilesRes.error);
          } else {
            const nameMap: Record<string, string> = {};
            const profiles = (profilesRes.data ?? []) as Array<{
              id: string;
              full_name?: string | null;
              email?: string | null;
            }>;
            for (const profile of profiles) {
              nameMap[profile.id] = profile.full_name?.trim() || profile.email?.trim() || profile.id;
            }
            setProfileNameById(nameMap);
          }
        } else {
          setProfileNameById({});
        }

        const unitRows = [...vehicleRows, ...equipmentRows];
        const out = unitRows.filter((u) => {
          const s = (u.status ?? "").trim();
          return s === "Red Tagged" || s === "Out of Service";
        }).length;

        const openRequests = requestRows.filter((r) => {
          const s = (r.status ?? "").trim();
          return s === "Open" || s === "In Progress";
        });

        const now = Date.now();
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

        const closed = requestRows.filter((r) => (r.status ?? "").trim() === "Closed");
        const closed7 = closed.filter((r) => {
          const t = new Date(r.updated_at).getTime();
          return Number.isFinite(t) && t >= sevenDaysAgo;
        }).length;

        const avgCloseDays = closed.length
          ? closed.reduce((sum, r) => sum + daysBetween(r.created_at, r.updated_at), 0) / closed.length
          : 0;

        const lowStock = ((lowInvRes.data ?? []) as LowStockRow[]).filter(
          (row) => Number(row.quantity) <= Number(row.minimum_quantity)
        ).length;

        setVehicles(vehicleRows);
        setEquipment(equipmentRows);
        setEquipmentPmEvents(eqPmRows);
        setAllRequests(requestRows);
        setAllMaintenanceLogs(maintenanceLogRows);

        setOutOfServiceCount(out);
        setOpenRequestCount(openRequests.length);
        setLowInventoryCount(lowStock);
        setClosedLast7Days(closed7);
        setAvgDaysToClose(Number(avgCloseDays.toFixed(1)));
        setLoading(false);
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [router]);

  const tabs: OpsTab[] = ["Overview", "PM Due", "Downtime", "Failures", "Performance"];

  const overviewCards = useMemo(
    () => [
      { label: "Out of Service Units", value: outOfServiceCount },
      { label: "Open Maintenance Requests", value: openRequestCount },
      { label: "Low Inventory", value: lowInventoryCount },
    ],
    [outOfServiceCount, openRequestCount, lowInventoryCount]
  );

  const pmBoardRows = useMemo(() => {
    const equipmentLastPm = new Map<string, { hours: number | null; date: string }>();
    for (const row of equipmentPmEvents) {
      if (!equipmentLastPm.has(row.equipment_id)) {
        equipmentLastPm.set(row.equipment_id, {
          hours: row.hours,
          date: row.created_at,
        });
      }
    }

    const rows: PmBoardRow[] = [];

    for (const v of vehicles) {
      const current = Number(v.mileage ?? 0);
      if (!Number.isFinite(current) || current < 0) continue;

      const lastPm = parseVehiclePmFromStorage(v.id);
      const lastValue = lastPm?.mileage ?? 0;
      const dueAt = lastValue + VEHICLE_PM_INTERVAL_MILES;
      const delta = dueAt - current;

      let status: "Due Soon" | "Overdue" | null = null;
      if (current >= dueAt) status = "Overdue";
      else if (delta <= VEHICLE_DUE_SOON_WINDOW_MILES) status = "Due Soon";

      if (!status) continue;

      rows.push({
        assetId: v.id,
        assetName: v.name || v.id,
        assetType: "Vehicle",
        currentValue: current,
        unit: "miles",
        lastPmValue: lastPm?.mileage ?? null,
        lastPmDate: lastPm?.createdAt ?? null,
        dueAt,
        status,
        overdueAmount: current - dueAt,
        pmFormHref: `/vehicles/${encodeURIComponent(v.id)}/forms/preventative-maintenance`,
        historyHref: `/vehicles/${encodeURIComponent(v.id)}/history`,
      });
    }

    for (const e of equipment) {
      const current = Number(e.current_hours ?? 0);
      if (!Number.isFinite(current) || current < 0) continue;

      const last = equipmentLastPm.get(e.id);
      const lastValue = Number(last?.hours ?? 0);
      const dueAt = lastValue + EQUIPMENT_PM_INTERVAL_HOURS;
      const delta = dueAt - current;

      let status: "Due Soon" | "Overdue" | null = null;
      if (current >= dueAt) status = "Overdue";
      else if (delta <= EQUIPMENT_DUE_SOON_WINDOW_HOURS) status = "Due Soon";

      if (!status) continue;

      rows.push({
        assetId: e.id,
        assetName: e.name || e.id,
        assetType: "Equipment",
        currentValue: current,
        unit: "hours",
        lastPmValue: Number.isFinite(lastValue) ? lastValue : null,
        lastPmDate: last?.date ?? null,
        dueAt,
        status,
        overdueAmount: current - dueAt,
        pmFormHref: `/equipment/${encodeURIComponent(e.id)}/forms/preventative-maintenance`,
        historyHref: `/equipment/${encodeURIComponent(e.id)}/history`,
      });
    }

    rows.sort((a, b) => {
      const aPriority = a.status === "Overdue" ? 0 : 1;
      const bPriority = b.status === "Overdue" ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;

      if (a.status === "Overdue" && b.status === "Overdue") {
        return b.overdueAmount - a.overdueAmount;
      }

      // Due soon: nearest due first
      return (a.dueAt - a.currentValue) - (b.dueAt - b.currentValue);
    });

    return rows;
  }, [vehicles, equipment, equipmentPmEvents]);

  const filteredPmRows = useMemo(() => {
    const q = pmSearch.trim().toLowerCase();

    return pmBoardRows.filter((row) => {
      if (pmStatusFilter !== "All" && row.status !== pmStatusFilter) return false;
      if (pmAssetTypeFilter !== "All") {
        if (pmAssetTypeFilter === "Vehicles" && row.assetType !== "Vehicle") return false;
        if (pmAssetTypeFilter === "Equipment" && row.assetType !== "Equipment") return false;
      }

      if (!q) return true;
      const hay = [row.assetName, row.assetId, row.assetType].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [pmBoardRows, pmStatusFilter, pmAssetTypeFilter, pmSearch]);

  const downtimeRows = useMemo(() => {
    const nowIso = new Date().toISOString();
    const openRequestsByAsset = new Map<string, RequestRow[]>();
    for (const row of allRequests) {
      const status = (row.status ?? "").trim();
      if (status !== "Open" && status !== "In Progress") continue;
      const assetKey = row.vehicle_id
        ? `Vehicle:${row.vehicle_id}`
        : row.equipment_id
        ? `Equipment:${row.equipment_id}`
        : null;
      if (!assetKey) continue;
      const existing = openRequestsByAsset.get(assetKey) ?? [];
      existing.push(row);
      openRequestsByAsset.set(assetKey, existing);
    }
    for (const rows of openRequestsByAsset.values()) {
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    const lastLogByAsset = new Map<string, string>();
    for (const log of allMaintenanceLogs) {
      const assetKey = log.vehicle_id
        ? `Vehicle:${log.vehicle_id}`
        : log.equipment_id
        ? `Equipment:${log.equipment_id}`
        : null;
      if (!assetKey) continue;
      if (!lastLogByAsset.has(assetKey)) {
        lastLogByAsset.set(assetKey, log.created_at);
      }
    }

    const rows: DowntimeRow[] = [];
    for (const v of vehicles) {
      const status = (v.status ?? "").trim() as DowntimeStatus;
      if (status !== "Red Tagged" && status !== "Out of Service") continue;
      const assetKey = `Vehicle:${v.id}`;
      const openRows = openRequestsByAsset.get(assetKey) ?? [];
      rows.push({
        assetId: v.id,
        assetName: v.name || v.id,
        assetType: "Vehicle",
        status,
        downSince: v.updated_at,
        daysDown: daysBetween(v.updated_at, nowIso),
        openRequestsCount: openRows.length,
        lastMaintenanceLogDate: lastLogByAsset.get(assetKey) ?? null,
        latestIssueSummary: openRows[0]?.description ?? null,
        detailHref: `/vehicles/${encodeURIComponent(v.id)}`,
        historyHref: `/vehicles/${encodeURIComponent(v.id)}/history`,
        maintenanceHref: `/maintenance?assetType=Vehicle&assetId=${encodeURIComponent(v.id)}`,
      });
    }

    for (const e of equipment) {
      const status = (e.status ?? "").trim() as DowntimeStatus;
      if (status !== "Red Tagged" && status !== "Out of Service") continue;
      const assetKey = `Equipment:${e.id}`;
      const openRows = openRequestsByAsset.get(assetKey) ?? [];
      rows.push({
        assetId: e.id,
        assetName: e.name || e.id,
        assetType: "Equipment",
        status,
        downSince: e.updated_at,
        daysDown: daysBetween(e.updated_at, nowIso),
        openRequestsCount: openRows.length,
        lastMaintenanceLogDate: lastLogByAsset.get(assetKey) ?? null,
        latestIssueSummary: openRows[0]?.description ?? null,
        detailHref: `/equipment/${encodeURIComponent(e.id)}`,
        historyHref: `/equipment/${encodeURIComponent(e.id)}/history`,
        maintenanceHref: `/maintenance?assetType=Equipment&assetId=${encodeURIComponent(e.id)}`,
      });
    }

    rows.sort((a, b) => b.daysDown - a.daysDown);
    return rows;
  }, [allMaintenanceLogs, allRequests, equipment, vehicles]);

  const filteredDowntimeRows = useMemo(() => {
    const query = downtimeSearch.trim().toLowerCase();
    return downtimeRows.filter((row) => {
      if (downtimeStatusFilter !== "All" && row.status !== downtimeStatusFilter) return false;
      if (downtimeAssetTypeFilter !== "All") {
        if (downtimeAssetTypeFilter === "Vehicles" && row.assetType !== "Vehicle") return false;
        if (downtimeAssetTypeFilter === "Equipment" && row.assetType !== "Equipment") return false;
      }
      if (!query) return true;
      const hay = `${row.assetName} ${row.assetId}`.toLowerCase();
      return hay.includes(query);
    });
  }, [downtimeAssetTypeFilter, downtimeRows, downtimeSearch, downtimeStatusFilter]);

  const redTagRows = useMemo(
    () => downtimeRows.filter((row) => row.status === "Red Tagged").sort((a, b) => b.daysDown - a.daysDown),
    [downtimeRows]
  );

  const openRequestsByAsset = useMemo(() => {
    const vehicleNameById = new Map(vehicles.map((v) => [v.id, v.name || v.id]));
    const equipmentNameById = new Map(equipment.map((e) => [e.id, e.name || e.id]));

    const grouped = new Map<
      string,
      {
        assetType: "Vehicle" | "Equipment";
        assetId: string;
        assetName: string;
        href: string;
        count: number;
      }
    >();

    for (const row of allRequests) {
      const status = (row.status ?? "").trim();
      if (status !== "Open" && status !== "In Progress") continue;

      if (row.vehicle_id) {
        const key = `Vehicle:${row.vehicle_id}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          grouped.set(key, {
            assetType: "Vehicle",
            assetId: row.vehicle_id,
            assetName: vehicleNameById.get(row.vehicle_id) ?? row.vehicle_id,
            href: `/vehicles/${encodeURIComponent(row.vehicle_id)}`,
            count: 1,
          });
        }
      } else if (row.equipment_id) {
        const key = `Equipment:${row.equipment_id}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          grouped.set(key, {
            assetType: "Equipment",
            assetId: row.equipment_id,
            assetName: equipmentNameById.get(row.equipment_id) ?? row.equipment_id,
            href: `/equipment/${encodeURIComponent(row.equipment_id)}`,
            count: 1,
          });
        }
      }
    }

    return Array.from(grouped.values()).sort((a, b) => b.count - a.count);
  }, [allRequests, equipment, vehicles]);

  const failureRows = useMemo(() => {
    const vehicleNameById = new Map(vehicles.map((v) => [v.id, v.name || v.id]));
    const equipmentNameById = new Map(equipment.map((e) => [e.id, e.name || e.id]));
    const vehicleRequestsById = new Map(
      allRequests.filter((r) => Boolean(r.vehicle_id)).map((r) => [r.id, r])
    );
    const equipmentRequestsById = new Map(
      allRequests.filter((r) => Boolean(r.equipment_id)).map((r) => [r.id, r])
    );

    const start = failureStartDate ? new Date(`${failureStartDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const end = failureEndDate ? new Date(`${failureEndDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;

    const rows: FailureRow[] = [];
    for (const log of allMaintenanceLogs) {
      const createdAtTs = new Date(log.created_at).getTime();
      if (!Number.isFinite(createdAtTs) || createdAtTs < start || createdAtTs > end) continue;

      const isVehicle = Boolean(log.vehicle_id);
      const isEquipment = Boolean(log.equipment_id);
      if (!isVehicle && !isEquipment) continue;

      const assetType = isVehicle ? "Vehicle" : "Equipment";
      const assetId = isVehicle ? String(log.vehicle_id) : String(log.equipment_id);

      if (failureAssetTypeFilter === "Vehicles" && assetType !== "Vehicle") continue;
      if (failureAssetTypeFilter === "Equipment" && assetType !== "Equipment") continue;

      const linkedRequest =
        log.request_id && assetType === "Vehicle"
          ? vehicleRequestsById.get(log.request_id)
          : log.request_id
          ? equipmentRequestsById.get(log.request_id)
          : null;

      const systemAffected = (linkedRequest?.system_affected ?? "").trim() || "Unspecified";
      if (failureSystemFilter !== "All" && systemAffected !== failureSystemFilter) continue;

      const description =
        (linkedRequest?.description ?? "").trim() ||
        (log.notes ?? "").trim() ||
        (log.status_update ?? "").trim() ||
        "No description";

      rows.push({
        id: log.id,
        created_at: log.created_at,
        request_id: log.request_id ?? null,
        assetType,
        assetId,
        assetName: assetType === "Vehicle" ? vehicleNameById.get(assetId) ?? assetId : equipmentNameById.get(assetId) ?? assetId,
        systemAffected,
        description,
        detailHref:
          assetType === "Vehicle"
            ? `/vehicles/${encodeURIComponent(assetId)}`
            : `/equipment/${encodeURIComponent(assetId)}`,
        historyHref:
          assetType === "Vehicle"
            ? `/vehicles/${encodeURIComponent(assetId)}/history`
            : `/equipment/${encodeURIComponent(assetId)}/history`,
      });
    }

    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return rows;
  }, [
    allMaintenanceLogs,
    allRequests,
    equipment,
    failureAssetTypeFilter,
    failureEndDate,
    failureStartDate,
    failureSystemFilter,
    vehicles,
  ]);

  const failureSystemOptions = useMemo(() => {
    const vehicleRequestsById = new Map(allRequests.filter((r) => Boolean(r.vehicle_id)).map((r) => [r.id, r]));
    const equipmentRequestsById = new Map(allRequests.filter((r) => Boolean(r.equipment_id)).map((r) => [r.id, r]));
    const start = failureStartDate ? new Date(`${failureStartDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const end = failureEndDate ? new Date(`${failureEndDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    const set = new Set<string>();
    for (const log of allMaintenanceLogs) {
      const createdAtTs = new Date(log.created_at).getTime();
      if (!Number.isFinite(createdAtTs) || createdAtTs < start || createdAtTs > end) continue;
      const assetType = log.vehicle_id ? "Vehicle" : log.equipment_id ? "Equipment" : null;
      if (!assetType) continue;
      if (failureAssetTypeFilter === "Vehicles" && assetType !== "Vehicle") continue;
      if (failureAssetTypeFilter === "Equipment" && assetType !== "Equipment") continue;
      const linkedRequest =
        log.request_id && assetType === "Vehicle"
          ? vehicleRequestsById.get(log.request_id)
          : log.request_id
          ? equipmentRequestsById.get(log.request_id)
          : null;
      const systemAffected = (linkedRequest?.system_affected ?? "").trim() || "Unspecified";
      set.add(systemAffected);
    }
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [allMaintenanceLogs, allRequests, failureAssetTypeFilter, failureEndDate, failureStartDate]);

  const topSystems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of failureRows) {
      counts.set(row.systemAffected, (counts.get(row.systemAffected) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([system, count]) => ({ system, count }))
      .sort((a, b) => b.count - a.count || a.system.localeCompare(b.system))
      .slice(0, 20);
  }, [failureRows]);

  const topRepeatAssets = useMemo(() => {
    const counts = new Map<string, { assetType: "Vehicle" | "Equipment"; assetId: string; assetName: string; count: number; href: string }>();
    for (const row of failureRows) {
      const key = `${row.assetType}:${row.assetId}`;
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, {
          assetType: row.assetType,
          assetId: row.assetId,
          assetName: row.assetName,
          count: 1,
          href: row.detailHref,
        });
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.assetName.localeCompare(b.assetName)).slice(0, 20);
  }, [failureRows]);

  const recentFailures = useMemo(() => failureRows.slice(0, 20), [failureRows]);

  const performanceRange = useMemo(() => {
    const startTs = performanceStartDate
      ? new Date(`${performanceStartDate}T00:00:00`).getTime()
      : Number.NEGATIVE_INFINITY;
    const endTs = performanceEndDate
      ? new Date(`${performanceEndDate}T23:59:59.999`).getTime()
      : Number.POSITIVE_INFINITY;
    return { startTs, endTs };
  }, [performanceEndDate, performanceStartDate]);

  const performanceRequestsInRange = useMemo(
    () =>
      allRequests.filter((row) => {
        const t = new Date(row.created_at).getTime();
        return Number.isFinite(t) && t >= performanceRange.startTs && t <= performanceRange.endTs;
      }),
    [allRequests, performanceRange.endTs, performanceRange.startTs]
  );

  const performanceLogsInRange = useMemo(
    () =>
      allMaintenanceLogs.filter((row) => {
        const t = new Date(row.created_at).getTime();
        return Number.isFinite(t) && t >= performanceRange.startTs && t <= performanceRange.endTs;
      }),
    [allMaintenanceLogs, performanceRange.endTs, performanceRange.startTs]
  );

  const performanceOpenCount = useMemo(
    () =>
      performanceRequestsInRange.filter((row) => {
        const status = (row.status ?? "").trim();
        return status === "Open" || status === "In Progress";
      }).length,
    [performanceRequestsInRange]
  );

  const performanceClosedRequests = useMemo(
    () =>
      performanceRequestsInRange.filter((row) => {
        const status = (row.status ?? "").trim();
        return status === "Closed";
      }),
    [performanceRequestsInRange]
  );

  const performanceClosedCount = performanceClosedRequests.length;

  const performanceAvgCloseDays = useMemo(() => {
    if (performanceClosedRequests.length === 0) return 0;
    const total = performanceClosedRequests.reduce((sum, row) => {
      const closedTime = row.closed_at || row.updated_at;
      return sum + daysBetween(row.created_at, closedTime);
    }, 0);
    return Number((total / performanceClosedRequests.length).toFixed(1));
  }, [performanceClosedRequests]);

  const performanceWeeklyRows = useMemo(() => {
    const createdMap = new Map<string, number>();
    const closedMap = new Map<string, number>();

    for (const row of performanceRequestsInRange) {
      const week = weekStartIso(row.created_at);
      createdMap.set(week, (createdMap.get(week) ?? 0) + 1);
      if ((row.status ?? "").trim() === "Closed") {
        const closedTime = row.closed_at || row.updated_at;
        const closedWeek = weekStartIso(closedTime);
        closedMap.set(closedWeek, (closedMap.get(closedWeek) ?? 0) + 1);
      }
    }

    const weeks = Array.from(new Set([...createdMap.keys(), ...closedMap.keys()]))
      .filter((w) => w !== "Unknown")
      .sort((a, b) => a.localeCompare(b));
    return weeks.map((week) => ({
      week,
      created: createdMap.get(week) ?? 0,
      closed: closedMap.get(week) ?? 0,
    }));
  }, [performanceRequestsInRange]);

  const performanceByMechanic = useMemo(() => {
    const counts = new Map<string, { createdBy: string; display: string; count: number }>();
    for (const log of performanceLogsInRange) {
      const createdBy = log.created_by ?? "Unknown";
      const existing = counts.get(createdBy);
      const display = createdBy === "Unknown" ? "Unknown" : profileNameById[createdBy] || createdBy;
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(createdBy, { createdBy, display, count: 1 });
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.display.localeCompare(b.display));
  }, [performanceLogsInRange, profileNameById]);

  return (
    <div style={embedded ? { paddingBottom: 32 } : { maxWidth: 1100, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>{title}</h1>
      <div style={{ opacity: 0.75 }}>Maintenance operations overview and fleet service signals.</div>

      <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              border: tab === t ? "1px solid rgba(126,255,167,0.45)" : "1px solid rgba(255,255,255,0.14)",
              background: tab === t ? "rgba(126,255,167,0.14)" : "rgba(255,255,255,0.03)",
              color: "inherit",
              borderRadius: 12,
              padding: "9px 12px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? <div style={{ marginTop: 16, opacity: 0.75 }}>Loading operations data...</div> : null}
      {errorMessage ? (
        <div style={{ marginTop: 16, ...cardStyle(), color: "#ff9d9d" }}>{errorMessage}</div>
      ) : null}

      {!loading && !errorMessage && isAuthenticated && tab === "Overview" ? (
        <>
          <div
            style={{
              marginTop: 16,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {overviewCards.map((card) => (
              <div key={card.label} style={metricStyle()}>
                <div style={{ fontSize: 12, opacity: 0.74 }}>{card.label}</div>
                <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{card.value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, ...cardStyle() }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Out of Service Units</div>
            {downtimeRows.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No units currently marked Red Tagged or Out of Service.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {downtimeRows.map((row) => (
                  <div
                    key={`overview-down:${row.assetType}:${row.assetId}`}
                    style={{
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 12,
                      padding: 10,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <Link href={row.detailHref} style={{ color: "inherit", fontWeight: 800 }}>
                        {row.assetName}
                      </Link>
                      <div style={{ opacity: 0.75, fontSize: 12 }}>
                        {row.assetType} · {row.assetId} · Since {formatDateTime(row.downSince)}
                      </div>
                    </div>
                    <div style={statusChipStyle(row.status === "Red Tagged")}>{row.daysDown} days out</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, ...cardStyle() }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Open Maintenance Requests</div>
            {openRequestsByAsset.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No open or in-progress maintenance requests.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {openRequestsByAsset.map((row) => (
                  <div
                    key={`overview-open:${row.assetType}:${row.assetId}`}
                    style={{
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 12,
                      padding: 10,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <Link href={row.href} style={{ color: "inherit", fontWeight: 800 }}>
                        {row.assetName}
                      </Link>
                      <div style={{ opacity: 0.75, fontSize: 12 }}>
                        {row.assetType} · {row.assetId}
                      </div>
                    </div>
                    <div style={statusChipStyle(false)}>{row.count} open</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, ...cardStyle() }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>PM Due / Overdue</div>
            {pmBoardRows.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No due or overdue PM units right now.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {pmBoardRows.slice(0, 8).map((row) => (
                  <div
                    key={`overview-pm:${row.assetType}:${row.assetId}`}
                    style={{
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 12,
                      padding: 10,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <Link href={row.pmFormHref} style={{ color: "inherit", fontWeight: 800 }}>
                        {row.assetName}
                      </Link>
                      <div style={{ opacity: 0.75, fontSize: 12 }}>
                        Due at {row.dueAt.toLocaleString()} {row.unit}
                      </div>
                    </div>
                    <div style={statusChipStyle(row.status === "Overdue")}>{row.status}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, ...cardStyle() }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Low Inventory Count</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 24, fontWeight: 900 }}>{lowInventoryCount}</div>
              <Link href="/inventory?filter=low" style={actionLinkStyle}>
                View Low Stock
              </Link>
            </div>
          </div>

          <div style={{ marginTop: 16, ...cardStyle() }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Maintenance Velocity Snapshot</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <div style={metricStyle()}>
                <div style={{ fontSize: 12, opacity: 0.74 }}>Open Request Count</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{openRequestCount}</div>
              </div>
              <div style={metricStyle()}>
                <div style={{ fontSize: 12, opacity: 0.74 }}>Closed Last 7 Days</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{closedLast7Days}</div>
              </div>
              <div style={metricStyle()}>
                <div style={{ fontSize: 12, opacity: 0.74 }}>Avg Time to Close</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{avgDaysToClose} days</div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {!loading && !errorMessage && isAuthenticated && tab === "PM Due" ? (
        <div style={{ marginTop: 16, ...cardStyle() }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>PM Due Board</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <Field label="Status">
              <select value={pmStatusFilter} onChange={(e) => setPmStatusFilter(e.target.value as PmStatusFilter)} style={inputStyle()}>
                <option>All</option>
                <option>Due Soon</option>
                <option>Overdue</option>
              </select>
            </Field>

            <Field label="Asset Type">
              <select value={pmAssetTypeFilter} onChange={(e) => setPmAssetTypeFilter(e.target.value as AssetTypeFilter)} style={inputStyle()}>
                <option>All</option>
                <option>Vehicles</option>
                <option>Equipment</option>
              </select>
            </Field>

            <Field label="Search">
              <input
                value={pmSearch}
                onChange={(e) => setPmSearch(e.target.value)}
                placeholder="Search asset name or id"
                style={inputStyle()}
              />
            </Field>
          </div>

          {filteredPmRows.length === 0 ? (
            <div style={{ opacity: 0.75 }}>No due or overdue PM units match the current filters.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Asset</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Current</th>
                    <th style={thStyle}>Last PM</th>
                    <th style={thStyle}>Due At</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPmRows.map((row) => (
                    <tr key={`${row.assetType}:${row.assetId}`}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 800 }}>{row.assetName}</div>
                        <div style={{ opacity: 0.72, fontSize: 12 }}>{row.assetId}</div>
                      </td>
                      <td style={tdStyle}>{row.assetType}</td>
                      <td style={tdStyle}>
                        {row.currentValue.toLocaleString()} {row.unit}
                      </td>
                      <td style={tdStyle}>
                        {row.lastPmValue != null ? `${row.lastPmValue.toLocaleString()} ${row.unit}` : "—"}
                        <div style={{ opacity: 0.72, fontSize: 12 }}>
                          {row.lastPmDate ? formatDateTime(row.lastPmDate) : "No PM record"}
                        </div>
                      </td>
                      <td style={tdStyle}>{row.dueAt.toLocaleString()} {row.unit}</td>
                      <td style={tdStyle}>
                        <span style={statusChipStyle(row.status === "Overdue")}>{row.status}</span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Link href={row.pmFormHref} style={actionLinkStyle}>
                            Go to PM Form
                          </Link>
                          <Link href={row.historyHref} style={actionLinkStyle}>
                            View History
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {!loading && !errorMessage && isAuthenticated && tab === "Downtime" ? (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <div style={cardStyle()}>
            <div style={{ fontWeight: 900, marginBottom: 4 }}>Red Tag Board</div>
            <div style={{ opacity: 0.75, marginBottom: 10 }}>
              Down since uses asset <code>updated_at</code> as an approximation when no explicit downtime start is stored.
            </div>
            {redTagRows.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No red-tagged assets.</div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 10,
                }}
              >
                {redTagRows.map((row) => (
                  <div key={`red:${row.assetType}:${row.assetId}`} style={metricStyle()}>
                    <Link href={row.detailHref} style={{ color: "inherit", textDecoration: "none" }}>
                      <div style={{ fontWeight: 900 }}>{row.assetName}</div>
                    </Link>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>{row.assetType} · {row.assetId}</div>
                    <div style={{ marginTop: 8, fontSize: 24, fontWeight: 900 }}>{row.daysDown}d down</div>
                    <div style={{ opacity: 0.78, fontSize: 12, marginTop: 4 }}>
                      Since: {formatDateTime(row.downSince)}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13 }}>
                      {row.latestIssueSummary ? row.latestIssueSummary : "No issue summary available."}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={cardStyle()}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Downtime</div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <Field label="Asset Type">
                <select
                  value={downtimeAssetTypeFilter}
                  onChange={(e) => setDowntimeAssetTypeFilter(e.target.value as AssetTypeFilter)}
                  style={inputStyle()}
                >
                  <option>All</option>
                  <option>Vehicles</option>
                  <option>Equipment</option>
                </select>
              </Field>

              <Field label="Status">
                <select
                  value={downtimeStatusFilter}
                  onChange={(e) => setDowntimeStatusFilter(e.target.value as "All" | DowntimeStatus)}
                  style={inputStyle()}
                >
                  <option>All</option>
                  <option>Red Tagged</option>
                  <option>Out of Service</option>
                </select>
              </Field>

              <Field label="Search">
                <input
                  value={downtimeSearch}
                  onChange={(e) => setDowntimeSearch(e.target.value)}
                  placeholder="Search asset name or id"
                  style={inputStyle()}
                />
              </Field>
            </div>

            {filteredDowntimeRows.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No downtime units match the current filters.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Asset</th>
                      <th style={thStyle}>Type</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Down Since</th>
                      <th style={thStyle}>Days Down</th>
                      <th style={thStyle}>Open Requests Count</th>
                      <th style={thStyle}>Last Maintenance Log Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDowntimeRows.map((row) => (
                      <tr key={`down:${row.assetType}:${row.assetId}`}>
                        <td style={tdStyle}>
                          <Link href={row.detailHref} style={{ color: "inherit", fontWeight: 800 }}>
                            {row.assetName}
                          </Link>
                          <div style={{ opacity: 0.72, fontSize: 12 }}>{row.assetId}</div>
                        </td>
                        <td style={tdStyle}>{row.assetType}</td>
                        <td style={tdStyle}>
                          <span style={statusChipStyle(row.status === "Red Tagged")}>{row.status}</span>
                        </td>
                        <td style={tdStyle}>{formatDateTime(row.downSince)}</td>
                        <td style={tdStyle}>{row.daysDown}</td>
                        <td style={tdStyle}>
                          <Link href={row.maintenanceHref} style={actionLinkStyle}>
                            {row.openRequestsCount}
                          </Link>
                        </td>
                        <td style={tdStyle}>
                          {row.lastMaintenanceLogDate ? formatDateTime(row.lastMaintenanceLogDate) : "—"}
                          <div style={{ marginTop: 8 }}>
                            <Link href={row.historyHref} style={actionLinkStyle}>
                              View History
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {!loading && !errorMessage && isAuthenticated && tab === "Failures" ? (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <div style={cardStyle()}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Failure Frequency</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <Field label="Start Date">
                <input type="date" value={failureStartDate} onChange={(e) => setFailureStartDate(e.target.value)} style={inputStyle()} />
              </Field>
              <Field label="End Date">
                <input type="date" value={failureEndDate} onChange={(e) => setFailureEndDate(e.target.value)} style={inputStyle()} />
              </Field>
              <Field label="Asset Type">
                <select
                  value={failureAssetTypeFilter}
                  onChange={(e) => setFailureAssetTypeFilter(e.target.value as AssetTypeFilter)}
                  style={inputStyle()}
                >
                  <option>All</option>
                  <option>Vehicles</option>
                  <option>Equipment</option>
                </select>
              </Field>
              <Field label="System Affected">
                <select value={failureSystemFilter} onChange={(e) => setFailureSystemFilter(e.target.value)} style={inputStyle()}>
                  {failureSystemOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div style={{ opacity: 0.75, fontSize: 12 }}>
              Showing {failureRows.length} failure log{failureRows.length === 1 ? "" : "s"}.
            </div>
          </div>

          <div style={cardStyle()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ fontWeight: 900 }}>Top Systems Affected</div>
              <button
                type="button"
                style={actionButtonStyle}
                onClick={() =>
                  downloadCsv(
                    "ops-top-systems.csv",
                    ["system_affected", "count"],
                    topSystems.map((row) => [row.system, row.count])
                  )
                }
              >
                Export CSV
              </button>
            </div>

            {topSystems.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No failure systems found for the current filters.</div>
            ) : (
              <>
                <svg viewBox={`0 0 640 ${Math.max(80, topSystems.length * 24 + 20)}`} width="100%" height={Math.max(120, topSystems.length * 24 + 20)}>
                  {(() => {
                    const maxCount = Math.max(...topSystems.map((r) => r.count), 1);
                    const left = 180;
                    const maxWidth = 420;
                    return topSystems.map((row, idx) => {
                      const y = 20 + idx * 24;
                      const width = (row.count / maxCount) * maxWidth;
                      return (
                        <g key={`sys-bar:${row.system}`}>
                          <text x={8} y={y + 14} fill="currentColor" fontSize="11">
                            {row.system}
                          </text>
                          <rect x={left} y={y} width={width} height={14} rx={4} fill="rgba(255,120,120,0.65)" />
                          <text x={left + width + 8} y={y + 12} fill="currentColor" fontSize="11">
                            {row.count}
                          </text>
                        </g>
                      );
                    });
                  })()}
                </svg>

                <div style={{ overflowX: "auto", marginTop: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>System Affected</th>
                        <th style={thStyle}>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topSystems.map((row) => (
                        <tr key={`sys-row:${row.system}`}>
                          <td style={tdStyle}>{row.system}</td>
                          <td style={tdStyle}>{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div style={cardStyle()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ fontWeight: 900 }}>Top Repeat Assets</div>
              <button
                type="button"
                style={actionButtonStyle}
                onClick={() =>
                  downloadCsv(
                    "ops-top-repeat-assets.csv",
                    ["asset_type", "asset_id", "asset_name", "failure_count"],
                    topRepeatAssets.map((row) => [row.assetType, row.assetId, row.assetName, row.count])
                  )
                }
              >
                Export CSV
              </button>
            </div>

            {topRepeatAssets.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No repeat assets found for the current filters.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Asset</th>
                      <th style={thStyle}>Type</th>
                      <th style={thStyle}>Failures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRepeatAssets.map((row) => (
                      <tr key={`asset-repeat:${row.assetType}:${row.assetId}`}>
                        <td style={tdStyle}>
                          <Link href={row.href} style={{ color: "inherit", fontWeight: 800 }}>
                            {row.assetName}
                          </Link>
                          <div style={{ opacity: 0.72, fontSize: 12 }}>{row.assetId}</div>
                        </td>
                        <td style={tdStyle}>{row.assetType}</td>
                        <td style={tdStyle}>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={cardStyle()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ fontWeight: 900 }}>Recent Failures</div>
              <button
                type="button"
                style={actionButtonStyle}
                onClick={() =>
                  downloadCsv(
                    "ops-recent-failures.csv",
                    ["created_at", "asset_type", "asset_id", "asset_name", "system_affected", "description", "request_id", "history_url"],
                    recentFailures.map((row) => [
                      row.created_at,
                      row.assetType,
                      row.assetId,
                      row.assetName,
                      row.systemAffected,
                      row.description,
                      row.request_id ?? "",
                      row.historyHref,
                    ])
                  )
                }
              >
                Export CSV
              </button>
            </div>

            {recentFailures.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No recent failures found for the current filters.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {recentFailures.map((row) => (
                  <div
                    key={`recent-failure:${row.id}`}
                    style={{
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 12,
                      padding: 10,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 240 }}>
                      <div style={{ fontWeight: 800 }}>
                        <Link href={row.detailHref} style={{ color: "inherit" }}>
                          {row.assetName}
                        </Link>{" "}
                        <span style={{ opacity: 0.72 }}>({row.assetType})</span>
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        {row.assetId} · {formatDateTime(row.created_at)}
                        {row.request_id ? ` · Request ${row.request_id}` : ""}
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <strong>{row.systemAffected}</strong> - {row.description}
                      </div>
                    </div>
                    <Link href={row.historyHref} style={actionLinkStyle}>
                      View History
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {!loading && !errorMessage && isAuthenticated && tab === "Performance" ? (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <div style={cardStyle()}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Maintenance Velocity</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
              }}
            >
              <Field label="Start Date">
                <input
                  type="date"
                  value={performanceStartDate}
                  onChange={(e) => setPerformanceStartDate(e.target.value)}
                  style={inputStyle()}
                />
              </Field>
              <Field label="End Date">
                <input
                  type="date"
                  value={performanceEndDate}
                  onChange={(e) => setPerformanceEndDate(e.target.value)}
                  style={inputStyle()}
                />
              </Field>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <div style={metricStyle()}>
              <div style={{ fontSize: 12, opacity: 0.74 }}>Open Requests (In Range)</div>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{performanceOpenCount}</div>
            </div>
            <div style={metricStyle()}>
              <div style={{ fontSize: 12, opacity: 0.74 }}>Closed Requests (In Range)</div>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{performanceClosedCount}</div>
            </div>
            <div style={metricStyle()}>
              <div style={{ fontSize: 12, opacity: 0.74 }}>Avg Time to Close</div>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{performanceAvgCloseDays} days</div>
            </div>
          </div>

          <div style={cardStyle()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 900 }}>Requests Created vs Closed by Week</div>
              <button
                type="button"
                style={actionButtonStyle}
                onClick={() =>
                  downloadCsv(
                    "ops-weekly-created-closed.csv",
                    ["week_start", "created", "closed"],
                    performanceWeeklyRows.map((row) => [row.week, row.created, row.closed])
                  )
                }
              >
                Export CSV
              </button>
            </div>

            {performanceWeeklyRows.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No request velocity data in the selected date range.</div>
            ) : (
              <>
                <svg viewBox="0 0 640 220" width="100%" height={220}>
                  {(() => {
                    const maxValue = Math.max(
                      1,
                      ...performanceWeeklyRows.flatMap((row) => [row.created, row.closed])
                    );
                    const left = 40;
                    const right = 620;
                    const top = 20;
                    const bottom = 190;
                    const width = right - left;
                    const height = bottom - top;
                    const denom = Math.max(1, performanceWeeklyRows.length - 1);

                    const pointX = (idx: number) => left + (idx / denom) * width;
                    const pointY = (value: number) => bottom - (value / maxValue) * height;

                    const createdPoints = performanceWeeklyRows
                      .map((row, idx) => `${pointX(idx)},${pointY(row.created)}`)
                      .join(" ");
                    const closedPoints = performanceWeeklyRows
                      .map((row, idx) => `${pointX(idx)},${pointY(row.closed)}`)
                      .join(" ");

                    return (
                      <>
                        <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="rgba(255,255,255,0.2)" />
                        <line x1={left} y1={top} x2={left} y2={bottom} stroke="rgba(255,255,255,0.2)" />
                        <polyline fill="none" stroke="rgba(120,200,255,0.9)" strokeWidth="2.5" points={createdPoints} />
                        <polyline fill="none" stroke="rgba(126,255,167,0.9)" strokeWidth="2.5" points={closedPoints} />
                        <text x={left} y={12} fill="currentColor" fontSize="11">
                          Created (blue) / Closed (green)
                        </text>
                      </>
                    );
                  })()}
                </svg>

                <div style={{ overflowX: "auto", marginTop: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Week Start</th>
                        <th style={thStyle}>Created</th>
                        <th style={thStyle}>Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {performanceWeeklyRows.map((row) => (
                        <tr key={`perf-week:${row.week}`}>
                          <td style={tdStyle}>{row.week}</td>
                          <td style={tdStyle}>{row.created}</td>
                          <td style={tdStyle}>{row.closed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div style={cardStyle()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 900 }}>By Mechanic</div>
              <button
                type="button"
                style={actionButtonStyle}
                onClick={() =>
                  downloadCsv(
                    "ops-by-mechanic.csv",
                    ["created_by", "display_name_or_email", "logs_count"],
                    performanceByMechanic.map((row) => [row.createdBy, row.display, row.count])
                  )
                }
              >
                Export CSV
              </button>
            </div>

            {performanceLogsInRange.every((row) => !row.created_by) ? (
              <div style={{ opacity: 0.75 }}>No `created_by` data found on maintenance logs for this range.</div>
            ) : performanceByMechanic.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No maintenance logs found in the selected date range.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Mechanic</th>
                      <th style={thStyle}>Created By</th>
                      <th style={thStyle}>Logs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performanceByMechanic.map((row) => (
                      <tr key={`perf-mechanic:${row.createdBy}`}>
                        <td style={tdStyle}>{row.display}</td>
                        <td style={tdStyle}>{row.createdBy}</td>
                        <td style={tdStyle}>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {!loading && !errorMessage && isAuthenticated && tab !== "Overview" && tab !== "PM Due" && tab !== "Downtime" && tab !== "Failures" && tab !== "Performance" ? (
        <div style={{ marginTop: 16, ...cardStyle() }}>
          <div style={{ fontWeight: 900 }}>{tab}</div>
          <div style={{ marginTop: 8, opacity: 0.75 }}>
            This tab is ready for detailed operational metrics and workflows.
          </div>
        </div>
      ) : null}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.18)",
  opacity: 0.8,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.10)",
  verticalAlign: "top",
};

const actionLinkStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 10,
  padding: "6px 9px",
  textDecoration: "none",
  color: "inherit",
  fontWeight: 700,
  fontSize: 12,
};

const actionButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 10,
  padding: "6px 9px",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
};
