"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  coerceMaintenanceRequestStatus,
  MAINTENANCE_IN_PROGRESS_STATUSES,
  type MaintenanceRequestStatus,
} from "@/lib/maintenanceStatus";
import { isManagementRole, isMechanicOrHigher } from "@/lib/roles";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type MaintenanceMode = "queue" | "new" | "detail";
type AssetType = "vehicle" | "equipment";
type QueueStatusFilter = "all" | "needs_review" | "approved" | "in_progress" | "completed";
type QueueDateFilter = "all" | "7d" | "30d";
type QueueBucket = "needs_review" | "approved" | "in_progress" | "completed";
type Urgency = "Low" | "Medium" | "High" | "Urgent";
type SystemAffected =
  | "Engine"
  | "Electrical"
  | "Hydraulics"
  | "Tires / Wheels"
  | "Brakes"
  | "Steering"
  | "Body / Frame"
  | "Attachment / Implement"
  | "Other";

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

type VehicleRequestRow = {
  id: string;
  vehicle_id: string;
  created_at: string;
  updated_at: string;
  scheduled_date: string | null;
  assigned_to: string | null;
  status: string | null;
  urgency: string | null;
  drivability: string | null;
  system_affected: string | null;
  description: string | null;
};

type EquipmentRequestRow = {
  id: string;
  equipment_id: string;
  created_at: string;
  updated_at: string;
  scheduled_date: string | null;
  assigned_to: string | null;
  status: string | null;
  urgency: string | null;
  drivability: string | null;
  system_affected: string | null;
  description: string | null;
};

type MaintenanceQueueRow = {
  id: string;
  assetType: AssetType;
  assetId: string;
  assetName: string;
  assetSubtitle: string | null;
  createdAt: string;
  updatedAt: string;
  scheduledDate: string | null;
  assignedTo: string | null;
  requestDate: string;
  status: MaintenanceRequestStatus;
  urgency: Urgency;
  drivability: string;
  systemAffected: string;
  title: string;
  details: string;
  requesterName: string;
};

