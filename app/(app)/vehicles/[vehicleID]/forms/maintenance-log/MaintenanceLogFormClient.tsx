"use client";

import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { loadVehicleContext } from "@/lib/assetContext";
import { syncVehicleMileageForward } from "@/lib/assetReadings";
import { writeAudit } from "@/lib/audit";
import {
  confirmLeaveForm,
  requestFormDraftClear,
  UnsavedChangesBanner,
  useFormExitGuard,
  useUnsavedChangesState,
} from "@/lib/forms";
import {
  coerceMaintenanceRequestStatus,
  type MaintenanceRequestStatus,
} from "@/lib/maintenanceStatus";
import { readRoleViewOverride, resolveEffectiveRole, type AppRole } from "@/lib/roleView";

/* =========================
   Types (aligned with request)
========================= */

type RequestStatus = MaintenanceRequestStatus;
type Urgency = "Low" | "Medium" | "High" | "Urgent";
type DrivabilityStatus =
  | "Yes – Drivable"
  | "Limited – Operate with caution"
  | "No – Out of Service";
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

type MaintenanceRequestRecord = {
  id: string;
  vehicleId: string;

  createdAt: string; // ISO
  requestDate: string; // yyyy-mm-dd

  employee: string;

  drivabilityStatus: DrivabilityStatus;
  systemAffected: SystemAffected;
  urgency: Urgency;

  title: string;
  description: string;

  status: RequestStatus;

  // new fields we’ll start using
  maintenanceLogId?: string;
  closedAt?: string;

  // optional future: photos?: Attachment[]
};

type MaintenanceRequestRow = {
  id: string;
  vehicle_id: string;
  created_at: string;
  status: string | null;
  urgency: string | null;
  system_affected: string | null;
  drivability: string | null;
  description: string | null;
};

type PurchaseLinkedSummary = {
  id: string;
  overall_status: string;
  ap_payment_method: string | null;
  ap_payment_method_other: string | null;
  ap_po_number: string | null;
  funds_available_date: string | null;
};

type PurchaseLinkedItem = {
  id: string;
  item_name: string;
  ap_decision: string;
  approved_payment_method: string | null;
  approved_payment_method_other: string | null;
  approved_po_number: string | null;
  funds_available_date: string | null;
};

type PurchaseLinkedResponse = {
  requests?: PurchaseLinkedSummary[];
  itemsByRequestId?: Record<string, PurchaseLinkedItem[]>;
  error?: string;
};

type MaintenanceLogStatus =
  | Exclude<MaintenanceRequestStatus, "Open">
  | "Purchase Request Pending"
  | "Purchase Request Approved";
type Role = AppRole;
type VehicleType = "truck" | "car" | "skidsteer" | "loader";

const MAINTENANCE_LOG_STATUS_OPTIONS: MaintenanceLogStatus[] = [
  "Pending Approval",
  "Scheduled",
  "In Progress",
  "Purchase Request Pending",
  "Purchase Request Approved",
  "Waiting on Parts",
  "External Repair",
  "On Hold",
  "Closed",
];

type InventoryItem = {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  location_id: string | null;
};

type InventoryLocation = {
  id: string;
  name: string;
};

type PartUsed = {
  item_id: string;
  name: string;
  quantity_used: number;
  from_location_id: string | null;
};

function canManagePartsUsage(role: Role | null) {
  return role === "owner" || role === "operations_manager" || role === "office_admin" || role === "mechanic";
}

function canQuickLogOverride(role: Role | null) {
  return role === "owner" || role === "operations_manager" || role === "office_admin" || role === "mechanic";
}

function canEditManagedForms(role: Role | null) {
  return role === "owner" || role === "operations_manager" || role === "office_admin" || role === "mechanic";
}

function isVehicleType(value: string | null | undefined): value is VehicleType {
  return value === "truck" || value === "car" || value === "skidsteer" || value === "loader";
}

function isHoursBasedVehicleType(value: VehicleType) {
  return value === "skidsteer" || value === "loader";
}

/* =========================
   Keys
========================= */


function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseTitleFromDescription(raw: string | null) {
  if (!raw) return "";
  const lines = raw.split("\n");
  const first = (lines[0] ?? "").trim();
  if (first.startsWith("Title:")) {
    return first.slice("Title:".length).trim();
  }
  return "";
}

function parseBodyFromDescription(raw: string | null) {
  if (!raw) return "";
  const lines = raw.split("\n");
  if (lines.length <= 2) return raw.trim();
  return lines.slice(2).join("\n").trim();
}

