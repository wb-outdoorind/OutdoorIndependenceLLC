"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { writeAudit } from "@/lib/audit";
import { MAINTENANCE_ACTIVE_STATUSES, isMaintenanceClosedStatus } from "@/lib/maintenanceStatus";
import AcademyAssetSection from "@/components/academy/AcademyAssetSection";
import TrendActionsPanel from "@/components/trends/TrendActionsPanel";
import EquipmentDocumentsSection from "@/components/assets/EquipmentDocumentsSection";
import AssetCommandHeader from "@/components/assets/AssetCommandHeader";
import { assetLifecycleStatusTone } from "@/lib/assetLifecycleStatus";
import { readRoleViewOverride, resolveEffectiveRole, type AppRole } from "@/lib/roleView";
import {
  EQUIPMENT_SEASONS,
  inferEquipmentSeason,
  normalizeEquipmentSeason,
  type EquipmentSeason,
} from "@/lib/equipmentSeason";

type EquipmentRow = {
  id: string;
  name: string | null;
  equipment_type: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  serial_number: string | null;
  license_plate: string | null;
  fuel_type: string | null;
  oil_type: string | null;
  season: string | null;
  current_hours: number | null;
  status: string | null;
  external_id: string | null;
};

type EquipmentEditDraft = {
  name: string;
  equipment_type: string;
  make: string;
  model: string;
  year: string;
  serial_number: string;
  license_plate: string;
  fuel_type: string;
  oil_type: string;
  season: EquipmentSeason;
  current_hours: string;
  status: string;
  external_id: string;
};

type MaintenanceRequestPreviewRow = {
  id: string;
  equipment_id: string;
  created_at: string;
  status: string | null;
  urgency: string | null;
  system_affected: string | null;
  description: string | null;
};

type MaintenanceLogPreviewRow = {
  id: string;
  equipment_id: string;
  created_at: string;
  created_by: string | null;
  request_id: string | null;
  mechanic_self_score: number | null;
  status_update: string | null;
  notes: string | null;
};

type AssetHealthSummary = {
  healthScore: number;
  operationalScore: number;
  objectiveMechanicScore: number;
  mechanicOpinionScore: number;
  mechanicScore: number;
  openRequests: number;
  pmStatus: "On Track" | "Due Soon" | "Overdue";
};

type Role = AppRole;

type HistoryPreviewItem = {
  id: string;
  type: "Maintenance Request" | "Maintenance Log" | "Preventative Maintenance";
  createdAt: string;
  title: string;
  status?: string;
  notes?: string;
};

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

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hasRole(role: string | null | undefined, allowed: string[]) {
  const normalized = (role ?? "").trim().toLowerCase();
  return allowed.includes(normalized);
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

function maintenanceLogObjectiveScore(log: MaintenanceLogPreviewRow) {
  let objectiveScore = 100;
  if (!log.request_id) objectiveScore -= 6;
  if ((log.status_update ?? "").trim() && !isMaintenanceClosedStatus((log.status_update ?? "").trim())) {
    objectiveScore -= 8;
  }
  if (!(log.status_update ?? "").trim()) objectiveScore -= 10;
  const notesLength = (log.notes ?? "").trim().length;
  if (notesLength < 20) objectiveScore -= 8;
  if (notesLength === 0) objectiveScore -= 8;
  return clampPercent(objectiveScore);
}

function latestMechanicOpinionScore(logs: MaintenanceLogPreviewRow[]) {
  for (const log of logs) {
    if (Number.isFinite(Number(log.mechanic_self_score))) {
      return clampPercent(Number(log.mechanic_self_score));
    }
  }
  return null;
}

function trendDirection(points: number[]) {
  if (points.length < 2) return "Flat";
  const delta = points[points.length - 1] - points[0];
  if (delta >= 4) return "Improving";
  if (delta <= -4) return "Declining";
  return "Stable";
}

function normalizeTruckAssetId(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  const simple = /^(Truck|Trailer)_(\d+)$/i.exec(raw);
  if (simple) return `Truck_${Number(simple[2])}`;
  return raw;
}

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
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

const editPrimaryButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(126,255,167,0.45)",
  borderRadius: 10,
  padding: "8px 12px",
  background: "rgba(126,255,167,0.14)",
  color: "inherit",
  fontWeight: 900,
  cursor: "pointer",
};

const editSecondaryButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 10,
  padding: "8px 12px",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
  fontWeight: 800,
  cursor: "pointer",
};

const detailInputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  marginTop: 6,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
};

const trendPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.05)",
  fontSize: 12,
  fontWeight: 700,
};

const sectionSummaryStyle: React.CSSProperties = {
  listStyle: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  cursor: "pointer",
  userSelect: "none",
  fontSize: 14,
};

