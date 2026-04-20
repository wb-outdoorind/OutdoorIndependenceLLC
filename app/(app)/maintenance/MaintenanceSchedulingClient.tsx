"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  coerceMaintenanceRequestStatus,
  type MaintenanceRequestStatus,
} from "@/lib/maintenanceStatus";
import { isPurchaseCompletedForMaintenance } from "@/lib/purchases";
import { isManagementRole } from "@/lib/roles";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import ScheduleBoard from "@/components/maintenance/schedule/ScheduleBoard";
import ScheduleBoardFilters from "@/components/maintenance/schedule/ScheduleBoardFilters";
import ScheduleBoardHeader from "@/components/maintenance/schedule/ScheduleBoardHeader";
import type {
  AssigneeOption,
  AssetType,
  DropCardArgs,
  MaintenanceCardData,
  ScheduleColumnData,
  Urgency,
} from "@/components/maintenance/schedule/types";

type SchedulingMode = "manager" | "mechanic";
type RequestTable = "maintenance_requests" | "equipment_maintenance_requests";

type VehicleRow = {
  id: string;
  name: string | null;
  type: string | null;
};

type EquipmentRow = {
  id: string;
  name: string | null;
  equipment_type: string | null;
};

type BaseRequestRow = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string | null;
  urgency: string | null;
  description: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  assigned_to: string | null;
  position: number | null;
};

type VehicleRequestRow = BaseRequestRow & {
  vehicle_id: string;
};

type EquipmentRequestRow = BaseRequestRow & {
  equipment_id: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  middle_initial: string | null;
  last_name: string | null;
  nickname: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
};

type PurchaseLinkType = AssetType;

type PurchaseLinkRow = {
  id: string;
  overall_status: string | null;
  maintenance_request_type: PurchaseLinkType | null;
  maintenance_request_id: string | null;
  maintenance_log_type: PurchaseLinkType | null;
  maintenance_log_id: string | null;
};

type MaintenanceLogLinkRow = {
  id: string;
  request_id: string | null;
};

type MaintenanceLogRequestLinkRow = {
  maintenance_log_id: string;
  request_id: string;
};

type MaintenanceTask = {
  key: string;
  table: RequestTable;
  id: string;
  assetType: AssetType;
  assetId: string;
  assetName: string;
  assetSubtitle: string | null;
  title: string;
  status: MaintenanceRequestStatus;
  priority: Urgency;
  assignedTo: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  overdue: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
  waitingOnParts: boolean;
  waitingOnPartsSources: number;
};

type WeekColumn = {
  key: string;
  label: string;
  dateKey: string;
};

const ASSIGNABLE_ROLES = [
  "mechanic",
  "owner",
  "operations_manager",
  "sales_manager",
  "office_admin",
] as const;

function cardStyle(): CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 14,
    background: "rgba(255,255,255,0.03)",
  };
}

function buttonStyle(): CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.08)",
    color: "inherit",
    borderRadius: 10,
    padding: "10px 12px",
    fontWeight: 800,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  };
}

function primaryButtonStyle(): CSSProperties {
  return {
    ...buttonStyle(),
    background: "rgba(44, 165, 95, 0.24)",
    borderColor: "rgba(44, 165, 95, 0.56)",
  };
}

function disabledActionButtonStyle(): CSSProperties {
  return {
    ...buttonStyle(),
    background: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.14)",
    color: "rgba(255,255,255,0.52)",
    cursor: "not-allowed",
  };
}

function statusBadgeStyle(status: MaintenanceRequestStatus): CSSProperties {
  const base: CSSProperties = {
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    padding: "3px 10px",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };

  if (status === "Closed") {
    return { ...base, borderColor: "rgba(70,220,120,0.45)", background: "rgba(70,220,120,0.16)" };
  }
  if (status === "Open" || status === "Pending Approval") {
    return { ...base, borderColor: "rgba(245,200,90,0.45)", background: "rgba(245,200,90,0.16)" };
  }
  if (status === "In Progress") {
    return { ...base, borderColor: "rgba(120,180,255,0.45)", background: "rgba(120,180,255,0.14)" };
  }
  return base;
}

function urgencyValue(value: string | null | undefined): Urgency {
  return value === "Low" || value === "Medium" || value === "High" || value === "Urgent"
    ? value
    : "Medium";
}

function parseTitle(raw: string | null | undefined, fallback: string) {
  if (raw == null || raw === "") return fallback;
  const firstLine = raw.split("\n")[0] ? raw.split("\n")[0].trim() : "";
  if (firstLine.startsWith("Title:")) {
    const title = firstLine.slice("Title:".length).trim();
    return title || fallback;
  }
  return firstLine || fallback;
}