function parseFieldValue(raw: string | null, field: string) {
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

function coerceMaintenanceLogStatus(
  value: unknown,
  fallback: MaintenanceLogStatus = "In Progress"
): MaintenanceLogStatus {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return MAINTENANCE_LOG_STATUS_OPTIONS.includes(normalized as MaintenanceLogStatus)
    ? (normalized as MaintenanceLogStatus)
    : fallback;
}

function mapLogStatusToRequestStatus(status: MaintenanceLogStatus): Exclude<MaintenanceRequestStatus, "Open"> {
  if (status === "Purchase Request Pending" || status === "Purchase Request Approved") {
    return "Waiting on Parts";
  }
  return status as Exclude<MaintenanceRequestStatus, "Open">;
}

/* =========================
   Page
========================= */

export default function MaintenanceLogPage() {
  const router = useRouter();
  const { isDirty } = useUnsavedChangesState();
  useFormExitGuard(isDirty);
  const params = useParams<{ vehicleID?: string }>();
  const sp = useSearchParams();

  const vehicleId = params?.vehicleID ? decodeURIComponent(params.vehicleID) : "";
  const queryRequestId = sp?.get("requestId") ? decodeURIComponent(sp.get("requestId")!) : "";
  const editId = sp?.get("editId") ? decodeURIComponent(sp.get("editId")!) : "";
  const rawReturnTo = (sp?.get("returnTo") || "").trim();
  const returnTo = rawReturnTo.startsWith("/") ? rawReturnTo : "";
  const isEditMode = editId.length > 0;

  const [title, setTitle] = useState("");
  const [mileage, setMileage] = useState("");
  const [status, setStatus] = useState<MaintenanceLogStatus | "">("");
  const [mechanicSelfScore, setMechanicSelfScore] = useState("");
  const [notes, setNotes] = useState("");
  const [serviceDate, setServiceDate] = useState(todayYYYYMMDD());

  // preventative
  const [nextDueMileage, setNextDueMileage] = useState("");
  const [resetOilLife, setResetOilLife] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryLocations, setInventoryLocations] = useState<InventoryLocation[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [partSearch, setPartSearch] = useState("");
  const [selectedPartId, setSelectedPartId] = useState("");
  const [selectedPartQty, setSelectedPartQty] = useState("1");
  const [partsUsed, setPartsUsed] = useState<PartUsed[]>([]);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [useQuickLogOverride, setUseQuickLogOverride] = useState(false);
  const [linkedRequestId, setLinkedRequestId] = useState(queryRequestId);
  const [vehicleType, setVehicleType] = useState<VehicleType>("truck");
  const [linkedPurchases, setLinkedPurchases] = useState<PurchaseLinkedSummary[]>([]);
  const [linkedPurchaseItems, setLinkedPurchaseItems] = useState<Record<string, PurchaseLinkedItem[]>>({});
  const [linkedPurchasesLoading, setLinkedPurchasesLoading] = useState(false);
  const [linkedPurchasesError, setLinkedPurchasesError] = useState<string | null>(null);

  const [linkedRequest, setLinkedRequest] = useState<MaintenanceRequestRecord | null>(null);
  const [currentVehicleMileage, setCurrentVehicleMileage] = useState<number | null>(null);
  const usesHours = isHoursBasedVehicleType(vehicleType);
  const readingLabel = usesHours ? "Hours" : "Mileage";
  const nextDueLabel = usesHours ? "Next Due Hours" : "Next Due Mileage";
  const canSubmitPartsUsage = canManagePartsUsage(userRole);
  const canUseQuickOverride = canQuickLogOverride(userRole);
  const canEditExistingManagedForms = canEditManagedForms(userRole);
  const purchaseReturnTo = useMemo(() => {
    const q = new URLSearchParams();
    if (linkedRequestId) q.set("requestId", linkedRequestId);
    if (editId) q.set("editId", editId);
    return `/vehicles/${encodeURIComponent(vehicleId)}/forms/maintenance-log${
      q.toString() ? `?${q.toString()}` : ""
    }`;
  }, [editId, linkedRequestId, vehicleId]);
  const purchaseLinkHref = useMemo(() => {
    const q = new URLSearchParams();
    q.set("assetType", "vehicle");
    q.set("assetId", vehicleId);
    if (linkedRequestId) {
      q.set("maintenanceRequestType", "vehicle");
      q.set("maintenanceRequestId", linkedRequestId);
    }
    if (editId) {
      q.set("maintenanceLogType", "vehicle");
      q.set("maintenanceLogId", editId);
    }
    q.set("returnTo", purchaseReturnTo);
    return `/purchases?${q.toString()}`;
  }, [editId, linkedRequestId, purchaseReturnTo, vehicleId]);

  useEffect(() => {
    if (!vehicleId) return;
    let active = true;

    void (async () => {
      const supabase = createSupabaseBrowser();

      const { data: vehicleRow, error: vehicleErr } = await loadVehicleContext(supabase, vehicleId);
      if (!active) return;
      if (!vehicleErr) {
        if (isVehicleType(vehicleRow?.type ?? null)) {
          setVehicleType(vehicleRow?.type as VehicleType);
        } else {
          setVehicleType("truck");
        }
        const m = Number(vehicleRow?.mileage);
        if (Number.isFinite(m) && m > 0) {
          setCurrentVehicleMileage(m);
          setMileage((prev) => (prev.trim() ? prev : String(m)));
        }
      }

      if (isEditMode) {
        const { data: logRow, error: logError } = await supabase
          .from("maintenance_logs")
          .select("id,created_at,vehicle_id,request_id,mileage,status_update,mechanic_self_score,notes")
          .eq("id", editId)
          .eq("vehicle_id", vehicleId)
          .maybeSingle();
        if (!active) return;
        if (logError || !logRow) {
          console.error("Failed loading maintenance log for edit:", logError);
          return;
        }

        const parsedTitle = parseFieldValue(logRow.notes, "Title");
        const parsedServiceDate = parseFieldValue(logRow.notes, "Service Date");
        const parsedNextDueMileage = parseFieldValue(logRow.notes, "Next Due Mileage");
        const parsedNextDueHours = parseFieldValue(logRow.notes, "Next Due Hours");
        const parsedResetOilLife = parseFieldValue(logRow.notes, "Reset Oil Life");

        setLinkedRequestId(logRow.request_id ?? "");
        setTitle(parsedTitle || "Maintenance Log");
        setMileage(Number.isFinite(Number(logRow.mileage)) ? String(logRow.mileage) : "");
        setStatus(coerceMaintenanceLogStatus(logRow.status_update, "In Progress"));
        setMechanicSelfScore(
          Number.isFinite(Number(logRow.mechanic_self_score)) ? String(logRow.mechanic_self_score) : ""
        );
        setNotes(logRow.notes ?? "");
        if (/^\d{4}-\d{2}-\d{2}$/.test(parsedServiceDate)) {
          setServiceDate(parsedServiceDate);
        } else if (typeof logRow.created_at === "string" && /^\d{4}-\d{2}-\d{2}/.test(logRow.created_at)) {
          setServiceDate(logRow.created_at.slice(0, 10));
        }
        setNextDueMileage(parsedNextDueMileage || parsedNextDueHours);
        setResetOilLife(parsedResetOilLife.toLowerCase() === "yes");
      } else if (queryRequestId) {
        const [requestRes, existingLogRes] = await Promise.all([
          supabase
            .from("maintenance_requests")
            .select("id,vehicle_id,created_at,status,urgency,system_affected,drivability,description")
            .eq("id", queryRequestId)
            .eq("vehicle_id", vehicleId)
            .maybeSingle(),
          supabase
            .from("maintenance_logs")
            .select("id")
            .eq("request_id", queryRequestId)
            .limit(1),
        ]);
        if (!active) return;

        if (requestRes.error) {
          console.error("Failed loading linked maintenance request:", requestRes.error);
        }

        const reqRow = requestRes.data as MaintenanceRequestRow | null;
        const req = reqRow
          ? ({
              id: reqRow.id,
              vehicleId: reqRow.vehicle_id,
              createdAt: reqRow.created_at,
              requestDate: reqRow.created_at.slice(0, 10),
              employee: "",
              drivabilityStatus: (reqRow.drivability as DrivabilityStatus) || "Yes – Drivable",
              systemAffected: (reqRow.system_affected as SystemAffected) || "Other",
              urgency: (reqRow.urgency as Urgency) || "Low",
              title: parseTitleFromDescription(reqRow.description),
              description: parseBodyFromDescription(reqRow.description),
              status:
                coerceMaintenanceRequestStatus(reqRow.status, "Open"),
            } as MaintenanceRequestRecord)
          : null;
        setLinkedRequest(req);

        const hasExistingLog = (existingLogRes.data ?? []).length > 0;
        if (hasExistingLog) {
          alert("This request already has a maintenance log. Opening the vehicle instead.");
          router.replace(`/vehicles/${encodeURIComponent(vehicleId)}`);
          return;
        }

        if (req) {
          setTitle((prev) => (prev.trim() ? prev : req.title));
          setNotes((prev) =>
            prev.trim()
              ? prev
              : [
                  `From Request (${req.id})`,
                  `Urgency: ${req.urgency}`,
                  `System: ${req.systemAffected}`,
                  `Drivability: ${req.drivabilityStatus}`,
                  "",
                  "Issue Description:",
                  req.description,
                ].join("\n")
          );
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [editId, isEditMode, queryRequestId, router, vehicleId]);

  useEffect(() => {
    if (!vehicleId || !linkedRequestId) return;
    let active = true;

    void (async () => {
      const supabase = createSupabaseBrowser();
      const { data, error } = await supabase
        .from("maintenance_requests")
        .select("id,vehicle_id,created_at,status,urgency,system_affected,drivability,description")
        .eq("id", linkedRequestId)
        .eq("vehicle_id", vehicleId)
        .maybeSingle();
      if (!active) return;
      if (error || !data) {
        if (error) {
          console.error("Failed loading linked maintenance request:", error);
        }
        setLinkedRequest(null);
        return;
      }

      const reqRow = data as MaintenanceRequestRow;
      setLinkedRequest({
        id: reqRow.id,
        vehicleId: reqRow.vehicle_id,
        createdAt: reqRow.created_at,
        requestDate: reqRow.created_at.slice(0, 10),
        employee: "",
        drivabilityStatus: (reqRow.drivability as DrivabilityStatus) || "Yes – Drivable",
        systemAffected: (reqRow.system_affected as SystemAffected) || "Other",
        urgency: (reqRow.urgency as Urgency) || "Low",
        title: parseTitleFromDescription(reqRow.description),
        description: parseBodyFromDescription(reqRow.description),
        status:
          coerceMaintenanceRequestStatus(reqRow.status, "Open"),
      });
    })();

    return () => {
      active = false;
    };
  }, [linkedRequestId, vehicleId]);

  useEffect(() => {
    const maintenanceRequestId = linkedRequestId.trim();
    const maintenanceLogId = editId.trim();
    if (!maintenanceRequestId && !maintenanceLogId) {
      const clearTimer = window.setTimeout(() => {
        setLinkedPurchases([]);
        setLinkedPurchaseItems({});
        setLinkedPurchasesError(null);
        setLinkedPurchasesLoading(false);
      }, 0);
      return () => window.clearTimeout(clearTimer);
    }

    let active = true;
    void (async () => {
      setLinkedPurchasesLoading(true);
      setLinkedPurchasesError(null);

      const params = new URLSearchParams();
      if (maintenanceRequestId) {
        params.set("maintenanceRequestType", "vehicle");
        params.set("maintenanceRequestId", maintenanceRequestId);
      }
      if (maintenanceLogId) {
        params.set("maintenanceLogType", "vehicle");
        params.set("maintenanceLogId", maintenanceLogId);
      }
      params.set("limit", "50");

      const res = await fetch(`/api/purchases?${params.toString()}`, { method: "GET" });
      const json = (await res.json().catch(() => ({}))) as PurchaseLinkedResponse;
      if (!active) return;
      if (!res.ok) {
        setLinkedPurchases([]);
        setLinkedPurchaseItems({});
        setLinkedPurchasesError(json.error || "Failed to load linked purchases.");
        setLinkedPurchasesLoading(false);
        return;
      }

      setLinkedPurchases(Array.isArray(json.requests) ? json.requests : []);
      setLinkedPurchaseItems(json.itemsByRequestId ?? {});
      setLinkedPurchasesError(null);
      setLinkedPurchasesLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [linkedRequestId, editId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const supabase = createSupabaseBrowser();
        const { data: authData } = await supabase.auth.getUser();
        if (!authData.user) {
          setUserRole("employee");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authData.user.id)
          .maybeSingle();

        setUserRole(
          resolveEffectiveRole(
            (profile?.role as Role | undefined) ?? "employee",
            readRoleViewOverride()
          ) as Role
        );
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!canSubmitPartsUsage) return;

    const timer = window.setTimeout(() => {
      void (async () => {
        setInventoryLoading(true);
        setInventoryError(null);

        const supabase = createSupabaseBrowser();
        const [itemsRes, locationsRes] = await Promise.all([
          supabase
            .from("inventory_items")
            .select("id,name,category,quantity,location_id")
            .eq("is_active", true)
            .order("name", { ascending: true }),
          supabase.from("inventory_locations").select("id,name").order("name", { ascending: true }),
        ]);

        if (itemsRes.error || locationsRes.error) {
          console.error("[maintenance-log] failed to load inventory data:", {
            itemsError: itemsRes.error,
            locationsError: locationsRes.error,
          });
          setInventoryError(
            itemsRes.error?.message || locationsRes.error?.message || "Failed to load inventory."
          );
          setInventoryItems([]);
          setInventoryLocations([]);
          setInventoryLoading(false);
          return;
        }

        setInventoryItems((itemsRes.data ?? []) as InventoryItem[]);
        setInventoryLocations((locationsRes.data ?? []) as InventoryLocation[]);
        setInventoryLoading(false);
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [canSubmitPartsUsage]);

  const filteredInventoryItems = useMemo(() => {
    const q = partSearch.trim().toLowerCase();
    const usedIds = new Set(partsUsed.map((p) => p.item_id));
    const available = inventoryItems.filter((item) => !usedIds.has(item.id));
    if (!q) return available;
    return available.filter((item) =>
      [item.name, item.category ?? "", item.id].join(" ").toLowerCase().includes(q)
    );
  }, [inventoryItems, partSearch, partsUsed]);

  function addPartUsed() {
    if (!selectedPartId) return;
    const qty = Math.trunc(Number(selectedPartQty));
    if (!Number.isFinite(qty) || qty <= 0) {
      alert("Enter a valid quantity used.");
      return;
    }

    const selected = inventoryItems.find((item) => item.id === selectedPartId);
    if (!selected) return;
    if (qty > selected.quantity) {
      alert(`Qty Used (${qty}) cannot exceed available quantity (${selected.quantity}).`);
      return;
    }

    setPartsUsed((prev) => [
      ...prev,
      {
        item_id: selected.id,
        name: selected.name,
        quantity_used: qty,
        from_location_id: selected.location_id ?? null,
      },
    ]);
    setSelectedPartId("");
    setSelectedPartQty("1");
  }

  function removePartUsed(itemId: string) {
    setPartsUsed((prev) => prev.filter((p) => p.item_id !== itemId));
  }

  function updatePartFromLocation(itemId: string, fromLocationId: string) {
    setPartsUsed((prev) =>
      prev.map((part) =>
        part.item_id === itemId
          ? { ...part, from_location_id: fromLocationId || null }
          : part
      )
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!vehicleId) return alert("Missing vehicle ID in the URL.");
    if (userRole === "apprentice") {
      return alert("Apprentice role cannot submit maintenance logs.");
    }
    if (isEditMode && userRole === null) {
      return alert("Loading permissions. Please try again.");
    }
    if (isEditMode && userRole !== null && !canEditExistingManagedForms) {
      return alert("Only mechanic and higher roles can edit maintenance logs.");
    }

    const m = Number(mileage);
    const effectiveRequestId = linkedRequestId.trim();
    if (!title.trim()) return alert("Please enter a title (what was done).");
    if (!Number.isFinite(m) || m <= 0) return alert(`Please enter valid ${readingLabel.toLowerCase()}.`);
    if (!status) return alert("Please select a status.");
    if (!isEditMode && !effectiveRequestId && !useQuickLogOverride) {
      return alert("Link this log to a maintenance request, or enable Quick Maintenance Log Override.");
    }
    if (!isEditMode && !effectiveRequestId && useQuickLogOverride && !canUseQuickOverride) {
      return alert("You do not have permission to create a quick maintenance log.");
    }

    if (currentVehicleMileage != null && m < currentVehicleMileage) {
      return alert(
        `${readingLabel} cannot be less than the current stored value (${currentVehicleMileage}).`
      );
    }

    const canSetMechanicSelfScore = userRole === "mechanic";
    const parsedMechanicSelfScore =
      canSetMechanicSelfScore && mechanicSelfScore.trim() ? Number(mechanicSelfScore) : null;
    if (
      canSetMechanicSelfScore &&
      parsedMechanicSelfScore != null &&
      (!Number.isFinite(parsedMechanicSelfScore) || parsedMechanicSelfScore < 0 || parsedMechanicSelfScore > 100)
    ) {
      return alert("Mechanic Self Score must be a number between 0 and 100.");
    }
    const mechanicSelfScorePatch = canSetMechanicSelfScore
      ? { mechanic_self_score: parsedMechanicSelfScore }
      : {};

    const notesValue = notes.trim()
      ? notes.trim()
      : [
          `Title: ${title.trim()}`,
          serviceDate ? `Service Date: ${serviceDate}` : "",
          nextDueMileage.trim() ? `${nextDueLabel}: ${nextDueMileage.trim()}` : "",
          resetOilLife ? "Reset Oil Life: Yes" : "",
        ]
          .filter(Boolean)
          .join("\n");

    const supabase = createSupabaseBrowser();
    const { data: authSnapshot } = await supabase.auth.getUser();
    const currentUserId = authSnapshot.user?.id ?? null;
    let savedLogId = editId;
    let error: { message: string } | null = null;

    if (isEditMode) {
      const { data: updatedLog, error: updateError } = await supabase
        .from("maintenance_logs")
        .update({
          request_id: effectiveRequestId || null,
          ...mechanicSelfScorePatch,
          mileage: m,
          notes: notesValue,
          status_update: status,
        })
        .eq("id", editId)
        .eq("vehicle_id", vehicleId)
        .select("id")
        .maybeSingle();
      error = updateError;
      savedLogId = updatedLog?.id ?? editId;
    } else {
      const { data: insertedLog, error: insertError } = await supabase
        .from("maintenance_logs")
        .insert({
          vehicle_id: vehicleId,
          submitted_by_user_id: currentUserId,
          request_id: effectiveRequestId || null,
          ...mechanicSelfScorePatch,
          mileage: m,
          notes: notesValue,
          status_update: status,
        })
        .select("id")
        .single();
      error = insertError;
      savedLogId = insertedLog?.id ?? "";
    }

    if (error) {
      console.error("Maintenance log save failed:", error);
      setSubmitError(error.message);
      return;
    }

    if (effectiveRequestId) {
      const linkedRequestStatus = mapLogStatusToRequestStatus(status);
      const { error: requestUpdateError } = await supabase
        .from("maintenance_requests")
        .update({
          status: linkedRequestStatus,
        })
        .eq("id", effectiveRequestId);

      if (requestUpdateError) {
        console.error("Maintenance request status update failed:", requestUpdateError);
      }
    }

    if (partsUsed.length > 0) {
      if (!canSubmitPartsUsage) {
        setSubmitError("You do not have permission to submit parts usage.");
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        console.error("Failed to resolve auth user for inventory usage logs:", authError);
        setSubmitError("Maintenance log saved, but failed to apply parts usage (missing auth user).");
        return;
      }

      for (const part of partsUsed) {
        const qty = Math.trunc(Number(part.quantity_used));
        if (!Number.isFinite(qty) || qty <= 0) {
          setSubmitError(`Invalid Qty Used for ${part.name}.`);
          return;
        }
        const matchedItem = inventoryItems.find((item) => item.id === part.item_id);
        if (matchedItem && qty > matchedItem.quantity) {
          setSubmitError(
            `Qty Used for ${part.name} exceeds available quantity (${matchedItem.quantity}).`
          );
          return;
        }
      }

      const txPayload = partsUsed.map((part) => ({
        item_id: part.item_id,
        from_location_id: part.from_location_id ?? null,
        to_location_id: null,
        change_qty: -Math.abs(part.quantity_used),
        reason: "usage",
        reference_type: "maintenance_log",
        reference_id: savedLogId,
        notes: null,
        created_by: authData.user.id,
      }));

      const { error: txError } = await supabase.from("inventory_transactions").insert(txPayload);
      if (txError) {
        console.error("Inventory usage insert failed:", txError);
        if (
          txError.message.toLowerCase().includes("below 0") ||
          txError.message.toLowerCase().includes("cannot go below")
        ) {
          setSubmitError(
            "Not enough inventory quantity for one or more selected parts. Reduce Qty Used and try again."
          );
          return;
        }
        setSubmitError(
          `Maintenance log saved, but failed to record parts used: ${txError.message}`
        );
        return;
      }

      await writeAudit({
        action: "inventory_usage",
        table_name: "inventory_transactions",
        meta: {
          maintenance_log_id: savedLogId,
          items: partsUsed.map((part) => ({
            item_id: part.item_id,
            qty: part.quantity_used,
          })),
        },
      });
    }

    const vehicleMileageSync = await syncVehicleMileageForward({
      supabase,
      vehicleId,
      mileage: m,
    });
    if (!vehicleMileageSync.ok) {
      console.error("Vehicle mileage sync error:", vehicleMileageSync.message);
    }

    requestFormDraftClear();
    router.replace(returnTo || `/vehicles/${encodeURIComponent(vehicleId)}`);
  }

  if (isEditMode && userRole !== null && !canEditExistingManagedForms) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
        <h1 style={{ marginBottom: 6 }}>Maintenance Log</h1>
        <div style={{ marginTop: 12, ...cardStyle, color: "#ffb3b3" }}>
          Only mechanic and higher roles can edit existing maintenance logs.
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => router.replace(`/vehicles/${encodeURIComponent(vehicleId)}`)} style={secondaryButtonStyle}>
            Back to Vehicle
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>{isEditMode ? "Edit Maintenance Log" : "Maintenance Log"}</h1>
      <div style={{ opacity: 0.75, lineHeight: 1.4 }}>
        Vehicle ID: <strong>{vehicleId || "(missing)"}</strong>
        {linkedRequestId ? (
          <>
            {" "}
            • Linked Request: <strong>{linkedRequestId}</strong>
          </>
        ) : null}
      </div>

      {linkedRequestId && !linkedRequest ? (
        <div style={{ marginTop: 12, ...cardStyle, opacity: 0.9 }}>
          Could not find the linked request for this vehicle. You can still log manually.
        </div>
      ) : null}

      {!isEditMode && !linkedRequestId ? (
        <div style={{ marginTop: 12, ...cardStyle, opacity: 0.92 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            No linked maintenance request
          </div>
          <div style={{ opacity: 0.75, marginBottom: 10 }}>
            Standard workflow links logs to a maintenance request first.
          </div>
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={useQuickLogOverride}
              disabled={!canUseQuickOverride}
              onChange={(e) => setUseQuickLogOverride(e.target.checked)}
            />
            <span style={{ opacity: canUseQuickOverride ? 0.9 : 0.7 }}>
              Quick Maintenance Log Override (mechanic/admin only)
            </span>
          </label>
        </div>
      ) : null}

      {submitError ? (
        <div style={{ marginTop: 12, ...cardStyle, opacity: 0.95, color: "#ff9d9d" }}>
          Failed to save maintenance log: {submitError}
        </div>
      ) : null}

      <UnsavedChangesBanner isDirty={isDirty} />
      <form onSubmit={onSubmit} style={{ marginTop: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Service</div>

          <div style={gridStyle}>
            <Field label="Service Date *">
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label={`${readingLabel} *`}>
              <input
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 129450"
                style={inputStyle}
                required
              />
              {currentVehicleMileage != null ? (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                  Current stored {readingLabel.toLowerCase()}: <strong>{currentVehicleMileage}</strong>
                </div>
              ) : null}
            </Field>

            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MaintenanceLogStatus)}
                style={inputStyle}
              >
                <option value="">Select...</option>
                {MAINTENANCE_LOG_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>

            {userRole === "mechanic" ? (
              <Field label="Mechanic Self Score (0-100, optional)">
                <input
                  value={mechanicSelfScore}
                  onChange={(e) => setMechanicSelfScore(e.target.value)}
                  inputMode="numeric"
                  placeholder="e.g. 78"
                  style={inputStyle}
                />
              </Field>
            ) : null}

            <Field label="Reset Oil Life?">
              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={resetOilLife}
                  onChange={(e) => setResetOilLife(e.target.checked)}
                />
                <span style={{ opacity: 0.85 }}>Yes (only for oil service)</span>
              </label>
            </Field>

            <Field label={`${nextDueLabel} (optional)`}>
              <input
                value={nextDueMileage}
                onChange={(e) => setNextDueMileage(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 135000"
                style={inputStyle}
              />
            </Field>

            <Field label="Title (required)">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Replaced front brake pads"
                style={inputStyle}
                required
              />
            </Field>
          </div>

          <div style={{ marginTop: 12 }}>
            <Field label="Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={7}
                placeholder="Parts used, labor, details, etc."
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </Field>
          </div>
        </div>

        <div style={{ marginTop: 16, ...cardStyle }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Purchases</div>
          <div style={{ opacity: 0.76, marginBottom: 10 }}>
            Purchase requests replace cost fields for this maintenance log.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a
              href={purchaseLinkHref}
              style={{ ...secondaryButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            >
              Create / Open Purchase Request
            </a>
          </div>

          {linkedPurchasesLoading ? (
            <div style={{ marginTop: 12, opacity: 0.75 }}>Loading linked purchases...</div>
          ) : linkedPurchasesError ? (
            <div style={{ marginTop: 12, color: "#ff9d9d" }}>{linkedPurchasesError}</div>
          ) : linkedPurchases.length ? (
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {linkedPurchases.map((purchase) => {
                const approvedItems = (linkedPurchaseItems[purchase.id] ?? []).filter(
                  (item) => item.ap_decision === "approved"
                );
                return (
                  <div
                    key={purchase.id}
                    style={{
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 12,
                      padding: 10,
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 800 }}>Purchase {purchase.id.slice(0, 8)}</div>
                      <div style={{ opacity: 0.8 }}>{purchase.overall_status.replaceAll("_", " ")}</div>
                    </div>
                    {approvedItems.length ? (
                      <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>
                        Approved items: {approvedItems.map((item) => item.item_name).join(", ")}
                      </div>
                    ) : null}
                    {(purchase.ap_payment_method || purchase.ap_po_number || purchase.funds_available_date) ? (
                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.78 }}>
                        Payment:{" "}
                        {purchase.ap_payment_method
                          ? purchase.ap_payment_method === "Other" && purchase.ap_payment_method_other
                            ? `${purchase.ap_payment_method} (${purchase.ap_payment_method_other})`
                            : purchase.ap_payment_method
                          : "-"}
                        {" · "}PO#: {purchase.ap_po_number || "-"}
                        {" · "}Funds: {purchase.funds_available_date || "-"}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ marginTop: 12, opacity: 0.7 }}>No linked purchase requests yet.</div>
          )}
        </div>

        <div style={{ marginTop: 16, ...cardStyle }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Parts Used</div>
          {!canSubmitPartsUsage ? (
            <div style={{ opacity: 0.75, marginBottom: 10 }}>
              Parts usage entry is limited to owner, operations_manager, office_admin, or mechanic.
            </div>
          ) : null}

          <div style={gridStyle}>
            <Field label="Search Inventory">
              <input
                value={partSearch}
                onChange={(e) => setPartSearch(e.target.value)}
                placeholder="Search by part name/category"
                style={inputStyle}
                disabled={!canSubmitPartsUsage}
              />
            </Field>

            <Field label="Part">
              <select
                value={selectedPartId}
                onChange={(e) => setSelectedPartId(e.target.value)}
                style={inputStyle}
                disabled={!canSubmitPartsUsage || inventoryLoading || filteredInventoryItems.length === 0}
              >
                <option value="">
                  {inventoryLoading
                    ? "Loading parts..."
                    : filteredInventoryItems.length
                    ? "Select a part"
                    : "No matching parts"}
                </option>
                {filteredInventoryItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.quantity} in stock)
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Quantity Used">
              <input
                value={selectedPartQty}
                onChange={(e) => setSelectedPartQty(e.target.value)}
                inputMode="numeric"
                placeholder="1"
                style={inputStyle}
                disabled={!canSubmitPartsUsage}
              />
            </Field>
          </div>

          <div style={{ marginTop: 12 }}>
            <button type="button" onClick={addPartUsed} style={secondaryButtonStyle} disabled={!canSubmitPartsUsage}>
              Add Part
            </button>
          </div>

          {inventoryError ? (
            <div style={{ marginTop: 10, color: "#ff9d9d" }}>
              Failed to load inventory items: {inventoryError}
            </div>
          ) : null}

          {partsUsed.length ? (
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {partsUsed.map((part) => (
                <div
                  key={part.item_id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    padding: 10,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800 }}>{part.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Qty Used: {part.quantity_used}</div>
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 4 }}>
                        Pulled From Location
                      </div>
                      <select
                        value={part.from_location_id ?? ""}
                        onChange={(e) => updatePartFromLocation(part.item_id, e.target.value)}
                        style={{ ...inputStyle, maxWidth: 280 }}
                        disabled={!canSubmitPartsUsage}
                      >
                        <option value="">Not specified</option>
                        {inventoryLocations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePartUsed(part.item_id)}
                    style={secondaryButtonStyle}
                    disabled={!canSubmitPartsUsage}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 10, opacity: 0.7 }}>No parts added.</div>
          )}
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" style={buttonStyle}>
            {isEditMode ? "Save Changes" : "Save Maintenance Log"}
          </button>

          <button
            type="button"
            onClick={() => {
              if (!confirmLeaveForm()) return;
              router.replace(`/vehicles/${encodeURIComponent(vehicleId)}`);
            }}
            style={secondaryButtonStyle}
          >Discard & Return</button>

          <a href="/maintenance" style={{ ...secondaryButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            Maintenance Operations Dashboard
          </a>
        </div>
      </form>
    </main>
  );
}

/* =========================
   Helpers
========================= */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

/* =========================
   Styles
========================= */

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 16,
  padding: 16,
  background: "rgba(255,255,255,0.03)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontWeight: 900,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "transparent",
  color: "inherit",
  fontWeight: 800,
  opacity: 0.9,
};