function badgeStyle(label: string): React.CSSProperties {
  const tone = assetLifecycleStatusTone(label);
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
  if (tone === "active")
    return {
      ...base,
      border: "1px solid rgba(0,255,120,0.22)",
      background: "rgba(0,255,120,0.08)",
    };
  if (tone === "inactive")
    return {
      ...base,
      border: "1px solid rgba(255,210,0,0.26)",
      background: "rgba(255,210,0,0.10)",
    };
  if (tone === "warning")
    return {
      ...base,
      border: "1px solid rgba(255,80,80,0.28)",
      background: "rgba(255,80,80,0.10)",
    };
  if (tone === "danger")
    return {
      ...base,
      border: "1px solid rgba(255,80,80,0.42)",
      background: "rgba(120,20,20,0.34)",
    };
  if (tone === "retired")
    return {
      ...base,
      border: "1px solid rgba(180,180,180,0.30)",
      background: "rgba(180,180,180,0.10)",
    };
  return base;
}

function isTrailerEquipmentType(value: string | null | undefined) {
  return (value ?? "").toLowerCase().includes("trailer");
}

function isMowerEquipmentType(value: string | null | undefined) {
  return (value ?? "").toLowerCase().includes("mower");
}

function isApplicatorEquipmentType(value: string | null | undefined) {
  const v = (value ?? "").toLowerCase();
  return v.includes("applicator") || (v.includes("turf") && v.includes("application"));
}