function displayName(row: ProfileRow) {
  const nickname = (row.nickname ?? "").trim();
  const first = (row.first_name ?? "").trim();
  const middle = (row.middle_initial ?? "").trim();
  const last = (row.last_name ?? "").trim();
  if (nickname && last) return nickname + " " + last;
  if (nickname) return nickname;
  const parts = [first, middle, last].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  const full = (row.full_name ?? "").trim();
  if (full) return full;
  const email = (row.email ?? "").trim();
  if (email) return email;
  return row.id;
}

function dayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function weekStartMonday(anchor: Date) {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function addDays(date: Date, delta: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + delta);
  return next;
}

function compareTasks(a: MaintenanceTask, b: MaintenanceTask) {
  if (a.overdue !== b.overdue) {
    return a.overdue ? -1 : 1;
  }
  if (a.position !== b.position) return a.position - b.position;
  const aTs = Date.parse(a.createdAt) || 0;
  const bTs = Date.parse(b.createdAt) || 0;
  if (aTs !== bTs) return aTs - bTs;
  return a.title.localeCompare(b.title);
}

function isOverdueTask(scheduledDate: string | null, status: MaintenanceRequestStatus, todayKey: string) {
  if (!scheduledDate || scheduledDate.trim() === "") return false;
  if (status === "Closed") return false;
  return scheduledDate < todayKey;
}