type AssigneeOption = {
  id: string;
  label: string;
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

type QueueStatusOption = {
  value: QueueStatusFilter;
  label: string;
};

type QueueDateOption = {
  value: QueueDateFilter;
  label: string;
};

const STATUS_OPTIONS: QueueStatusOption[] = [
  { value: "all", label: "All Statuses" },
  { value: "needs_review", label: "Needs Review" },
  { value: "approved", label: "Approved" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

const DATE_OPTIONS: QueueDateOption[] = [
  { value: "all", label: "All Time" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
];

const SYSTEM_OPTIONS: SystemAffected[] = [
  "Engine",
  "Electrical",
  "Hydraulics",
  "Tires / Wheels",
  "Brakes",
  "Steering",
  "Body / Frame",
  "Attachment / Implement",
  "Other",
];

const URGENCY_OPTIONS: Urgency[] = ["Low", "Medium", "High", "Urgent"];

const REQUEST_STATUS_OPTIONS: MaintenanceRequestStatus[] = [
  "Open",
  "Pending Approval",
  "Scheduled",
  "In Progress",
  "Waiting on Parts",
  "External Repair",
  "On Hold",
  "Closed",
];

const QUICK_ASSIGNABLE_ROLES = [
  "mechanic",
  "owner",
  "operations_manager",
  "sales_manager",
  "office_admin",
] as const;

const QUEUE_FILTER_NOW = Date.now();

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
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.04)",
    color: "inherit",
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

function dangerButtonStyle(): CSSProperties {
  return {
    ...buttonStyle(),
    background: "rgba(210, 65, 65, 0.22)",
    borderColor: "rgba(255, 110, 110, 0.65)",
    color: "#ffdede",
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
  if (MAINTENANCE_IN_PROGRESS_STATUSES.includes(status)) {
    return { ...base, borderColor: "rgba(120,180,255,0.45)", background: "rgba(120,180,255,0.14)" };
  }
  return base;
}

function overdueBadgeStyle(): CSSProperties {
  return {
    borderRadius: 999,
    border: "1px solid rgba(255,138,138,0.62)",
    background: "rgba(255,115,115,0.2)",
    color: "#ffd9d9",
    padding: "3px 10px",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
}

function stageBadgeStyle(bucket: QueueBucket): CSSProperties {
  if (bucket === "completed") {
    return { ...statusBadgeStyle("Closed"), fontSize: 11, padding: "2px 8px" };
  }
  if (bucket === "needs_review") {
    return {
      ...statusBadgeStyle("Pending Approval"),
      fontSize: 11,
      padding: "2px 8px",
    };
  }
  if (bucket === "approved") {
    return {
      ...statusBadgeStyle("Scheduled"),
      fontSize: 11,
      padding: "2px 8px",
    };
  }
  return {
    ...statusBadgeStyle("In Progress"),
    fontSize: 11,
    padding: "2px 8px",
  };
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isQueueRequestOverdue(scheduledDate: string | null, status: MaintenanceRequestStatus) {
  if (!scheduledDate || scheduledDate.trim() === "") return false;
  if (status === "Closed") return false;
  return scheduledDate < todayYYYYMMDD();
}

function parseFieldValue(raw: string | null | undefined, field: string) {
  if (!raw) return "";
  const prefix = `${field}:`;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim();
    }
  }
  return "";
}

function parseTitleAndDetails(raw: string | null | undefined) {
  if (!raw) return { title: "", details: "" };
  const lines = raw.split("\n");
  const firstLine = lines[0]?.trim() ?? "";

  let title = "";
  if (firstLine.startsWith("Title:")) {
    title = firstLine.slice("Title:".length).trim();
  }

  const detailsMarker = lines.findIndex((line) => line.trim() === "Details:");
  if (detailsMarker >= 0) {
    return {
      title,
      details: lines.slice(detailsMarker + 1).join("\n").trim(),
    };
  }

  if (lines.length <= 2) return { title, details: raw.trim() };
  return { title, details: lines.slice(2).join("\n").trim() };
}

function extractQueueTitle(rawDescription: string | null, systemAffected: string | null) {
  const parsed = parseTitleAndDetails(rawDescription);
  if (parsed.title.trim()) return parsed.title.trim();
  if (rawDescription) {
    const firstLine = rawDescription.split("\n")[0]?.trim();
    if (firstLine && !firstLine.startsWith("Title:")) return firstLine;
  }
  return systemAffected?.trim() ? `${systemAffected.trim()} issue` : "Maintenance Request";
}

function bucketFromStatus(status: MaintenanceRequestStatus): QueueBucket {
  if (status === "Open" || status === "Pending Approval") return "needs_review";
  if (status === "Scheduled") return "approved";
  if (status === "Closed") return "completed";
  return "in_progress";
}

function queueBucketLabel(value: QueueBucket) {
  if (value === "needs_review") return "Needs Review";
  if (value === "approved") return "Approved";
  if (value === "in_progress") return "In Progress";
  return "Completed";
}

function urgencyValue(value: string | null | undefined): Urgency {
  return value === "Low" || value === "Medium" || value === "High" || value === "Urgent" ? value : "Medium";
}

function systemValue(value: string | null | undefined): SystemAffected {
  const v = (value ?? "").trim();
  return SYSTEM_OPTIONS.includes(v as SystemAffected) ? (v as SystemAffected) : "Other";
}

function queueHref(id: string, assetType: AssetType) {
  return `/maintenance/${encodeURIComponent(id)}?assetType=${assetType}`;
}

function assetDetailHref(row: MaintenanceQueueRow) {
  return row.assetType === "vehicle"
    ? `/vehicles/${encodeURIComponent(row.assetId)}`
    : `/equipment/${encodeURIComponent(row.assetId)}`;
}

function requestEditHref(row: MaintenanceQueueRow) {
  const encodedReturn = encodeURIComponent(queueHref(row.id, row.assetType));
  if (row.assetType === "vehicle") {
    return `/vehicles/${encodeURIComponent(row.assetId)}/forms/maintenance-request?editId=${encodeURIComponent(row.id)}&returnTo=${encodedReturn}`;
  }
  return `/equipment/${encodeURIComponent(row.assetId)}/forms/maintenance-request?editId=${encodeURIComponent(row.id)}&returnTo=${encodedReturn}`;
}

function requestLogHref(row: MaintenanceQueueRow) {
  if (row.assetType === "vehicle") {
    return `/vehicles/${encodeURIComponent(row.assetId)}/forms/maintenance-log?requestId=${encodeURIComponent(row.id)}&returnTo=${encodeURIComponent(queueHref(row.id, row.assetType))}`;
  }
  return `/equipment/${encodeURIComponent(row.assetId)}/forms/maintenance-log?requestId=${encodeURIComponent(row.id)}&returnTo=${encodeURIComponent(queueHref(row.id, row.assetType))}`;
}

function normalizeRequesterName(raw: string | null | undefined, fallbackEmail: string | null | undefined) {
  const trimmed = (raw ?? "").trim();
  if (trimmed) return trimmed;
  const fallback = (fallbackEmail ?? "").trim();
  return fallback || "Unknown";
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

function buildDescriptionForIntake(params: {
  title: string;
  details: string;
  requesterName: string;
  requestDate: string;
  linkedRequestId: string;
  linkedLogId: string;
}) {
  const lines = [
    `Title: ${params.title.trim()}`,
    "",
    `Request Date: ${params.requestDate}`,
    `Teammate: ${params.requesterName.trim()}`,
    "Issue Identified During: Other",
    "Mitigation Applied: Not sure",
    "Affects Next Shift: Not sure",
    "Downtime Expected: Not sure",
    "Location Note:",
  ];

  if (params.linkedRequestId.trim()) {
    lines.push(`Linked Maintenance Request: ${params.linkedRequestId.trim()}`);
  }
  if (params.linkedLogId.trim()) {
    lines.push(`Linked Maintenance Log: ${params.linkedLogId.trim()}`);
  }

  lines.push("Details:");
  lines.push(params.details.trim() || "No additional details provided.");

  return lines.join("\n");
}

export default function MaintenanceClient({
  role,
  fullName,
  email,
  mode = "queue",
  requestId = "",
}: {
  role: string;
  fullName?: string | null;
  email?: string | null;
  mode?: MaintenanceMode;
  requestId?: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkedRequestId =
    (searchParams?.get("vehicleRequest") || "").trim() ||
    (searchParams?.get("equipmentRequest") || "").trim() ||
    (searchParams?.get("requestId") || "").trim();

  const prefillAssetType = (searchParams?.get("assetType") || "").trim();
  const prefillAssetId = (searchParams?.get("assetId") || "").trim();
  const prefillTitle =
    (searchParams?.get("title") || "").trim() || (searchParams?.get("reason") || "").trim();
  const prefillDetails = (searchParams?.get("details") || "").trim();
  const prefillUrgency = (searchParams?.get("urgency") || "").trim();
  const prefillSystem = (searchParams?.get("systemAffected") || "").trim();
  const prefillLinkedRequestId = (searchParams?.get("maintenanceRequestId") || "").trim();
  const prefillLinkedLogId = (searchParams?.get("maintenanceLogId") || "").trim();

  const isQueuePage = mode === "queue";
  const isNewPage = mode === "new";
  const isDetailPage = mode === "detail";

  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [requests, setRequests] = useState<MaintenanceQueueRow[]>([]);
  const [assigneeOptions, setAssigneeOptions] = useState<AssigneeOption[]>([]);
  const [quickAssigneeByRequest, setQuickAssigneeByRequest] = useState<Record<string, string>>({});
  const [quickSchedulingKey, setQuickSchedulingKey] = useState<string | null>(null);

  const [queueSearch, setQueueSearch] = useState(() => deepLinkedRequestId);
  const [queueStatusFilter, setQueueStatusFilter] = useState<QueueStatusFilter>("all");
  const [queueDateFilter, setQueueDateFilter] = useState<QueueDateFilter>("all");

  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  const [intakeAssetType, setIntakeAssetType] = useState<AssetType>(() =>
    prefillAssetType === "vehicle" || prefillAssetType === "equipment"
      ? prefillAssetType
      : "vehicle"
  );
  const [intakeAssetId, setIntakeAssetId] = useState(() => prefillAssetId);
  const [intakeTitle, setIntakeTitle] = useState(() => prefillTitle);
  const [intakeDetails, setIntakeDetails] = useState(() => prefillDetails);
  const [intakeUrgency, setIntakeUrgency] = useState<Urgency>(() =>
    prefillUrgency === "Low" ||
    prefillUrgency === "Medium" ||
    prefillUrgency === "High" ||
    prefillUrgency === "Urgent"
      ? prefillUrgency
      : "Medium"
  );
  const [intakeSystem, setIntakeSystem] = useState<SystemAffected>(() =>
    SYSTEM_OPTIONS.includes(prefillSystem as SystemAffected)
      ? (prefillSystem as SystemAffected)
      : "Other"
  );
  const [intakeLinkedRequestId, setIntakeLinkedRequestId] = useState(
    () => prefillLinkedRequestId
  );
  const [intakeLinkedLogId, setIntakeLinkedLogId] = useState(() => prefillLinkedLogId);

  const [editableStatusOverride, setEditableStatusOverride] =
    useState<MaintenanceRequestStatus | null>(null);
  const [editableUrgencyOverride, setEditableUrgencyOverride] =
    useState<Urgency | null>(null);
  const [editableSystemOverride, setEditableSystemOverride] =
    useState<SystemAffected | null>(null);

  const assetTypeHint = (searchParams?.get("assetType") || "").trim();

  useEffect(() => {
    let active = true;

    async function loadData() {
      setLoading(true);
      setLoadingError(null);

      const shouldLoadDetailOnly = isDetailPage && requestId.trim().length > 0;

      const [vehiclesRes, equipmentRes, vehicleReqRes, equipmentReqRes, assigneesRes] = await Promise.all([
        supabase.from("vehicles").select("id,name,type").order("name", { ascending: true }).limit(600),
        supabase.from("equipment").select("id,name,equipment_type").order("name", { ascending: true }).limit(600),
        shouldLoadDetailOnly
          ? supabase
              .from("maintenance_requests")
              .select("id,vehicle_id,created_at,updated_at,scheduled_date,assigned_to,status,urgency,drivability,system_affected,description")
              .eq("id", requestId.trim())
              .limit(1)
          : supabase
              .from("maintenance_requests")
              .select("id,vehicle_id,created_at,updated_at,scheduled_date,assigned_to,status,urgency,drivability,system_affected,description")
              .order("created_at", { ascending: false })
              .limit(2500),
        shouldLoadDetailOnly
          ? supabase
              .from("equipment_maintenance_requests")
              .select("id,equipment_id,created_at,updated_at,scheduled_date,assigned_to,status,urgency,drivability,system_affected,description")
              .eq("id", requestId.trim())
              .limit(1)
          : supabase
              .from("equipment_maintenance_requests")
              .select("id,equipment_id,created_at,updated_at,scheduled_date,assigned_to,status,urgency,drivability,system_affected,description")
              .order("created_at", { ascending: false })
              .limit(2500),
        supabase
          .from("profiles")
          .select("id,full_name,first_name,middle_initial,last_name,nickname,email,role,status")
          .in("role", [...QUICK_ASSIGNABLE_ROLES])
          .eq("status", "Active")
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true })
          .limit(200),
      ]);

      if (!active) return;

      if (
        vehiclesRes.error ||
        equipmentRes.error ||
        vehicleReqRes.error ||
        equipmentReqRes.error ||
        assigneesRes.error
      ) {
        setLoadingError(
          vehicleReqRes.error?.message ||
            equipmentReqRes.error?.message ||
            vehiclesRes.error?.message ||
            equipmentRes.error?.message ||
            assigneesRes.error?.message ||
            "Failed loading maintenance data."
        );
        setLoading(false);
        return;
      }

      const vehicleRows = (vehiclesRes.data ?? []) as VehicleRow[];
      const equipmentRows = (equipmentRes.data ?? []) as EquipmentRow[];
      const vehicleReqRows = (vehicleReqRes.data ?? []) as VehicleRequestRow[];
      const equipmentReqRows = (equipmentReqRes.data ?? []) as EquipmentRequestRow[];
      const profileRows = (assigneesRes.data ?? []) as ProfileRow[];

      const vehicleMap = new Map(vehicleRows.map((row) => [row.id, row] as const));
      const equipmentMap = new Map(equipmentRows.map((row) => [row.id, row] as const));

      const normalized: MaintenanceQueueRow[] = [];

      for (const row of vehicleReqRows) {
        const vehicle = vehicleMap.get(row.vehicle_id);
        const requester =
          parseFieldValue(row.description, "Teammate") ||
          parseFieldValue(row.description, "Employee") ||
          "Unknown";
        const parsed = parseTitleAndDetails(row.description);
        const title = extractQueueTitle(row.description, row.system_affected);
        normalized.push({
          id: row.id,
          assetType: "vehicle",
          assetId: row.vehicle_id,
          assetName: vehicle?.name?.trim() || row.vehicle_id,
          assetSubtitle: vehicle?.type?.trim() || null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          scheduledDate: row.scheduled_date,
          assignedTo: row.assigned_to,
          requestDate: row.created_at.slice(0, 10),
          status: coerceMaintenanceRequestStatus(row.status, "Open"),
          urgency: urgencyValue(row.urgency),
          drivability: (row.drivability ?? "Yes – Drivable").trim() || "Yes – Drivable",
          systemAffected: (row.system_affected ?? "Other").trim() || "Other",
          title,
          details: (parsed.details || "").trim(),
          requesterName: normalizeRequesterName(requester, null),
        });
      }

      for (const row of equipmentReqRows) {
        const unit = equipmentMap.get(row.equipment_id);
        const requester =
          parseFieldValue(row.description, "Teammate") ||
          parseFieldValue(row.description, "Employee") ||
          "Unknown";
        const parsed = parseTitleAndDetails(row.description);
        const title = extractQueueTitle(row.description, row.system_affected);
        normalized.push({
          id: row.id,
          assetType: "equipment",
          assetId: row.equipment_id,
          assetName: unit?.name?.trim() || row.equipment_id,
          assetSubtitle: unit?.equipment_type?.trim() || null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          scheduledDate: row.scheduled_date,
          assignedTo: row.assigned_to,
          requestDate: row.created_at.slice(0, 10),
          status: coerceMaintenanceRequestStatus(row.status, "Open"),
          urgency: urgencyValue(row.urgency),
          drivability: (row.drivability ?? "Yes – Drivable").trim() || "Yes – Drivable",
          systemAffected: (row.system_affected ?? "Other").trim() || "Other",
          title,
          details: (parsed.details || "").trim(),
          requesterName: normalizeRequesterName(requester, null),
        });
      }

      normalized.sort((a, b) => {
        const aTs = Date.parse(a.createdAt) || 0;
        const bTs = Date.parse(b.createdAt) || 0;
        return bTs - aTs;
      });

      if (isQueuePage) {
        const overdueItems = Array.from(
          new Map(
            normalized
              .filter((row) => row.assignedTo && isQueueRequestOverdue(row.scheduledDate, row.status))
              .map((row) => [`${row.assetType}:${row.id}`, { assetType: row.assetType, requestId: row.id }] as const)
          ).values()
        );
        if (overdueItems.length) {
          void fetch("/api/maintenance/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "sync_overdue",
              items: overdueItems,
            }),
          });
        }
      }

      const nextAssignees = profileRows.map((row) => ({
        id: row.id,
        label: displayName(row),
      }));
      const validAssigneeIds = new Set(nextAssignees.map((row) => row.id));
      setAssigneeOptions(nextAssignees);
      setQuickAssigneeByRequest((prev) => {
        const next: Record<string, string> = {};
        for (const row of normalized) {
          const key = `${row.assetType}:${row.id}`;
          const existing = prev[key];
          if (existing && validAssigneeIds.has(existing)) {
            next[key] = existing;
          } else {
            next[key] = "";
          }
        }
        return next;
      });

      setVehicles(vehicleRows);
      setEquipment(equipmentRows);
      setRequests(normalized);
      setLoading(false);
    }

    void loadData();

    return () => {
      active = false;
    };
  }, [isDetailPage, isQueuePage, requestId, supabase]);

  const queueRows = useMemo(() => requests, [requests]);

  const isSearchMode =
    isQueuePage &&
    (queueSearch.trim().length > 0 || queueStatusFilter !== "all" || queueDateFilter !== "all");

  const filteredQueueRows = useMemo(() => {
    if (!isQueuePage) return [] as MaintenanceQueueRow[];
    const query = queueSearch.trim().toLowerCase();
    const dateWindowMs =
      queueDateFilter === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : queueDateFilter === "30d"
          ? 30 * 24 * 60 * 60 * 1000
          : null;

    return queueRows.filter((row) => {
      if (queueStatusFilter !== "all") {
        const bucket = bucketFromStatus(row.status);
        if (bucket !== queueStatusFilter) return false;
      }
      if (dateWindowMs != null) {
        const createdTs = Date.parse(row.createdAt) || 0;
        if (!createdTs || QUEUE_FILTER_NOW - createdTs > dateWindowMs) return false;
      }
      if (!query) return true;

      const haystack = [
        row.id,
        row.title,
        row.details,
        row.assetName,
        row.assetId,
        row.assetSubtitle ?? "",
        row.requesterName,
        row.systemAffected,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [isQueuePage, queueDateFilter, queueRows, queueSearch, queueStatusFilter]);

  const queueGroups = useMemo(() => {
    const source = isSearchMode ? filteredQueueRows : queueRows;
    const grouped: Record<QueueBucket, MaintenanceQueueRow[]> = {
      needs_review: [],
      approved: [],
      in_progress: [],
      completed: [],
    };

    for (const row of source) {
      const bucket = bucketFromStatus(row.status);
      grouped[bucket].push(row);
    }

    return grouped;
  }, [filteredQueueRows, isSearchMode, queueRows]);

  const queueCounts = useMemo(
    () => ({
      needs_review: queueGroups.needs_review.length,
      approved: queueGroups.approved.length,
      in_progress: queueGroups.in_progress.length,
      completed: queueGroups.completed.length,
    }),
    [queueGroups]
  );

  const selectedRequest = useMemo(() => {
    const id = requestId.trim();
    if (!id) return null;

    if (assetTypeHint === "vehicle" || assetTypeHint === "equipment") {
      const foundByHint = requests.find((row) => row.id === id && row.assetType === assetTypeHint);
      if (foundByHint) return foundByHint;
    }

    return requests.find((row) => row.id === id) ?? null;
  }, [assetTypeHint, requestId, requests]);

  const editableStatus =
    editableStatusOverride ?? selectedRequest?.status ?? ("Open" as MaintenanceRequestStatus);
  const editableUrgency = editableUrgencyOverride ?? selectedRequest?.urgency ?? ("Medium" as Urgency);
  const editableSystem =
    editableSystemOverride ??
    systemValue(selectedRequest?.systemAffected ?? "Other");

  const intakeAssetOptions = useMemo(() => {
    if (intakeAssetType === "vehicle") {
      return vehicles.map((row) => ({
        id: row.id,
        label: `${row.name?.trim() || row.id} · ${row.type?.trim() || "Vehicle"}`,
      }));
    }

    return equipment.map((row) => ({
      id: row.id,
      label: `${row.name?.trim() || row.id} · ${row.equipment_type?.trim() || "Equipment"}`,
    }));
  }, [equipment, intakeAssetType, vehicles]);
  const effectiveIntakeAssetId = useMemo(() => {
    if (!intakeAssetOptions.length) return "";
    if (intakeAssetOptions.some((opt) => opt.id === intakeAssetId)) return intakeAssetId;
    return intakeAssetOptions[0].id;
  }, [intakeAssetId, intakeAssetOptions]);

  function clearQueueSearchFilters() {
    setQueueSearch("");
    setQueueStatusFilter("all");
    setQueueDateFilter("all");
  }

  function queueRowKey(row: Pick<MaintenanceQueueRow, "assetType" | "id">) {
    return `${row.assetType}:${row.id}`;
  }

  async function quickScheduleToday(row: MaintenanceQueueRow) {
    if (row.status === "Closed") return;
    const key = queueRowKey(row);
    setQuickSchedulingKey(key);
    setInlineMessage(null);

    const assignedCandidate = (quickAssigneeByRequest[key] ?? "").trim();
    const payload: Record<string, string> = {
      scheduled_date: todayYYYYMMDD(),
    };
    if (assignedCandidate) {
      payload.assigned_to = assignedCandidate;
    }

    const res =
      row.assetType === "vehicle"
        ? await supabase.from("maintenance_requests").update(payload).eq("id", row.id)
        : await supabase.from("equipment_maintenance_requests").update(payload).eq("id", row.id);

    setQuickSchedulingKey(null);

    if (res.error) {
      setInlineMessage(res.error.message || "Failed to schedule request.");
      return;
    }

    if (assignedCandidate && assignedCandidate !== (row.assignedTo ?? "")) {
      void fetch("/api/maintenance/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assignment",
          assetType: row.assetType,
          requestId: row.id,
          previousAssigneeId: row.assignedTo,
          nextAssigneeId: assignedCandidate,
        }),
      });
    }

    setRequests((prev) =>
      prev.map((request) =>
        request.id === row.id && request.assetType === row.assetType
          ? {
              ...request,
              scheduledDate: payload.scheduled_date,
              assignedTo: payload.assigned_to ?? request.assignedTo,
              updatedAt: new Date().toISOString(),
            }
          : request
      )
    );
    setInlineMessage("Scheduled for today.");
  }

  function renderQueueCard(row: MaintenanceQueueRow, bucket: QueueBucket | null) {
    const key = queueRowKey(row);
    const openHref = queueHref(row.id, row.assetType);
    const scheduleHref = `/maintenance/schedule?focus=${encodeURIComponent(row.id)}`;
    const selectedAssigneeId = quickAssigneeByRequest[key] ?? "";
    const isClosed = row.status === "Closed";
    const isOverdue = isQueueRequestOverdue(row.scheduledDate, row.status);
    const schedulingDisabled = saving || quickSchedulingKey === key;
    const currentAssigneeLabel =
      assigneeOptions.find((opt) => opt.id === row.assignedTo)?.label ??
      (row.assignedTo ? row.assignedTo : "Unassigned");

    return (
      <div
        key={bucket ? `bucket-row:${bucket}:${key}` : `search-row:${key}`}
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 10,
          background: "rgba(255,255,255,0.02)",
          display: "grid",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800 }}>{row.title}</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {isOverdue ? <span style={overdueBadgeStyle()}>Overdue</span> : null}
            <span style={statusBadgeStyle(row.status)}>{row.status}</span>
          </div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.76 }}>
          {row.assetType === "vehicle" ? "Vehicle" : "Equipment"}: {row.assetName} • {row.assetId}
          {row.assetSubtitle ? ` • ${row.assetSubtitle}` : ""}
        </div>
        <div style={{ fontSize: 12, opacity: 0.72 }}>
          {row.requesterName} • {row.requestDate} • {row.urgency}
          {row.scheduledDate ? ` • Scheduled ${row.scheduledDate}` : ""}
          {row.assignedTo ? ` • Assigned ${currentAssigneeLabel}` : ""}
        </div>
        <div style={{ marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Link href={openHref} style={buttonStyle()}>
            Open
          </Link>
          {!isClosed && isManagementRole(role) ? (
            <>
              <select
                value={selectedAssigneeId}
                onChange={(event) =>
                  setQuickAssigneeByRequest((prev) => ({
                    ...prev,
                    [key]: event.target.value,
                  }))
                }
                style={{ ...inputStyle(), width: 220, padding: "8px 10px" }}
                disabled={schedulingDisabled}
              >
                <option value="">
                  {row.assignedTo ? `Keep assignee (${currentAssigneeLabel})` : "Keep assignee (Unassigned)"}
                </option>
                {assigneeOptions.map((option) => (
                  <option key={`${key}:assignee:${option.id}`} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                style={primaryButtonStyle()}
                disabled={schedulingDisabled}
                onClick={() => {
                  void quickScheduleToday(row);
                }}
              >
                {quickSchedulingKey === key ? "Scheduling..." : "Schedule Today"}
              </button>
              <Link href={scheduleHref} style={buttonStyle()}>
                Open in Schedule
              </Link>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  function renderQueueSection(bucket: QueueBucket, rows: MaintenanceQueueRow[]) {
    return (
      <section key={`bucket:${bucket}`} style={{ ...cardStyle(), padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontWeight: 900 }}>{rows.length}</div>
            <div style={{ fontWeight: 800 }}>{queueBucketLabel(bucket)}</div>
          </div>
          <span style={stageBadgeStyle(bucket)}>{queueBucketLabel(bucket)}</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.72 }}>No requests in this bucket.</div>
        ) : (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {rows.map((row) => renderQueueCard(row, bucket))}
          </div>
        )}
      </section>
    );
  }

  async function createMaintenanceRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!intakeTitle.trim()) {
      setInlineMessage("Title / reason is required.");
      return;
    }
    if (!effectiveIntakeAssetId.trim()) {
      setInlineMessage("Select an asset.");
      return;
    }

    setSaving(true);
    setInlineMessage(null);

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) {
      setSaving(false);
      setInlineMessage("Not authenticated.");
      return;
    }

    const requesterName = normalizeRequesterName(fullName, email);
    const description = buildDescriptionForIntake({
      title: intakeTitle,
      details: intakeDetails,
      requesterName,
      requestDate: todayYYYYMMDD(),
      linkedRequestId: intakeLinkedRequestId,
      linkedLogId: intakeLinkedLogId,
    });

    const basePayload = {
      submitted_by_user_id: userId,
      status: "Open" as MaintenanceRequestStatus,
      urgency: intakeUrgency,
      system_affected: intakeSystem,
      drivability: "Yes – Drivable",
      unit_status: "Active",
      issue_identified_during: "Other",
      description,
    };

    const insertRes =
      intakeAssetType === "vehicle"
        ? await supabase
            .from("maintenance_requests")
            .insert({ ...basePayload, vehicle_id: effectiveIntakeAssetId.trim() })
            .select("id")
            .single()
        : await supabase
            .from("equipment_maintenance_requests")
            .insert({ ...basePayload, equipment_id: effectiveIntakeAssetId.trim() })
            .select("id")
            .single();

    setSaving(false);

    if (insertRes.error || !insertRes.data?.id) {
      setInlineMessage(insertRes.error?.message || "Failed to create maintenance request.");
      return;
    }

    router.replace(queueHref(insertRes.data.id, intakeAssetType));
  }

  async function saveDetailEdits() {
    if (!selectedRequest) return;
    setSaving(true);
    setInlineMessage(null);

    const payload = {
      status: editableStatus,
      urgency: editableUrgency,
      system_affected: editableSystem,
    };

    const res =
      selectedRequest.assetType === "vehicle"
        ? await supabase.from("maintenance_requests").update(payload).eq("id", selectedRequest.id)
        : await supabase.from("equipment_maintenance_requests").update(payload).eq("id", selectedRequest.id);

    setSaving(false);

    if (res.error) {
      setInlineMessage(res.error.message || "Failed to update request.");
      return;
    }

    setInlineMessage("Request updated.");
    router.refresh();
  }

  async function transitionStatus(nextStatus: MaintenanceRequestStatus) {
    if (!selectedRequest) return;
    setSaving(true);
    setInlineMessage(null);

    const res =
      selectedRequest.assetType === "vehicle"
        ? await supabase.from("maintenance_requests").update({ status: nextStatus }).eq("id", selectedRequest.id)
        : await supabase
            .from("equipment_maintenance_requests")
            .update({ status: nextStatus })
            .eq("id", selectedRequest.id);

    setSaving(false);

    if (res.error) {
      setInlineMessage(res.error.message || "Failed updating request status.");
      return;
    }

    setEditableStatusOverride(nextStatus);
    setInlineMessage(`Status updated to ${nextStatus}.`);
    router.refresh();
  }

  async function deleteRequest() {
    if (!selectedRequest) return;
    if (!window.confirm("Delete this maintenance request? This cannot be undone.")) return;

    setSaving(true);
    setInlineMessage(null);

    const res = await fetch("/api/maintenance/requests/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        assetType: selectedRequest.assetType,
        requestIds: [selectedRequest.id],
      }),
    });

    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);

    if (!res.ok) {
      setInlineMessage(json.error || "Failed to delete request.");
      return;
    }

    router.replace("/maintenance");
  }

  const selectedBucket = selectedRequest ? bucketFromStatus(selectedRequest.status) : null;

  const stageTitle = selectedBucket
    ? selectedBucket === "needs_review"
      ? "Manager Review"
      : selectedBucket === "approved"
        ? "Approved / Ready"
        : selectedBucket === "in_progress"
          ? "In Progress"
          : "Completed"
    : "-";

  const statusActionAllowed = selectedRequest != null && selectedRequest.status !== "Closed";

  const canDelete = isMechanicOrHigher(role);

  const intakeContextLabel =
    effectiveIntakeAssetId && intakeAssetType
      ? `Linked to ${intakeAssetType === "vehicle" ? "Vehicle" : "Equipment"}`
      : "Blank Request";

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", paddingBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>
            {isQueuePage ? "Maintenance" : isNewPage ? "New Maintenance Request" : "Maintenance Request"}
          </h1>
          <div style={{ opacity: 0.74 }}>
            {isQueuePage
              ? "Queue-first triage and navigation for maintenance requests."
              : isNewPage
                ? "Fast intake for linked or blank maintenance requests."
                : "Request detail and stage workflow."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isQueuePage ? (
            <>
              <Link href="/maintenance/new" style={primaryButtonStyle()}>
                + New Request
              </Link>
              {isManagementRole(role) ? (
                <Link href="/maintenance/schedule" style={buttonStyle()}>
                  Schedule Board
                </Link>
              ) : null}
              <Link href="/maintenance/my-work" style={buttonStyle()}>
                My Work
              </Link>
              <Link href="/maintenance/operations" style={buttonStyle()}>
                Maintenance Operations Dashboard
              </Link>
            </>
          ) : (
            <Link href="/maintenance" style={buttonStyle()}>
              Back to Queue
            </Link>
          )}
        </div>
      </div>

      {loading ? <div style={{ marginTop: 14, ...cardStyle() }}>Loading maintenance data...</div> : null}
      {loadingError ? <div style={{ marginTop: 14, ...cardStyle(), color: "#ff9d9d" }}>{loadingError}</div> : null}
      {inlineMessage ? <div style={{ marginTop: 14, ...cardStyle(), padding: 12 }}>{inlineMessage}</div> : null}

      {!loading && !loadingError && isQueuePage ? (
        <section style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <div style={{ ...cardStyle(), padding: 14, display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "minmax(240px, 2fr) repeat(2, minmax(160px, 1fr)) auto" }}>
              <input
                placeholder="Search by request ID, title, asset, or requester"
                value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)}
                style={inputStyle()}
              />
              <select
                value={queueStatusFilter}
                onChange={(e) => setQueueStatusFilter(e.target.value as QueueStatusFilter)}
                style={inputStyle()}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={queueDateFilter}
                onChange={(e) => setQueueDateFilter(e.target.value as QueueDateFilter)}
                style={inputStyle()}
              >
                {DATE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button type="button" style={buttonStyle()} onClick={clearQueueSearchFilters}>
                Clear
              </button>
            </div>

            {!isSearchMode ? (
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                <div style={{ ...cardStyle(), padding: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.72 }}>Needs Review</div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{queueCounts.needs_review}</div>
                </div>
                <div style={{ ...cardStyle(), padding: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.72 }}>Approved</div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{queueCounts.approved}</div>
                </div>
                <div style={{ ...cardStyle(), padding: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.72 }}>In Progress</div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{queueCounts.in_progress}</div>
                </div>
                <div style={{ ...cardStyle(), padding: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.72 }}>Completed</div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{queueCounts.completed}</div>
                </div>
              </div>
            ) : null}
          </div>

          {isSearchMode ? (
            <section style={{ ...cardStyle(), padding: 14 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>
                Results ({filteredQueueRows.length})
              </div>
              {filteredQueueRows.length === 0 ? (
                <div style={{ fontSize: 13, opacity: 0.72 }}>No maintenance requests match this search/filter set.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {filteredQueueRows.map((row) => renderQueueCard(row, null))}
                </div>
              )}
            </section>
          ) : (
            <>
              {renderQueueSection("needs_review", queueGroups.needs_review)}
              {renderQueueSection("approved", queueGroups.approved)}
              {renderQueueSection("in_progress", queueGroups.in_progress)}
              {renderQueueSection("completed", queueGroups.completed)}
            </>
          )}
        </section>
      ) : null}

      {!loading && !loadingError && isNewPage ? (
        <form onSubmit={createMaintenanceRequest} style={{ marginTop: 14, display: "grid", gap: 12 }}>
          <section style={cardStyle()}>
            <div style={{ fontWeight: 900 }}>Request Context</div>
            <div style={{ marginTop: 8, display: "inline-flex", padding: "4px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", fontSize: 12, fontWeight: 800 }}>
              {intakeContextLabel}
            </div>
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              Requester: {normalizeRequesterName(fullName, email)}
            </div>
          </section>

          <section style={cardStyle()}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Request Basics</div>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Asset Type</span>
                <select value={intakeAssetType} onChange={(e) => setIntakeAssetType(e.target.value as AssetType)} style={inputStyle()}>
                  <option value="vehicle">Vehicle</option>
                  <option value="equipment">Equipment</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Asset</span>
                <select value={effectiveIntakeAssetId} onChange={(e) => setIntakeAssetId(e.target.value)} style={inputStyle()}>
                  {intakeAssetOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Urgency</span>
                <select value={intakeUrgency} onChange={(e) => setIntakeUrgency(e.target.value as Urgency)} style={inputStyle()}>
                  {URGENCY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>System Affected</span>
                <select value={intakeSystem} onChange={(e) => setIntakeSystem(e.target.value as SystemAffected)} style={inputStyle()}>
                  {SYSTEM_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label style={{ display: "grid", gap: 6, marginTop: 10 }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>Reason / Title</span>
              <input value={intakeTitle} onChange={(e) => setIntakeTitle(e.target.value)} style={inputStyle()} placeholder="Example: Battery keeps draining overnight" />
            </label>
            <label style={{ display: "grid", gap: 6, marginTop: 10 }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>Details</span>
              <textarea value={intakeDetails} onChange={(e) => setIntakeDetails(e.target.value)} style={{ ...inputStyle(), minHeight: 120, resize: "vertical" }} placeholder="Describe what was observed, symptoms, and context." />
            </label>
          </section>

          <section style={cardStyle()}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Optional Linking</div>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Linked Maintenance Request ID (optional)</span>
                <input value={intakeLinkedRequestId} onChange={(e) => setIntakeLinkedRequestId(e.target.value)} style={inputStyle()} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Linked Maintenance Log ID (optional)</span>
                <input value={intakeLinkedLogId} onChange={(e) => setIntakeLinkedLogId(e.target.value)} style={inputStyle()} />
              </label>
            </div>
          </section>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" style={primaryButtonStyle()} disabled={saving}>
              {saving ? "Submitting..." : "Submit Request"}
            </button>
            <Link href="/maintenance" style={buttonStyle()}>
              Cancel
            </Link>
          </div>
        </form>
      ) : null}

      {!loading && !loadingError && isDetailPage ? (
        selectedRequest ? (
          <section style={{ marginTop: 14, display: "grid", gap: 12 }}>
            <section style={cardStyle()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>{selectedRequest.title}</div>
                  <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                    {selectedRequest.assetType === "vehicle" ? "Vehicle" : "Equipment"}: {selectedRequest.assetName} • {selectedRequest.assetId}
                    {selectedRequest.assetSubtitle ? ` • ${selectedRequest.assetSubtitle}` : ""}
                  </div>
                </div>
                <span style={statusBadgeStyle(selectedRequest.status)}>{selectedRequest.status}</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                Request ID: {selectedRequest.id} • Request Date: {selectedRequest.requestDate} • Created: {fmtDateTime(selectedRequest.createdAt)}
              </div>
            </section>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)", alignItems: "start" }}>
              <div style={{ display: "grid", gap: 12 }}>
                <section style={cardStyle()}>
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>Request Overview</div>
                  <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, opacity: 0.75 }}>Status</span>
                      <select
                        value={editableStatus}
                        onChange={(e) => setEditableStatusOverride(e.target.value as MaintenanceRequestStatus)}
                        style={inputStyle()}
                      >
                        {REQUEST_STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, opacity: 0.75 }}>Urgency</span>
                      <select
                        value={editableUrgency}
                        onChange={(e) => setEditableUrgencyOverride(e.target.value as Urgency)}
                        style={inputStyle()}
                      >
                        {URGENCY_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, opacity: 0.75 }}>System Affected</span>
                      <select
                        value={editableSystem}
                        onChange={(e) => setEditableSystemOverride(e.target.value as SystemAffected)}
                        style={inputStyle()}
                      >
                        {SYSTEM_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" style={primaryButtonStyle()} onClick={saveDetailEdits} disabled={saving}>
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                    <Link href={requestEditHref(selectedRequest)} style={buttonStyle()}>
                      Open Full Edit Form
                    </Link>
                  </div>
                </section>

                <section style={cardStyle()}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Reported Details</div>
                  <div style={{ fontSize: 13, opacity: 0.76, marginBottom: 8 }}>
                    Requester: {selectedRequest.requesterName} • Drivability: {selectedRequest.drivability}
                  </div>
                  <div
                    style={{
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 12,
                      padding: 12,
                      background: "rgba(255,255,255,0.02)",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.4,
                    }}
                  >
                    {selectedRequest.details || "No additional details provided."}
                  </div>
                </section>
              </div>

              <aside style={{ ...cardStyle(), position: "sticky", top: 84 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Workflow</div>
                <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 6 }}>Current Stage</div>
                <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 12 }}>{stageTitle}</div>

                <div style={{ display: "grid", gap: 8 }}>
                  {selectedBucket === "needs_review" ? (
                    <button
                      type="button"
                      style={primaryButtonStyle()}
                      onClick={() => void transitionStatus("Scheduled")}
                      disabled={saving || !statusActionAllowed}
                    >
                      Set Scheduled
                    </button>
                  ) : null}

                  {selectedBucket === "approved" ? (
                    <button
                      type="button"
                      style={primaryButtonStyle()}
                      onClick={() => void transitionStatus("In Progress")}
                      disabled={saving || !statusActionAllowed}
                    >
                      Start Work
                    </button>
                  ) : null}

                  {selectedBucket === "in_progress" ? (
                    <>
                      <button
                        type="button"
                        style={buttonStyle()}
                        onClick={() => void transitionStatus("Waiting on Parts")}
                        disabled={saving || !statusActionAllowed}
                      >
                        Mark Waiting on Parts
                      </button>
                      <button
                        type="button"
                        style={primaryButtonStyle()}
                        onClick={() => void transitionStatus("Closed")}
                        disabled={saving || !statusActionAllowed}
                      >
                        Mark Closed
                      </button>
                    </>
                  ) : null}

                  {selectedBucket === "completed" ? (
                    <div style={{ fontSize: 12, opacity: 0.75 }}>This request is completed. No further stage actions are available.</div>
                  ) : null}
                </div>

                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)", display: "grid", gap: 8 }}>
                  <Link href={requestLogHref(selectedRequest)} style={buttonStyle()}>
                    Create Maintenance Log
                  </Link>
                  <Link href={assetDetailHref(selectedRequest)} style={buttonStyle()}>
                    Open Asset
                  </Link>
                  {canDelete ? (
                    <button type="button" style={dangerButtonStyle()} onClick={() => void deleteRequest()} disabled={saving}>
                      Delete Request
                    </button>
                  ) : null}
                </div>
              </aside>
            </div>
          </section>
        ) : (
          <section style={{ marginTop: 14, ...cardStyle() }}>
            Maintenance request not found. <Link href="/maintenance">Return to queue</Link>.
          </section>
        )
      ) : null}
    </main>
  );
}