export default function EquipmentDetailPage() {
  const params = useParams<{ equipmentID: string }>();
  const routeEquipmentId = params.equipmentID;
  const equipmentIdFromRoute = decodeURIComponent(routeEquipmentId);

  const [equipment, setEquipment] = useState<EquipmentRow | null>(null);
  const [editDraft, setEditDraft] = useState<EquipmentEditDraft | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [requestPreviewRows, setRequestPreviewRows] = useState<MaintenanceRequestPreviewRow[]>([]);
  const [logPreviewRows, setLogPreviewRows] = useState<MaintenanceLogPreviewRow[]>([]);
  const [requestPreviewError, setRequestPreviewError] = useState<string | null>(null);
  const [logPreviewError, setLogPreviewError] = useState<string | null>(null);
  const [openRequestCountForHealth, setOpenRequestCountForHealth] = useState(0);
  const [latestPmHours, setLatestPmHours] = useState<number | null>(null);
  const [hasPmTemplate, setHasPmTemplate] = useState(false);
  const [userRole, setUserRole] = useState<Role>("employee");
  const [isEditingMechanicScore, setIsEditingMechanicScore] = useState(false);
  const [mechanicScoreDraft, setMechanicScoreDraft] = useState("");
  const [mechanicScoreSaving, setMechanicScoreSaving] = useState(false);
  const [mechanicScoreError, setMechanicScoreError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsSectionRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadEquipment() {
      setLoading(true);
      setErrorMessage(null);

      const supabase = createSupabaseBrowser();
      const { data, error } = await supabase
        .from("equipment")
        .select(
          "id,name,equipment_type,make,model,year,serial_number,license_plate,fuel_type,oil_type,season,current_hours,status,external_id"
        )
        .eq("id", equipmentIdFromRoute)
        .maybeSingle();

      if (!alive) return;
      if (error) {
        console.error("[equipment-detail] load error:", error);
        setEquipment(null);
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setEquipment(null);
        setErrorMessage(`Equipment not found. Tried id=\"${equipmentIdFromRoute}\"`);
        setLoading(false);
        return;
      }

      setEquipment(data as EquipmentRow);
      const row = data as EquipmentRow;
      setEditDraft({
        name: row.name ?? "",
        equipment_type: row.equipment_type ?? "",
        make: row.make ?? "",
        model: row.model ?? "",
        year: typeof row.year === "number" ? String(row.year) : "",
        serial_number: row.serial_number ?? "",
        license_plate: row.license_plate ?? "",
        fuel_type: row.fuel_type ?? "",
        oil_type: row.oil_type ?? "",
        season:
          normalizeEquipmentSeason(row.season) ??
          inferEquipmentSeason(row.equipment_type, row.name, row.id),
        current_hours: typeof row.current_hours === "number" ? String(row.current_hours) : "",
        status: row.status ?? "",
        external_id: row.external_id ?? "",
      });
      setLoading(false);
    }

    loadEquipment();

    return () => {
      alive = false;
    };
  }, [equipmentIdFromRoute]);

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
    let alive = true;

    async function checkTemplate() {
      if (!equipment?.equipment_type?.trim()) {
        setHasPmTemplate(false);
        return;
      }
      if (
        isTrailerEquipmentType(equipment.equipment_type) ||
        isMowerEquipmentType(equipment.equipment_type) ||
        isApplicatorEquipmentType(equipment.equipment_type)
      ) {
        setHasPmTemplate(false);
        return;
      }

      const supabase = createSupabaseBrowser();
      const { data, error } = await supabase
        .from("equipment_pm_templates")
        .select("id")
        .eq("equipment_type", equipment.equipment_type)
        .eq("is_active", true)
        .limit(1);

      if (!alive) return;
      if (error) {
        console.error("[equipment-detail] template availability load error:", error);
        setHasPmTemplate(false);
        return;
      }
      setHasPmTemplate(Array.isArray(data) && data.length > 0);
    }

    void checkTemplate();
    return () => {
      alive = false;
    };
  }, [equipment?.equipment_type]);

  useEffect(() => {
    let alive = true;

    async function loadRequestPreview() {
      const supabase = createSupabaseBrowser();
      setRequestPreviewError(null);
      setLogPreviewError(null);

      const [requestsRes, logsRes, openCountRes, pmEventRes] = await Promise.all([
        supabase
          .from("equipment_maintenance_requests")
          .select("id,equipment_id,created_at,status,urgency,system_affected,description")
          .eq("equipment_id", equipmentIdFromRoute)
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("equipment_maintenance_logs")
          .select("id,equipment_id,created_at,created_by,request_id,mechanic_self_score,status_update,notes")
          .eq("equipment_id", equipmentIdFromRoute)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("equipment_maintenance_requests")
          .select("id", { count: "exact", head: true })
          .eq("equipment_id", equipmentIdFromRoute)
          .in("status", MAINTENANCE_ACTIVE_STATUSES),
        supabase
          .from("equipment_pm_events")
          .select("hours")
          .eq("equipment_id", equipmentIdFromRoute)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      if (!alive) return;

      if (requestsRes.error || !requestsRes.data) {
        if (requestsRes.error) {
          console.error("[equipment-detail] preview load error:", requestsRes.error);
          setRequestPreviewError(requestsRes.error.message);
        }
        setRequestPreviewRows([]);
      } else {
        setRequestPreviewRows(requestsRes.data as MaintenanceRequestPreviewRow[]);
      }

      if (logsRes.error || !logsRes.data) {
        if (logsRes.error) {
          console.error("[equipment-detail] log preview load error:", logsRes.error);
          setLogPreviewError(logsRes.error.message);
        }
        setLogPreviewRows([]);
      } else {
        setLogPreviewRows(logsRes.data as MaintenanceLogPreviewRow[]);
      }

      if (openCountRes.error) {
        console.error("[equipment-detail] open request count load error:", openCountRes.error);
        setOpenRequestCountForHealth(0);
      } else {
        setOpenRequestCountForHealth(openCountRes.count ?? 0);
      }

      if (pmEventRes.error) {
        console.error("[equipment-detail] latest PM event load error:", pmEventRes.error);
        setLatestPmHours(null);
      } else {
        const row = (pmEventRes.data ?? [])[0] as { hours: number | null } | undefined;
        const parsed = Number(row?.hours);
        setLatestPmHours(Number.isFinite(parsed) ? parsed : null);
      }
    }

    loadRequestPreview();

    return () => {
      alive = false;
    };
  }, [equipmentIdFromRoute]);

  const stableEquipmentId = equipment?.id ?? equipmentIdFromRoute;
  const routeIdForLinks = encodeURIComponent(stableEquipmentId);
  const formsWorkspaceHref = `/forms?assetType=equipment&assetId=${encodeURIComponent(stableEquipmentId)}`;
  const formsCreateHref = `${formsWorkspaceHref}&mode=create`;
  const isTrailerEquipment = isTrailerEquipmentType(equipment?.equipment_type);
  const isMowerEquipment = isMowerEquipmentType(equipment?.equipment_type);
  const isApplicatorEquipment = isApplicatorEquipmentType(equipment?.equipment_type);
  const canManageEquipmentMaintenance = hasRole(userRole, [
    "owner",
    "operations_manager",
    "office_admin",
    "mechanic",
  ]);
  const canShowPmButton =
    canManageEquipmentMaintenance &&
    (isTrailerEquipment || isMowerEquipment || isApplicatorEquipment || hasPmTemplate);
  const canEditEquipment =
    canManageEquipmentMaintenance;
  const canEditAssetId = hasRole(userRole, ["owner", "operations_manager"]);
  const canViewMechanicScore = hasRole(userRole, ["mechanic"]);
  const canEditMechanicScore = hasRole(userRole, ["mechanic"]);
  const canViewScoreTrends = canViewMechanicScore;
  const canCreateMaintenanceRequest = !hasRole(userRole, ["apprentice"]);
  const canCreateMaintenanceLog = canViewMechanicScore;
  const displayAssetId = normalizeTruckAssetId(equipment?.external_id) || "-";
  const displayName = equipment?.name ?? "Equipment";
  const displayStatus = (equipment?.status ?? "Unknown").trim() || "Unknown";
  const pmActionLabel = isTrailerEquipment
    ? "Trailer PM Inspection"
    : isMowerEquipment
      ? "Mower PM Checklist"
      : isApplicatorEquipment
        ? "Applicator PM Inspection"
        : "Preventative Maintenance";
  const urgentRequestCount = useMemo(() => {
    return requestPreviewRows.filter((row) => {
      const urgency = (row.urgency ?? "").trim();
      const status = (row.status ?? "").trim();
      return !isMaintenanceClosedStatus(status) && (urgency === "High" || urgency === "Urgent");
    }).length;
  }, [requestPreviewRows]);
  function updateDraft<K extends keyof EquipmentEditDraft>(key: K, value: EquipmentEditDraft[K]) {
    setEditDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function resetDraftFromEquipment() {
    if (!equipment) return;
    setEditDraft({
      name: equipment.name ?? "",
      equipment_type: equipment.equipment_type ?? "",
      make: equipment.make ?? "",
      model: equipment.model ?? "",
      year: typeof equipment.year === "number" ? String(equipment.year) : "",
      serial_number: equipment.serial_number ?? "",
      license_plate: equipment.license_plate ?? "",
      fuel_type: equipment.fuel_type ?? "",
      oil_type: equipment.oil_type ?? "",
      season:
        normalizeEquipmentSeason(equipment.season) ??
        inferEquipmentSeason(equipment.equipment_type, equipment.name, equipment.id),
      current_hours: typeof equipment.current_hours === "number" ? String(equipment.current_hours) : "",
      status: equipment.status ?? "",
      external_id: equipment.external_id ?? "",
    });
  }

  async function saveEquipmentEdits() {
    if (!equipment || !editDraft || !canEditEquipment) return;
    setEditError(null);

    const nextName = editDraft.name.trim();
    const nextType = editDraft.equipment_type.trim();
    const nextStatus = editDraft.status.trim();
    if (!nextName) return setEditError("Equipment name is required.");
    if (!nextType) return setEditError("Equipment type is required.");
    if (!nextStatus) return setEditError("Status is required.");

    let parsedYear: number | null = null;
    if (editDraft.year.trim()) {
      const y = Number(editDraft.year);
      if (!Number.isInteger(y) || y < 1900) {
        return setEditError("Year must be a valid integer.");
      }
      parsedYear = y;
    }

    let parsedHours: number | null = null;
    if (editDraft.current_hours.trim()) {
      const h = Number(editDraft.current_hours);
      if (!Number.isFinite(h) || h < 0) {
        return setEditError("Current hours must be a valid non-negative number.");
      }
      parsedHours = h;
    }

    setEditSaving(true);
    const response = await fetch("/api/assets/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetType: "equipment",
        id: equipment.id,
        patch: {
          name: nextName,
          equipment_type: nextType,
          make: editDraft.make.trim() || null,
          model: editDraft.model.trim() || null,
          year: parsedYear,
          serial_number: editDraft.serial_number.trim() || null,
          license_plate: editDraft.license_plate.trim() || null,
          fuel_type: editDraft.fuel_type.trim() || null,
          oil_type: editDraft.oil_type.trim() || null,
          season:
            normalizeEquipmentSeason(editDraft.season) ??
            inferEquipmentSeason(nextType, nextName, equipment.id),
          current_hours: parsedHours,
          status: nextStatus,
          external_id: canEditAssetId
            ? editDraft.external_id.trim() || null
            : equipment.external_id ?? null,
        },
      }),
    });
    const json = (await response.json().catch(() => ({}))) as {
      error?: string;
      asset?: EquipmentRow;
    };
    setEditSaving(false);

    if (!response.ok) {
      setEditError(json.error || "Failed to save equipment.");
      return;
    }
    if (!json.asset) {
      setEditError("Save did not return updated equipment.");
      return;
    }

    const updated = json.asset;
    setEquipment(updated);
    setIsEditing(false);
    setEditDraft({
      name: updated.name ?? "",
      equipment_type: updated.equipment_type ?? "",
      make: updated.make ?? "",
      model: updated.model ?? "",
      year: typeof updated.year === "number" ? String(updated.year) : "",
      serial_number: updated.serial_number ?? "",
      license_plate: updated.license_plate ?? "",
      fuel_type: updated.fuel_type ?? "",
      oil_type: updated.oil_type ?? "",
      season:
        normalizeEquipmentSeason(updated.season) ??
        inferEquipmentSeason(updated.equipment_type, updated.name, updated.id),
      current_hours: typeof updated.current_hours === "number" ? String(updated.current_hours) : "",
      status: updated.status ?? "",
      external_id: updated.external_id ?? "",
    });
    await writeAudit({
      action: "update_equipment",
      event_type: "equipment_updated",
      table_name: "equipment",
      record_id: updated.id,
      entity_type: "equipment",
      entity_id: updated.id,
      after_data: updated,
      meta: { route: "equipment_detail" },
    });
  }

  async function saveMechanicScore() {
    const latestLog = logPreviewRows[0];
    if (!latestLog) {
      setMechanicScoreError("No maintenance log found for this asset yet.");
      return;
    }
    const parsed = Number(mechanicScoreDraft);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setMechanicScoreError("Opinion score must be a number between 0 and 100.");
      return;
    }

    setMechanicScoreSaving(true);
    setMechanicScoreError(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("equipment_maintenance_logs")
      .update({ mechanic_self_score: Math.round(parsed) })
      .eq("id", latestLog.id)
      .eq("equipment_id", stableEquipmentId);
    setMechanicScoreSaving(false);

    if (error) {
      setMechanicScoreError(error.message);
      return;
    }

    setLogPreviewRows((prev) =>
      prev.map((row, idx) =>
        idx === 0 ? { ...row, mechanic_self_score: Math.round(parsed) } : row
      )
    );
    await writeAudit({
      action: "update_mechanic_score",
      event_type: "mechanic_score_updated",
      table_name: "equipment_maintenance_logs",
      record_id: latestLog.id,
      entity_type: "equipment",
      entity_id: stableEquipmentId,
      after_data: { mechanic_self_score: Math.round(parsed) },
      meta: { route: "equipment_detail" },
    });
    setIsEditingMechanicScore(false);
  }

  const equipmentHealthSummary = useMemo<AssetHealthSummary>(() => {
    const interval = 250;
    const dueSoonWindow = 25;
    const currentHours = Number(equipment?.current_hours ?? 0);
    const hasCurrentHours = Number.isFinite(currentHours) && currentHours >= 0;
    const lastPmValue = latestPmHours ?? 0;

    let pmStatus: AssetHealthSummary["pmStatus"] = "On Track";
    if (hasCurrentHours) {
      const dueAt = lastPmValue + interval;
      const delta = dueAt - currentHours;
      if (currentHours >= dueAt) pmStatus = "Overdue";
      else if (delta <= dueSoonWindow) pmStatus = "Due Soon";
    }

    const recentLogs = logPreviewRows.slice(0, 6);
    const objectiveMechanicScore = recentLogs.length
      ? Math.round(
          recentLogs.reduce((sum, row) => sum + maintenanceLogObjectiveScore(row), 0) / recentLogs.length
        )
      : 75;
    const mechanicOpinionScore = latestMechanicOpinionScore(logPreviewRows) ?? objectiveMechanicScore;
    const mechanicScore = combineMechanicScore(objectiveMechanicScore, mechanicOpinionScore);

    let operationalScore = 100;
    const status = (equipment?.status ?? "").trim();
    if (status === "Red Tagged" || status === "Out of Service") operationalScore -= 30;
    operationalScore -= Math.min(36, openRequestCountForHealth * 12);
    if (pmStatus === "Overdue") operationalScore -= 20;
    if (pmStatus === "Due Soon") operationalScore -= 10;
    operationalScore += legacyAssetAllowance(equipment?.year);
    operationalScore = clampPercent(operationalScore);

    const healthScore = clampPercent(operationalScore * 0.8 + mechanicScore * 0.2);
    return {
      healthScore,
      operationalScore,
      objectiveMechanicScore,
      mechanicOpinionScore,
      mechanicScore,
      openRequests: openRequestCountForHealth,
      pmStatus,
    };
  }, [equipment?.current_hours, equipment?.status, equipment?.year, latestPmHours, logPreviewRows, openRequestCountForHealth]);

  const headerExceptions = useMemo(() => {
    const items: Array<{ label: string; tone?: "default" | "warning" | "danger" }> = [];
    if (displayStatus === "Out of Service" || displayStatus === "Red Tagged") {
      items.push({ label: displayStatus, tone: "danger" });
    }
    if (equipmentHealthSummary.pmStatus === "Overdue") {
      items.push({ label: "PM Overdue", tone: "danger" });
    } else if (equipmentHealthSummary.pmStatus === "Due Soon") {
      items.push({ label: "PM Due Soon", tone: "warning" });
    }
    if (urgentRequestCount > 0) {
      items.push({
        label: `${urgentRequestCount} High/Urgent Request${urgentRequestCount === 1 ? "" : "s"}`,
        tone: "danger",
      });
    } else if (equipmentHealthSummary.openRequests > 0) {
      items.push({
        label: `${equipmentHealthSummary.openRequests} Open Request${
          equipmentHealthSummary.openRequests === 1 ? "" : "s"
        }`,
        tone: "warning",
      });
    }
    return items.slice(0, 4);
  }, [displayStatus, equipmentHealthSummary.openRequests, equipmentHealthSummary.pmStatus, urgentRequestCount]);

  const headerActions = useMemo(() => {
    const items: Array<{ label: string; href: string }> = [];
    if (canCreateMaintenanceRequest) {
      items.push({
        label: "Maintenance Request",
        href: `/equipment/${routeIdForLinks}/forms/maintenance-request`,
      });
    }
    if (canCreateMaintenanceLog) {
      items.push({
        label: "Maintenance Log",
        href: `/equipment/${routeIdForLinks}/forms/maintenance-log`,
      });
    }
    if (canShowPmButton) {
      items.push({
        label: pmActionLabel,
        href: `/equipment/${routeIdForLinks}/forms/preventative-maintenance`,
      });
    }
    return items.slice(0, 4);
  }, [canCreateMaintenanceLog, canCreateMaintenanceRequest, canShowPmButton, pmActionLabel, routeIdForLinks]);

  const headerMeters = [
    {
      label: "Current Hours",
      value: typeof equipment?.current_hours === "number" ? equipment.current_hours.toLocaleString() : "—",
    },
    { label: "PM State", value: equipmentHealthSummary.pmStatus },
    { label: "Open Requests", value: String(equipmentHealthSummary.openRequests) },
  ];

  const scoreTrend = useMemo(() => {
    const chronological = [...logPreviewRows]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(-8);
    const mechanicPoints = chronological.map((row) => maintenanceLogObjectiveScore(row));
    const healthPoints = mechanicPoints.map((mechanicObjective) =>
      clampPercent(
        equipmentHealthSummary.operationalScore * 0.8 +
          combineMechanicScore(mechanicObjective, equipmentHealthSummary.mechanicOpinionScore) * 0.2
      )
    );
    return {
      mechanicPoints,
      healthPoints,
      mechanicTrend: trendDirection(mechanicPoints),
      healthTrend: trendDirection(healthPoints),
    };
  }, [equipmentHealthSummary.mechanicOpinionScore, equipmentHealthSummary.operationalScore, logPreviewRows]);

  const historyPreview = useMemo<HistoryPreviewItem[]>(() => {
    return requestPreviewRows.map((r) => {
      const parsed = parseTitleAndDescription(r.description);
      return {
        id: r.id,
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

  function historyItemHref(item: HistoryPreviewItem) {
    const query = new URLSearchParams({
      focusType: item.type,
      focusId: item.id,
    }).toString();
    return `/equipment/${routeIdForLinks}/history?${query}`;
  }

  return (
    <main style={{ paddingBottom: 40 }}>
      {loading ? (
        <div style={{ marginBottom: 14, opacity: 0.75 }}>Loading equipment from Supabase...</div>
      ) : errorMessage ? (
        <div
          style={{
            marginBottom: 14,
            border: "1px solid rgba(255,80,80,0.30)",
            background: "rgba(255,80,80,0.06)",
            padding: 12,
            borderRadius: 12,
          }}
        >
          <div style={{ fontWeight: 900 }}>Couldn’t load equipment</div>
          <div style={{ opacity: 0.8, marginTop: 6, fontSize: 13 }}>{errorMessage}</div>
        </div>
      ) : null}

      <AssetCommandHeader
        assetName={displayName}
        assetId={displayAssetId}
        status={displayStatus}
        fullHistoryHref={`/equipment/${routeIdForLinks}/history`}
        exceptions={headerExceptions}
        actions={headerActions}
        meters={headerMeters}
      />

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ ...cardStyle(), background: "rgba(255,255,255,0.02)", order: 3 }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Forms</div>
          <div style={{ marginBottom: 10, fontSize: 12, opacity: 0.78 }}>
            Quick operational forms are in the header. Use this area for history, blank forms, and deeper access.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            <Link href={`/equipment/${routeIdForLinks}/history`} style={actionBtnStyle()}>
              <span>Full History</span>
              <span style={{ opacity: 0.75 }}>→</span>
            </Link>

            <Link href={formsCreateHref} style={actionBtnStyle()}>
              <span>Create Blank Form</span>
              <span style={{ opacity: 0.75 }}>→</span>
            </Link>

            <Link href={formsWorkspaceHref} style={actionBtnStyle()}>
              <span>Forms Workspace</span>
              <span style={{ opacity: 0.75 }}>→</span>
            </Link>

            <Link href="/maintenance" style={actionBtnStyle()}>
              <span>Maintenance Operations</span>
              <span style={{ opacity: 0.75 }}>→</span>
            </Link>
          </div>
        </div>

        <div style={{ ...cardStyle(), order: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900 }}>Recent Maintenance History</div>
            <div style={{ opacity: 0.75, fontSize: 13 }}>Last 4 maintenance requests</div>
          </div>

          <div style={{ marginTop: 12 }}>
            {requestPreviewError || logPreviewError ? (
              <div style={{ opacity: 0.9, color: "#ff9d9d" }}>
                Failed to load all maintenance history preview sources.
              </div>
            ) : historyPreview.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No maintenance requests yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {historyPreview.map((r, idx) => (
                  <Link
                    key={`${r.createdAt}:${idx}`}
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
                      <div style={{ fontWeight: 900 }}>{r.title}</div>
                      <div style={{ opacity: 0.75, fontSize: 13 }}>{formatDateTime(r.createdAt)}</div>
                    </div>

                    <div style={{ marginTop: 6, opacity: 0.82, fontSize: 13 }}>{r.status ?? "-"}</div>

                    {r.notes?.trim() ? (
                      <div style={{ marginTop: 8, opacity: 0.75, lineHeight: 1.35 }}>{r.notes}</div>
                    ) : null}
                    <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, opacity: 0.9 }}>
                      See Form →
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <details style={{ ...cardStyle(), order: 5 }}>
          <summary style={sectionSummaryStyle}>
            <span style={{ fontWeight: 900 }}>Asset Health Score</span>
            <span style={{ opacity: 0.65, fontSize: 12 }}>▼</span>
          </summary>
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: 10,
              }}
            >
              <div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Health Score</div>
                <div style={{ fontWeight: 900, fontSize: 24 }}>{equipmentHealthSummary.healthScore}%</div>
              </div>
              <div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Operational Score</div>
                <div style={{ fontWeight: 900, fontSize: 20 }}>{equipmentHealthSummary.operationalScore}%</div>
              </div>
              {canViewMechanicScore ? (
                <>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Mechanic Score (Objective)</div>
                    <div style={{ fontWeight: 900, fontSize: 20 }}>
                      {equipmentHealthSummary.objectiveMechanicScore}%
                    </div>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>
                      {mechanicScoreBand(equipmentHealthSummary.objectiveMechanicScore)}
                    </div>
                  </div>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Mechanic Opinion</div>
                    <div style={{ fontWeight: 900, fontSize: 20 }}>
                      {canEditMechanicScore ? (
                        <button
                          type="button"
                          onClick={() => {
                            setMechanicScoreError(null);
                            setMechanicScoreDraft(String(equipmentHealthSummary.mechanicOpinionScore));
                            setIsEditingMechanicScore((prev) => !prev);
                          }}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "inherit",
                            font: "inherit",
                            fontWeight: 900,
                            cursor: "pointer",
                            padding: 0,
                            textDecoration: "underline",
                          }}
                        >
                          {equipmentHealthSummary.mechanicOpinionScore}%
                        </button>
                      ) : (
                        `${equipmentHealthSummary.mechanicOpinionScore}%`
                      )}
                    </div>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>
                      {canEditMechanicScore ? "click score to edit" : "set by mechanic"}
                    </div>
                    {canEditMechanicScore && isEditingMechanicScore ? (
                      <div
                        style={{
                          marginTop: 8,
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <input
                          value={mechanicScoreDraft}
                          onChange={(e) => setMechanicScoreDraft(e.target.value)}
                          inputMode="numeric"
                          placeholder="0-100"
                          style={{
                            width: "100%",
                            maxWidth: 120,
                            padding: 8,
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.14)",
                            background: "rgba(255,255,255,0.03)",
                            color: "inherit",
                          }}
                        />
                        <button
                          type="button"
                          onClick={saveMechanicScore}
                          style={actionBtnStyle()}
                          disabled={mechanicScoreSaving}
                        >
                          {mechanicScoreSaving ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingMechanicScore(false);
                            setMechanicScoreError(null);
                          }}
                          style={{
                            border: "1px solid rgba(255,255,255,0.14)",
                            borderRadius: 10,
                            background: "transparent",
                            color: "inherit",
                            padding: "8px 10px",
                            cursor: "pointer",
                          }}
                          disabled={mechanicScoreSaving}
                        >
                          Cancel
                        </button>
                        {mechanicScoreError ? (
                          <div style={{ color: "#ff9d9d", fontSize: 12 }}>{mechanicScoreError}</div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Mechanic Score (Blended)</div>
                    <div style={{ fontWeight: 900, fontSize: 20 }}>{equipmentHealthSummary.mechanicScore}%</div>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>
                      {mechanicScoreBand(equipmentHealthSummary.mechanicScore)}
                    </div>
                  </div>
                </>
              ) : null}
              <div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Open Requests</div>
                <div style={{ fontWeight: 900, fontSize: 20 }}>{equipmentHealthSummary.openRequests}</div>
              </div>
              <div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>PM Status</div>
                <div style={{ fontWeight: 900, fontSize: 20 }}>{equipmentHealthSummary.pmStatus}</div>
              </div>
            </div>
          </div>
        </details>

        <details style={{ ...cardStyle(), order: 6 }}>
          <summary style={sectionSummaryStyle}>
            <span style={{ fontWeight: 900 }}>Score Trend &amp; Actions</span>
            <span style={{ opacity: 0.65, fontSize: 12 }}>▼</span>
          </summary>
          <div style={{ marginTop: 12 }}>
            {canViewScoreTrends ? (
              <>
                {scoreTrend.mechanicPoints.length < 2 ? (
                  <div style={{ opacity: 0.75 }}>Not enough maintenance logs yet for trend analysis.</div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ opacity: 0.72, fontSize: 12 }}>Asset Health Trend</div>
                      <div style={{ fontWeight: 900, fontSize: 20 }}>{scoreTrend.healthTrend}</div>
                      <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {scoreTrend.healthPoints.map((point, idx) => (
                          <span key={`health-point-${idx}`} style={trendPillStyle}>
                            {point}%
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ opacity: 0.72, fontSize: 12 }}>Mechanic Trend</div>
                      <div style={{ fontWeight: 900, fontSize: 20 }}>{scoreTrend.mechanicTrend}</div>
                      <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {scoreTrend.mechanicPoints.map((point, idx) => (
                          <span key={`mechanic-point-${idx}`} style={trendPillStyle}>
                            {point}%
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ opacity: 0.75 }}>Score trends are visible to mechanics only.</div>
            )}
            <div style={{ marginTop: 12 }}>
              <TrendActionsPanel
                assetType="equipment"
                assetId={stableEquipmentId}
                canView={canViewScoreTrends}
                healthPoints={scoreTrend.healthPoints}
                mechanicPoints={scoreTrend.mechanicPoints}
              />
            </div>
          </div>
        </details>

        <details style={{ ...cardStyle(), order: 7 }}>
          <summary style={sectionSummaryStyle}>
            <span style={{ fontWeight: 900 }}>Asset Documents</span>
            <span style={{ opacity: 0.65, fontSize: 12 }}>▼</span>
          </summary>
          <div style={{ marginTop: 12 }}>
            <EquipmentDocumentsSection equipmentId={stableEquipmentId} canManage={canEditEquipment} />
          </div>
        </details>

        <details style={{ ...cardStyle(), order: 8 }}>
          <summary style={sectionSummaryStyle}>
            <span style={{ fontWeight: 900 }}>OI Academy</span>
            <span style={{ opacity: 0.65, fontSize: 12 }}>▼</span>
          </summary>
          <div style={{ marginTop: 12 }}>
            <AcademyAssetSection vehicleId={stableEquipmentId} assetType={equipment?.equipment_type ?? ""} />
          </div>
        </details>

        <details
          ref={detailsSectionRef}
          open={detailsOpen}
          onToggle={(event) => setDetailsOpen((event.currentTarget as HTMLDetailsElement).open)}
          style={{ ...cardStyle(), order: 2 }}
        >
          <summary style={sectionSummaryStyle}>
            <span style={{ fontWeight: 900 }}>Details</span>
            <span style={{ opacity: 0.65, fontSize: 12 }}>▼</span>
          </summary>
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Specs</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {canEditEquipment ? (
                  isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={saveEquipmentEdits}
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
                          resetDraftFromEquipment();
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
                        setDetailsOpen(true);
                        setIsEditing(true);
                        setEditError(null);
                      }}
                      style={editSecondaryButtonStyle}
                    >
                      Edit Equipment
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
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Equipment Name *</div>
                    <input
                      value={editDraft.name}
                      onChange={(e) => updateDraft("name", e.target.value)}
                      style={detailInputStyle}
                    />
                  </div>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Equipment Type *</div>
                    <input
                      value={editDraft.equipment_type}
                      onChange={(e) => updateDraft("equipment_type", e.target.value)}
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
                      <option value="Red Tagged">Red Tagged</option>
                      <option value="Retired">Retired</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Make</div>
                    <input
                      value={editDraft.make}
                      onChange={(e) => updateDraft("make", e.target.value)}
                      style={detailInputStyle}
                    />
                  </div>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Model</div>
                    <input
                      value={editDraft.model}
                      onChange={(e) => updateDraft("model", e.target.value)}
                      style={detailInputStyle}
                    />
                  </div>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Year</div>
                    <input
                      value={editDraft.year}
                      onChange={(e) => updateDraft("year", e.target.value)}
                      style={detailInputStyle}
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Serial Number</div>
                    <input
                      value={editDraft.serial_number}
                      onChange={(e) => updateDraft("serial_number", e.target.value)}
                      style={detailInputStyle}
                    />
                  </div>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>License Plate</div>
                    <input
                      value={editDraft.license_plate}
                      onChange={(e) => updateDraft("license_plate", e.target.value)}
                      style={detailInputStyle}
                    />
                  </div>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Fuel Type</div>
                    <input
                      value={editDraft.fuel_type}
                      onChange={(e) => updateDraft("fuel_type", e.target.value)}
                      style={detailInputStyle}
                    />
                  </div>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Oil Type</div>
                    <input
                      value={editDraft.oil_type}
                      onChange={(e) => updateDraft("oil_type", e.target.value)}
                      style={detailInputStyle}
                    />
                  </div>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Season</div>
                    <select
                      value={editDraft.season}
                      onChange={(e) => updateDraft("season", e.target.value as EquipmentSeason)}
                      style={detailInputStyle}
                    >
                      {EQUIPMENT_SEASONS.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Current Hours</div>
                    <input
                      value={editDraft.current_hours}
                      onChange={(e) => updateDraft("current_hours", e.target.value)}
                      style={detailInputStyle}
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Asset ID</div>
                    <input
                      value={canEditAssetId ? editDraft.external_id : normalizeTruckAssetId(editDraft.external_id)}
                      onChange={(e) => updateDraft("external_id", e.target.value)}
                      style={{ ...detailInputStyle, opacity: canEditAssetId ? 1 : 0.72 }}
                      disabled={!canEditAssetId}
                    />
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
                <Spec label="Type" value={equipment?.equipment_type ?? "-"} />
                <Spec label="Make" value={equipment?.make ?? "-"} />
                <Spec label="Model" value={equipment?.model ?? "-"} />
                <Spec label="Year" value={typeof equipment?.year === "number" ? String(equipment.year) : "-"} />
                <Spec label="Serial Number" value={equipment?.serial_number ?? "-"} />
                <Spec label="License Plate" value={equipment?.license_plate ?? "-"} />
                <Spec label="Fuel Type" value={equipment?.fuel_type ?? "-"} />
                <Spec label="Oil Type" value={equipment?.oil_type ?? "-"} />
                <Spec
                  label="Season"
                  value={
                    normalizeEquipmentSeason(equipment?.season) ??
                    inferEquipmentSeason(equipment?.equipment_type, equipment?.name, equipment?.id)
                  }
                />
                <Spec
                  label="Current Hours"
                  value={
                    typeof equipment?.current_hours === "number"
                      ? equipment.current_hours.toLocaleString()
                      : "-"
                  }
                />
                <Spec label="Asset ID" value={displayAssetId} />
              </div>
            )}
          </div>
        </details>
      </div>
    </main>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ opacity: 0.7, fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 900, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}