function formatDateLabel(value: string | null) {
  if (value == null || value === "") return "Unscheduled";
  const date = new Date(value + "T12:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isToday(dateLike: string) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isMissingRelationError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  if (error.code === "42P01") return true;
  if (error.code === "42501") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("does not exist") || message.includes("permission denied");
}

function requestKeyFromParts(assetType: AssetType, requestId: string) {
  return assetType + ":" + requestId;
}

function requestHref(task: MaintenanceTask) {
  return "/maintenance/" + encodeURIComponent(task.id) + "?assetType=" + task.assetType;
}

function assetHref(task: MaintenanceTask) {
  if (task.assetType === "vehicle") {
    return "/vehicles/" + encodeURIComponent(task.assetId);
  }
  return "/equipment/" + encodeURIComponent(task.assetId);
}

function sectionTitleForTask(task: Pick<MaintenanceTask, "status" | "waitingOnParts">): string {
  if (task.waitingOnParts && task.status !== "In Progress" && task.status !== "Closed") {
    return "Waiting";
  }
  const status = task.status;
  if (status === "In Progress") return "In Progress";
  if (status === "Closed") return "Completed";
  if (
    status === "Waiting on Parts" ||
    status === "External Repair" ||
    status === "On Hold" ||
    status === "Pending Approval"
  ) {
    return "Waiting";
  }
  return "Ready to Start";
}

function toCard(task: MaintenanceTask): MaintenanceCardData {
  return {
    key: task.key,
    id: task.id,
    assetType: task.assetType,
    assetId: task.assetId,
    assetName: task.assetName,
    assetSubtitle: task.assetSubtitle,
    title: task.title,
    status: task.status,
    priority: task.priority,
    assignedTo: task.assignedTo,
    scheduledDate: task.scheduledDate,
    scheduledTime: task.scheduledTime,
    overdue: task.overdue,
    waitingOnParts: task.waitingOnParts,
    waitingOnPartsSources: task.waitingOnPartsSources,
    requestHref: requestHref(task),
    assetHref: assetHref(task),
  };
}

export default function MaintenanceSchedulingClient({
  mode,
  role,
  currentUserId,
  focusRequestId = null,
}: {
  mode: SchedulingMode;
  role: string;
  currentUserId: string;
  focusRequestId?: string | null;
}) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [draggingTaskKey, setDraggingTaskKey] = useState<string | null>(null);
  const [showUnscheduled, setShowUnscheduled] = useState(true);
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [saving, setSaving] = useState(false);
  const [focusedTaskKey, setFocusedTaskKey] = useState<string | null>(null);
  const focusHandledForIdRef = useRef<string | null>(null);
  const normalizedFocusRequestId = useMemo(() => (focusRequestId ?? "").trim(), [focusRequestId]);

  const syncOverdueNotifications = useCallback((rows: MaintenanceTask[]) => {
    const items = Array.from(
      new Map(
        rows
          .filter((row) => row.overdue && row.assignedTo)
          .map((row) => [row.key, { assetType: row.assetType, requestId: row.id }] as const)
      ).values()
    );
    if (!items.length) return;
    void fetch("/api/maintenance/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sync_overdue",
        items,
      }),
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadingError(null);

    const [vehiclesRes, equipmentRes, vehicleReqRes, equipmentReqRes, assigneesRes, purchasesRes] = await Promise.all([
      supabase.from("vehicles").select("id,name,type").order("name", { ascending: true }).limit(2000),
      supabase
        .from("equipment")
        .select("id,name,equipment_type")
        .order("name", { ascending: true })
        .limit(2000),
      supabase
        .from("maintenance_requests")
        .select(
          "id,vehicle_id,created_at,updated_at,status,urgency,description,scheduled_date,scheduled_time,assigned_to,position"
        )
        .order("created_at", { ascending: false })
        .limit(2500),
      supabase
        .from("equipment_maintenance_requests")
        .select(
          "id,equipment_id,created_at,updated_at,status,urgency,description,scheduled_date,scheduled_time,assigned_to,position"
        )
        .order("created_at", { ascending: false })
        .limit(2500),
      supabase
        .from("profiles")
        .select("id,full_name,first_name,middle_initial,last_name,nickname,email,role,status")
        .in("role", [...ASSIGNABLE_ROLES])
        .eq("status", "Active")
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true })
        .limit(200),
      supabase
        .from("purchase_requests")
        .select(
          "id,overall_status,maintenance_request_type,maintenance_request_id,maintenance_log_type,maintenance_log_id"
        )
        .order("created_at", { ascending: false })
        .limit(4000),
    ]);

    if (
      vehiclesRes.error ||
      equipmentRes.error ||
      vehicleReqRes.error ||
      equipmentReqRes.error ||
      assigneesRes.error ||
      purchasesRes.error
    ) {
      setLoadingError(
        vehicleReqRes.error?.message ||
          equipmentReqRes.error?.message ||
          vehiclesRes.error?.message ||
          equipmentRes.error?.message ||
          assigneesRes.error?.message ||
          purchasesRes.error?.message ||
          "Failed to load maintenance scheduling data."
      );
      setLoading(false);
      return;
    }

    const vehicles = (vehiclesRes.data ?? []) as VehicleRow[];
    const equipment = (equipmentRes.data ?? []) as EquipmentRow[];
    const vehicleRequests = (vehicleReqRes.data ?? []) as VehicleRequestRow[];
    const equipmentRequests = (equipmentReqRes.data ?? []) as EquipmentRequestRow[];
    const profileRows = (assigneesRes.data ?? []) as ProfileRow[];
    const purchaseRows = (purchasesRes.data ?? []) as PurchaseLinkRow[];

    const vehicleMap = new Map(vehicles.map((row) => [row.id, row] as const));
    const equipmentMap = new Map(equipment.map((row) => [row.id, row] as const));
    const waitingRequestCounts = new Map<string, number>();

    const linkedVehicleLogIds = Array.from(
      new Set(
        purchaseRows
          .filter(
            (row) =>
              !isPurchaseCompletedForMaintenance(row.overall_status) &&
              row.maintenance_log_type === "vehicle" &&
              typeof row.maintenance_log_id === "string" &&
              row.maintenance_log_id.trim() !== ""
          )
          .map((row) => row.maintenance_log_id as string)
      )
    );
    const linkedEquipmentLogIds = Array.from(
      new Set(
        purchaseRows
          .filter(
            (row) =>
              !isPurchaseCompletedForMaintenance(row.overall_status) &&
              row.maintenance_log_type === "equipment" &&
              typeof row.maintenance_log_id === "string" &&
              row.maintenance_log_id.trim() !== ""
          )
          .map((row) => row.maintenance_log_id as string)
      )
    );

    let vehicleLogRows: MaintenanceLogLinkRow[] = [];
    let equipmentLogRows: MaintenanceLogLinkRow[] = [];
    let vehicleLogRequestLinks: MaintenanceLogRequestLinkRow[] = [];
    let equipmentLogRequestLinks: MaintenanceLogRequestLinkRow[] = [];

    if (linkedVehicleLogIds.length > 0) {
      const res = await supabase
        .from("maintenance_logs")
        .select("id,request_id")
        .in("id", linkedVehicleLogIds)
        .limit(4000);
      if (res.error) {
        setLoadingError(res.error.message || "Failed to load linked maintenance logs.");
        setLoading(false);
        return;
      }
      vehicleLogRows = (res.data ?? []) as MaintenanceLogLinkRow[];

      const linkRes = await supabase
        .from("maintenance_log_request_links")
        .select("maintenance_log_id,request_id")
        .in("maintenance_log_id", linkedVehicleLogIds)
        .limit(6000);
      if (linkRes.error && !isMissingRelationError(linkRes.error)) {
        setLoadingError(linkRes.error.message || "Failed to load maintenance log request links.");
        setLoading(false);
        return;
      }
      vehicleLogRequestLinks = ((linkRes.data ?? []) as MaintenanceLogRequestLinkRow[]).filter(
        (row) => typeof row.request_id === "string" && row.request_id.trim() !== ""
      );
    }

    if (linkedEquipmentLogIds.length > 0) {
      const res = await supabase
        .from("equipment_maintenance_logs")
        .select("id,request_id")
        .in("id", linkedEquipmentLogIds)
        .limit(4000);
      if (res.error) {
        setLoadingError(res.error.message || "Failed to load linked equipment maintenance logs.");
        setLoading(false);
        return;
      }
      equipmentLogRows = (res.data ?? []) as MaintenanceLogLinkRow[];

      const linkRes = await supabase
        .from("equipment_maintenance_log_request_links")
        .select("maintenance_log_id,request_id")
        .in("maintenance_log_id", linkedEquipmentLogIds)
        .limit(6000);
      if (linkRes.error && !isMissingRelationError(linkRes.error)) {
        setLoadingError(linkRes.error.message || "Failed to load equipment maintenance log request links.");
        setLoading(false);
        return;
      }
      equipmentLogRequestLinks = ((linkRes.data ?? []) as MaintenanceLogRequestLinkRow[]).filter(
        (row) => typeof row.request_id === "string" && row.request_id.trim() !== ""
      );
    }

    const vehicleLogToRequestIds = new Map<string, Set<string>>();
    for (const row of vehicleLogRows) {
      if (!row.request_id) continue;
      const bucket = vehicleLogToRequestIds.get(row.id) ?? new Set<string>();
      bucket.add(row.request_id);
      vehicleLogToRequestIds.set(row.id, bucket);
    }
    for (const row of vehicleLogRequestLinks) {
      const bucket = vehicleLogToRequestIds.get(row.maintenance_log_id) ?? new Set<string>();
      bucket.add(row.request_id);
      vehicleLogToRequestIds.set(row.maintenance_log_id, bucket);
    }

    const equipmentLogToRequestIds = new Map<string, Set<string>>();
    for (const row of equipmentLogRows) {
      if (!row.request_id) continue;
      const bucket = equipmentLogToRequestIds.get(row.id) ?? new Set<string>();
      bucket.add(row.request_id);
      equipmentLogToRequestIds.set(row.id, bucket);
    }
    for (const row of equipmentLogRequestLinks) {
      const bucket = equipmentLogToRequestIds.get(row.maintenance_log_id) ?? new Set<string>();
      bucket.add(row.request_id);
      equipmentLogToRequestIds.set(row.maintenance_log_id, bucket);
    }

    function addWaitingCount(assetType: AssetType, requestId: string) {
      const id = requestId.trim();
      if (!id) return;
      const key = requestKeyFromParts(assetType, id);
      waitingRequestCounts.set(key, (waitingRequestCounts.get(key) ?? 0) + 1);
    }

    for (const purchaseRow of purchaseRows) {
      if (isPurchaseCompletedForMaintenance(purchaseRow.overall_status)) continue;

      if (purchaseRow.maintenance_request_type && purchaseRow.maintenance_request_id) {
        addWaitingCount(purchaseRow.maintenance_request_type, purchaseRow.maintenance_request_id);
      }

      if (purchaseRow.maintenance_log_type === "vehicle" && purchaseRow.maintenance_log_id) {
        const linked = vehicleLogToRequestIds.get(purchaseRow.maintenance_log_id);
        if (linked) {
          for (const requestId of linked) addWaitingCount("vehicle", requestId);
        }
      }

      if (purchaseRow.maintenance_log_type === "equipment" && purchaseRow.maintenance_log_id) {
        const linked = equipmentLogToRequestIds.get(purchaseRow.maintenance_log_id);
        if (linked) {
          for (const requestId of linked) addWaitingCount("equipment", requestId);
        }
      }
    }

    const normalized: MaintenanceTask[] = [];
    const todayKey = dayKey(new Date());

    for (const row of vehicleRequests) {
      const vehicle = vehicleMap.get(row.vehicle_id);
      const waitingCount = waitingRequestCounts.get(requestKeyFromParts("vehicle", row.id)) ?? 0;
      const status = coerceMaintenanceRequestStatus(row.status, "Open");
      normalized.push({
        key: "vehicle:" + row.id,
        table: "maintenance_requests",
        id: row.id,
        assetType: "vehicle",
        assetId: row.vehicle_id,
        assetName: vehicle?.name?.trim() || row.vehicle_id,
        assetSubtitle: vehicle?.type?.trim() || null,
        title: parseTitle(row.description, "Maintenance Request"),
        status,
        priority: urgencyValue(row.urgency),
        assignedTo: row.assigned_to,
        scheduledDate: row.scheduled_date,
        scheduledTime: row.scheduled_time,
        overdue: isOverdueTask(row.scheduled_date, status, todayKey),
        position: Number(row.position ?? 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        waitingOnParts: waitingCount > 0,
        waitingOnPartsSources: waitingCount,
      });
    }

    for (const row of equipmentRequests) {
      const unit = equipmentMap.get(row.equipment_id);
      const waitingCount = waitingRequestCounts.get(requestKeyFromParts("equipment", row.id)) ?? 0;
      const status = coerceMaintenanceRequestStatus(row.status, "Open");
      normalized.push({
        key: "equipment:" + row.id,
        table: "equipment_maintenance_requests",
        id: row.id,
        assetType: "equipment",
        assetId: row.equipment_id,
        assetName: unit?.name?.trim() || row.equipment_id,
        assetSubtitle: unit?.equipment_type?.trim() || null,
        title: parseTitle(row.description, "Maintenance Request"),
        status,
        priority: urgencyValue(row.urgency),
        assignedTo: row.assigned_to,
        scheduledDate: row.scheduled_date,
        scheduledTime: row.scheduled_time,
        overdue: isOverdueTask(row.scheduled_date, status, todayKey),
        position: Number(row.position ?? 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        waitingOnParts: waitingCount > 0,
        waitingOnPartsSources: waitingCount,
      });
    }

    const options = profileRows.map((row) => ({ id: row.id, label: displayName(row) }));

    syncOverdueNotifications(normalized);
    setTasks(normalized);
    setAssignees(options);
    setLoading(false);
  }, [supabase, syncOverdueNotifications]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled === false) {
        void loadData();
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadData]);

  const assigneeLabelMap = useMemo(
    () => new Map(assignees.map((option) => [option.id, option.label] as const)),
    [assignees]
  );

  const weekColumns = useMemo(() => {
    const start = weekStartMonday(anchorDate);
    const columns: WeekColumn[] = [];
    for (let i = 0; i < 7; i += 1) {
      const d = addDays(start, i);
      columns.push({
        key: dayKey(d),
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
        dateKey: dayKey(d),
      });
    }
    return columns;
  }, [anchorDate]);

  const managerVisibleTasks = useMemo(() => tasks, [tasks]);

  const managerTasksByDate = useMemo(() => {
    const grouped = new Map<string, MaintenanceTask[]>();
    for (const task of managerVisibleTasks) {
      const key = task.scheduledDate || "unscheduled";
      if (grouped.has(key) === false) grouped.set(key, []);
      grouped.get(key)?.push(task);
    }
    for (const [, group] of grouped) {
      group.sort(compareTasks);
    }
    return grouped;
  }, [managerVisibleTasks]);

  const managerColumns = useMemo<ScheduleColumnData[]>(() => {
    return weekColumns.map((column) => ({
      id: column.key,
      label: column.label,
      subtitle: formatDateLabel(column.dateKey),
      date: column.dateKey,
      cards: (managerTasksByDate.get(column.dateKey) ?? []).map(toCard),
    }));
  }, [weekColumns, managerTasksByDate]);

  const unscheduledColumn = useMemo<ScheduleColumnData | null>(() => {
    if (showUnscheduled === false) return null;
    return {
      id: "unscheduled",
      label: "Unscheduled",
      subtitle: undefined,
      date: null,
      cards: (managerTasksByDate.get("unscheduled") ?? []).map(toCard),
    };
  }, [managerTasksByDate, showUnscheduled]);

  const myAssignedTasks = useMemo(
    () => tasks.filter((task) => task.assignedTo === currentUserId),
    [tasks, currentUserId]
  );

  const waitingStatuses = useMemo<Set<MaintenanceRequestStatus>>(
    () => new Set<MaintenanceRequestStatus>(["Waiting on Parts", "External Repair", "On Hold", "Pending Approval"]),
    []
  );

  const isDerivedWaiting = useCallback((task: MaintenanceTask) => {
    return task.waitingOnParts && task.status !== "In Progress" && task.status !== "Closed";
  }, []);

  const myReady = useMemo(
    () =>
      myAssignedTasks.filter(
        (task) =>
          task.status !== "In Progress" &&
          task.status !== "Closed" &&
          !waitingStatuses.has(task.status) &&
          !isDerivedWaiting(task)
      ),
    [myAssignedTasks, isDerivedWaiting, waitingStatuses]
  );
  const myInProgress = useMemo(
    () => myAssignedTasks.filter((task) => task.status === "In Progress"),
    [myAssignedTasks]
  );
  const myWaiting = useMemo(
    () =>
      myAssignedTasks.filter(
        (task) =>
          task.status !== "Closed" &&
          (
          isDerivedWaiting(task) ||
          waitingStatuses.has(task.status))
      ),
    [myAssignedTasks, isDerivedWaiting, waitingStatuses]
  );
  const myCompletedToday = useMemo(
    () => myAssignedTasks.filter((task) => task.status === "Closed" && isToday(task.updatedAt)),
    [myAssignedTasks]
  );

  useEffect(() => {
    if (mode !== "manager") return;
    if (!normalizedFocusRequestId) {
      focusHandledForIdRef.current = null;
      return;
    }
    if (loading || loadingError != null) return;
    if (focusHandledForIdRef.current === normalizedFocusRequestId) return;

    const task = managerVisibleTasks.find((row) => row.id === normalizedFocusRequestId);
    if (task == null) return;

    focusHandledForIdRef.current = normalizedFocusRequestId;

    const anchorTimer =
      task.scheduledDate && task.scheduledDate.trim()
        ? window.setTimeout(() => {
            const focusDate = new Date(task.scheduledDate + "T12:00:00");
            if (!Number.isNaN(focusDate.getTime())) {
              setAnchorDate(focusDate);
            }
          }, 0)
        : null;

    const activateTimer = window.setTimeout(() => {
      setFocusedTaskKey(task.key);
      const element = document.querySelector<HTMLElement>(
        `[data-maintenance-task-key="${task.key}"]`
      );
      element?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }, 180);

    const clearTimer = window.setTimeout(() => {
      setFocusedTaskKey((current) => (current === task.key ? null : current));
    }, 5600);

    return () => {
      if (anchorTimer != null) {
        window.clearTimeout(anchorTimer);
      }
      window.clearTimeout(activateTimer);
      window.clearTimeout(clearTimer);
    };
  }, [
    loading,
    loadingError,
    managerVisibleTasks,
    mode,
    normalizedFocusRequestId,
  ]);

  async function persistScheduleRows(rows: MaintenanceTask[]) {
    if (rows.length === 0) return;
    setSaving(true);

    const operations = rows.map((row) =>
      supabase
        .from(row.table)
        .update({
          scheduled_date: row.scheduledDate,
          position: row.position,
        })
        .eq("id", row.id)
    );

    const results = await Promise.all(operations);
    const failure = results.find((result) => result.error);
    setSaving(false);

    if (failure?.error) {
      setInlineMessage(failure.error.message || "Failed to save schedule changes. Reloading...");
      void loadData();
      return;
    }

    setInlineMessage("Schedule updated.");
  }

  async function setTaskAssignee(taskKey: string, nextAssignee: string | null) {
    const task = tasks.find((row) => row.key === taskKey);
    if (task == null) return;
    const previousAssignee = task.assignedTo;

    setTasks((prev) => prev.map((row) => (row.key === taskKey ? { ...row, assignedTo: nextAssignee } : row)));

    const { error } = await supabase
      .from(task.table)
      .update({ assigned_to: nextAssignee })
      .eq("id", task.id);

    if (error) {
      setInlineMessage(error.message || "Failed to update assignee.");
      void loadData();
      return;
    }

    if ((previousAssignee ?? "") !== (nextAssignee ?? "") && nextAssignee) {
      void fetch("/api/maintenance/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assignment",
          assetType: task.assetType,
          requestId: task.id,
          previousAssigneeId: previousAssignee,
          nextAssigneeId: nextAssignee,
        }),
      });
    }

    setInlineMessage("Assignee updated.");
  }

  async function setTaskScheduledTime(taskKey: string, nextTime: string | null) {
    const task = tasks.find((row) => row.key === taskKey);
    if (task == null) return;

    setTasks((prev) => prev.map((row) => (row.key === taskKey ? { ...row, scheduledTime: nextTime } : row)));

    const { error } = await supabase
      .from(task.table)
      .update({ scheduled_time: nextTime })
      .eq("id", task.id);

    if (error) {
      setInlineMessage(error.message || "Failed to update scheduled time.");
      void loadData();
      return;
    }

    setInlineMessage("Scheduled time updated.");
  }

  function moveTask({ taskKey, targetDate, targetIndex }: DropCardArgs) {
    let changedRows: MaintenanceTask[] = [];

    setTasks((previous) => {
      const moving = previous.find((task) => task.key === taskKey);
      if (moving == null) return previous;

      const sourceDate = moving.scheduledDate || null;
      const without = previous.filter((task) => task.key !== taskKey);

      const targetColumn = without
        .filter((task) => (task.scheduledDate || null) === targetDate)
        .sort(compareTasks);

      const insertAt =
        targetIndex == null
          ? targetColumn.length
          : Math.max(0, Math.min(targetIndex, targetColumn.length));

      const movedTask: MaintenanceTask = {
        ...moving,
        scheduledDate: targetDate,
        overdue: isOverdueTask(targetDate, moving.status, dayKey(new Date())),
      };

      const targetRebalanced = [
        ...targetColumn.slice(0, insertAt),
        movedTask,
        ...targetColumn.slice(insertAt),
      ].map((task, index) => ({ ...task, position: index }));

      const sourceRebalanced =
        sourceDate === targetDate
          ? []
          : without
              .filter((task) => (task.scheduledDate || null) === sourceDate)
              .sort(compareTasks)
              .map((task, index) => ({ ...task, position: index }));

      const rest = without.filter((task) => {
        const taskDate = task.scheduledDate || null;
        if (taskDate === targetDate) return false;
        if (sourceDate !== targetDate && taskDate === sourceDate) return false;
        return true;
      });

      const nextState = [...rest, ...targetRebalanced, ...sourceRebalanced];

      const previousMap = new Map(previous.map((task) => [task.key, task] as const));
      changedRows = nextState.filter((task) => {
        const previousTask = previousMap.get(task.key);
        if (previousTask == null) return false;
        return (
          (previousTask.scheduledDate || null) !== (task.scheduledDate || null) ||
          previousTask.position !== task.position
        );
      });

      return nextState;
    });

    if (changedRows.length > 0) {
      void persistScheduleRows(changedRows);
    }
  }

  async function updateTaskStatus(taskKey: string, nextStatus: MaintenanceRequestStatus) {
    const task = tasks.find((row) => row.key === taskKey);
    if (task == null) return;

    setSaving(true);
    setTasks((prev) =>
      prev.map((row) =>
        row.key === task.key
          ? {
              ...row,
              status: nextStatus,
              overdue: isOverdueTask(row.scheduledDate, nextStatus, dayKey(new Date())),
              updatedAt: new Date().toISOString(),
            }
          : row
      )
    );

    const { error } = await supabase
      .from(task.table)
      .update({ status: nextStatus })
      .eq("id", task.id);

    setSaving(false);

    if (error) {
      setInlineMessage(error.message || "Failed to update request status.");
      void loadData();
      return;
    }

    setInlineMessage(
      nextStatus === "In Progress" ? "Work started." : nextStatus === "Closed" ? "Task completed." : "Status updated."
    );
  }

  function renderMechanicCard(task: MaintenanceTask) {
    const section = sectionTitleForTask(task);
    const startBlockedByParts = task.waitingOnParts && (task.status === "Open" || task.status === "Scheduled");
    const statusLabel =
      task.waitingOnParts && task.status !== "In Progress" && task.status !== "Closed"
        ? "Waiting on Parts"
        : task.status;

    return (
      <div
        key={task.key}
        style={{
          border: task.overdue
            ? "1px solid rgba(255,120,120,0.38)"
            : task.waitingOnParts
            ? "1px solid rgba(255,170,85,0.34)"
            : "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          background: task.overdue
            ? "rgba(255,120,120,0.09)"
            : task.waitingOnParts
            ? "rgba(255,170,85,0.08)"
            : "rgba(255,255,255,0.03)",
          padding: 12,
          display: "grid",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 15 }}>{task.title}</div>
          <span style={statusBadgeStyle(statusLabel)}>{statusLabel}</span>
        </div>
        <div style={{ fontSize: 13, opacity: 0.86 }}>
          {task.assetName} • {task.assetType === "vehicle" ? "Vehicle" : "Equipment"}
          {task.assetSubtitle ? " • " + task.assetSubtitle : ""}
        </div>
        <div style={{ fontSize: 12, opacity: 0.76 }}>
          Priority: {task.priority} • Scheduled: {formatDateLabel(task.scheduledDate)}
          {task.scheduledTime ? " at " + task.scheduledTime.slice(0, 5) : ""} • {section}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {task.overdue ? (
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#ffd9d9",
                border: "1px solid rgba(255,138,138,0.62)",
                background: "rgba(255,115,115,0.2)",
                borderRadius: 999,
                padding: "4px 10px",
                width: "fit-content",
              }}
            >
              Overdue
            </div>
          ) : null}
          {task.waitingOnParts ? (
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#ffc07a",
                border: "1px solid rgba(255,192,122,0.42)",
                background: "rgba(255,192,122,0.14)",
                borderRadius: 999,
                padding: "4px 10px",
                width: "fit-content",
              }}
            >
              Waiting on Parts
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {task.status === "Open" || task.status === "Scheduled" ? (
            <button
              type="button"
              style={startBlockedByParts ? disabledActionButtonStyle() : primaryButtonStyle()}
              disabled={saving || startBlockedByParts}
              title={startBlockedByParts ? "Waiting on parts — cannot start" : undefined}
              onClick={() => {
                void updateTaskStatus(task.key, "In Progress");
              }}
            >
              Start
            </button>
          ) : null}
          {task.status !== "Closed" ? (
            <button
              type="button"
              style={buttonStyle()}
              disabled={saving}
              onClick={() => {
                void updateTaskStatus(task.key, "Closed");
              }}
            >
              Complete
            </button>
          ) : null}
          <Link href={requestHref(task)} style={buttonStyle()}>
            Open Request
          </Link>
        </div>
        {startBlockedByParts ? (
          <div style={{ fontSize: 12, opacity: 0.72 }}>
            Cannot start until required parts are completed.
          </div>
        ) : null}
      </div>
    );
  }

  const weekStart = weekStartMonday(anchorDate);
  const weekRangeLabel =
    weekStart.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }) +
    " – " +
    addDays(weekStart, 6).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

  return (
    <main style={{ maxWidth: 1400, margin: "0 auto", paddingBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>
            {mode === "manager" ? "Maintenance Schedule" : "Maintenance My Work"}
          </h1>
          <div style={{ opacity: 0.74 }}>
            {mode === "manager"
              ? "Day-based scheduling board for manager planning and assignment."
              : "Assigned maintenance checklist workflow for mechanics."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/maintenance" style={buttonStyle()}>
            Back to Queue
          </Link>
          {mode === "manager" ? (
            <Link href="/maintenance/my-work" style={buttonStyle()}>
              Open My Work
            </Link>
          ) : null}
          {mode === "mechanic" && isManagementRole(role) ? (
            <Link href="/maintenance/schedule" style={buttonStyle()}>
              Open Schedule Board
            </Link>
          ) : null}
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Role: {role}</div>

      {inlineMessage ? <div style={{ marginTop: 12, ...cardStyle(), padding: 12 }}>{inlineMessage}</div> : null}
      {loading ? <div style={{ marginTop: 12, ...cardStyle() }}>Loading maintenance scheduling data...</div> : null}
      {loadingError ? <div style={{ marginTop: 12, ...cardStyle(), color: "#ff9d9d" }}>{loadingError}</div> : null}

      {loading === false && loadingError == null && mode === "manager" ? (
        <section style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div style={{ ...cardStyle(), padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <ScheduleBoardHeader
              weekRangeLabel={weekRangeLabel}
              onPrevWeek={() => setAnchorDate((prev) => addDays(prev, -7))}
              onToday={() => setAnchorDate(new Date())}
              onNextWeek={() => setAnchorDate((prev) => addDays(prev, 7))}
            />
            <ScheduleBoardFilters
              showUnscheduled={showUnscheduled}
              onToggleUnscheduled={setShowUnscheduled}
            />
          </div>

          <ScheduleBoard
            columns={managerColumns}
            unscheduledColumn={unscheduledColumn}
            draggingTaskKey={draggingTaskKey}
            focusedTaskKey={focusedTaskKey}
            assigneeOptions={assignees}
            assigneeLabelMap={assigneeLabelMap}
            onDragStart={setDraggingTaskKey}
            onDragEnd={() => setDraggingTaskKey(null)}
            onDropCard={moveTask}
            onAssign={(taskKey, assigneeId) => {
              void setTaskAssignee(taskKey, assigneeId);
            }}
            onTimeChange={(taskKey, time) => {
              void setTaskScheduledTime(taskKey, time);
            }}
          />

          {saving ? <div style={{ fontSize: 12, opacity: 0.72 }}>Saving schedule changes…</div> : null}
        </section>
      ) : null}

      {loading === false && loadingError == null && mode === "mechanic" ? (
        <section style={{ marginTop: 12, display: "grid", gap: 12 }}>
          <section style={cardStyle()}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Ready to Start</div>
            {myReady.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.72 }}>No tasks ready right now.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>{myReady.sort(compareTasks).map(renderMechanicCard)}</div>
            )}
          </section>

          <section style={cardStyle()}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>In Progress</div>
            {myInProgress.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.72 }}>No tasks currently in progress.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>{myInProgress.sort(compareTasks).map(renderMechanicCard)}</div>
            )}
          </section>

          <section style={cardStyle()}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Waiting</div>
            <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 8 }}>
              These tasks are blocked until required parts are completed.
            </div>
            {myWaiting.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.72 }}>No waiting tasks.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>{myWaiting.sort(compareTasks).map(renderMechanicCard)}</div>
            )}
          </section>

          <section style={cardStyle()}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Completed (Today)</div>
            {myCompletedToday.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.72 }}>No completed tasks today.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>{myCompletedToday.sort(compareTasks).map(renderMechanicCard)}</div>
            )}
          </section>
        </section>
      ) : null}
    </main>
  );
}
