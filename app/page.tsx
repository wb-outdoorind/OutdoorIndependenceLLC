import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import HomeDashboardCard from "@/components/home/HomeDashboardCard";
import RoleViewBanner from "@/components/home/RoleViewBanner";
import { ROLE_VIEW_COOKIE, resolveEffectiveRole } from "@/lib/roleView";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { canAccessRoute } from "@/lib/routeAccess";
import { MAINTENANCE_ACTIVE_STATUSES } from "@/lib/maintenanceStatus";
import {
  isManagementRole,
  isMechanicOrHigher,
  isTeammateRole,
  TEAMMATE_ROLES,
} from "@/lib/roles";

export const dynamic = "force-dynamic";

const baseTiles = [
  { title: "Scan QR Code", href: "/scan", desc: "Scan an asset QR code to pull it up fast" },
  { title: "Vehicles", href: "/vehicles", desc: "Vehicle info, inspections, and maintenance" },
  { title: "Equipment", href: "/equipment", desc: "Track equipment records, specs, and history" },
  { title: "Forms", href: "/forms", desc: "Create blank forms and review submission history" },
  { title: "Inventory", href: "/inventory?filter=low", desc: "Parts, stock levels, reorder tracking" },
  { title: "Notifications", href: "/notifications", desc: "Inbox for alerts, accountability, and digests" },
  { title: "OI Academy", href: "/academy", desc: "SOP PDFs and training videos" },
  { title: "Teammates", href: "/employees", desc: "Team list, roles, and permissions" },
];

type InventoryLowStockRow = {
  quantity: number;
  minimum_quantity: number;
};

type ProfileRow = {
  role: string | null;
  full_name: string | null;
  email: string | null;
};

type VehicleRequestRow = {
  status: string | null;
  urgency: string | null;
  description: string | null;
};

type EquipmentRequestRow = {
  status: string | null;
  urgency: string | null;
  description: string | null;
};

type GradeRow = {
  score: number | null;
  accountability_flag: boolean | null;
};

type TeammateGradeRow = {
  score: number | null;
  submitted_at: string;
  submitted_by: string | null;
  is_complete: boolean | null;
  accountability_flag: boolean | null;
  accountability_reason: string | null;
  form_type: string | null;
};

type InspectionRow = {
  inspection_type: string | null;
  overall_status: string | null;
  created_at: string;
  checklist: unknown;
};

type ActiveUsageInspectionRow = {
  vehicle_id: string;
  inspection_type: string | null;
  created_at: string;
  checklist: unknown;
};

type PostTripDraftRow = {
  vehicle_id: string;
  inspection_type: string | null;
  updated_at: string;
  draft: unknown;
};

type ActiveFieldAssignment = {
  key: string;
  employeeNames: string;
  vehicleId: string;
  truckLabel: string;
  trailerLabel: string;
  equipmentLabel: string;
  preTripAt: string;
};

type DashboardData = {
  title: string;
  subtitle: string;
  stats: Array<{ label: string; value: string }>;
  actions: Array<{ label: string; href: string }>;
};

type TeammateOpsStats = {
  daily: number;
  weekly: number;
  monthly: number;
  ytd: number;
  formCount: number;
  formVolume: {
    daily: number;
    weekly: number;
    monthly: number;
    ytd: number;
    byRole: Array<{ role: string; count: number }>;
  };
  completionQuality: {
    completeRate: number;
    flaggedRate: number;
    lateRate: number;
  };
  topMissedSections: Array<{ label: string; count: number }>;
  failToRequestLinkRate: number;
  teamHeatmap: Array<{
    name: string;
    role: string;
    avgScore: number;
    trend: "up" | "down" | "flat";
  }>;
  atRiskQueue: Array<{
    name: string;
    role: string;
    overallScore: number;
    flags: number;
  }>;
};

type SlaRunLogRow = {
  ran_at: string;
  success: boolean;
  notifications_attempted: number | null;
};

type SlaObservabilityStats = {
  runs24h: number;
  successRate7d: number;
  avgNotificationsAttempted7d: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastRunStatus: "success" | "failed" | "none";
};

type SlaDailySummary = {
  approvalOverdue: number;
  maintenanceOverdue: number;
  flaggedOverdue: number;
  unresolvedTotal: number;
};

type HomeStatusChip = {
  key: string;
  label: string;
  value: string;
  href: string;
  tone?: "default" | "warning" | "danger" | "success";
};

type HomeQuickActionCandidate = {
  key: string;
  label: string;
  href: string;
  priority: number;
};

type HomeQuickAction = {
  key: string;
  label: string;
  href: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseChecklistEmployee(checklist: unknown) {
  if (!checklist || typeof checklist !== "object") return "";
  const employee = (checklist as Record<string, unknown>).employee;
  if (typeof employee !== "string") return "";
  return employee.trim();
}

function dateKeyInTimeZone(date: Date, timeZone = "America/Chicago") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  let year = "";
  let month = "";
  let day = "";
  for (const part of parts) {
    if (part.type === "year") year = part.value;
    if (part.type === "month") month = part.value;
    if (part.type === "day") day = part.value;
  }
  if (!year || !month || !day) return date.toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
}

function deriveInspectionDateKey(checklist: unknown, fallbackIso: string) {
  const obj = asObject(checklist);
  const inspectionDate = typeof obj.inspectionDate === "string" ? obj.inspectionDate.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(inspectionDate)) return inspectionDate;
  return dateKeyInTimeZone(new Date(fallbackIso));
}

function hasDraftContent(draft: unknown) {
  const obj = asObject(draft);
  return Object.keys(obj).length > 0;
}

function parseActiveFieldDetails(checklist: unknown) {
  const obj = asObject(checklist);
  const employeeRaw = typeof obj.employee === "string" ? obj.employee.trim() : "";
  const employeeNames = employeeRaw || "Unknown teammate";

  const trailerSelection = asObject(obj.trailerSelection);
  let trailerLabel = "No Trailer";
  if (typeof trailerSelection.name === "string" && trailerSelection.name.trim()) {
    trailerLabel = trailerSelection.name.trim();
  } else if (typeof trailerSelection.id === "string" && trailerSelection.id.trim()) {
    trailerLabel = trailerSelection.id.trim();
  } else {
    const sections = asObject(obj.sections);
    const trailerSection = asObject(sections.trailer);
    if (typeof trailerSection.name === "string" && trailerSection.name.trim()) {
      trailerLabel = trailerSection.name.trim();
    }
  }

  const equipmentNames = new Set<string>();
  const sectionEquipment = asObject(obj.sectionEquipment);
  for (const rawList of Object.values(sectionEquipment)) {
    if (!Array.isArray(rawList)) continue;
    for (const row of rawList) {
      const item = asObject(row);
      const name =
        typeof item.name === "string" && item.name.trim()
          ? item.name.trim()
          : typeof item.id === "string" && item.id.trim()
            ? item.id.trim()
            : "";
      if (name) equipmentNames.add(name);
    }
  }
  const equipmentList = Array.from(equipmentNames);
  const equipmentLabel = equipmentList.length
    ? equipmentList.length <= 4
      ? equipmentList.join(", ")
      : `${equipmentList.slice(0, 4).join(", ")} +${equipmentList.length - 4} more`
    : "No Equipment";

  return { employeeNames, trailerLabel, equipmentLabel };
}

function todayDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek() {
  const d = startOfToday();
  const day = d.getDay();
  const diffToMonday = (day + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

function startOfMonth() {
  const d = startOfToday();
  d.setDate(1);
  return d;
}

function startOfYear() {
  const d = startOfToday();
  d.setMonth(0, 1);
  return d;
}

function avgScore(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

function parseInspectionMeta(checklist: unknown) {
  const obj = checklist && typeof checklist === "object" ? (checklist as Record<string, unknown>) : {};
  const employee = typeof obj.employee === "string" ? obj.employee.trim() : "";
  const inspectionDate = typeof obj.inspectionDate === "string" ? obj.inspectionDate.trim() : "";
  const failLinks =
    obj.failRequestLinks && typeof obj.failRequestLinks === "object"
      ? (obj.failRequestLinks as Record<string, unknown>)
      : {};
  let failCount = 0;
  const sections = obj.sections && typeof obj.sections === "object" ? (obj.sections as Record<string, unknown>) : {};
  for (const sectionValue of Object.values(sections)) {
    if (!sectionValue || typeof sectionValue !== "object") continue;
    const sec = sectionValue as Record<string, unknown>;
    if (sec.applicable !== true) continue;
    const items = sec.items && typeof sec.items === "object" ? (sec.items as Record<string, unknown>) : {};
    for (const v of Object.values(items)) {
      if (v === "fail") failCount += 1;
    }
  }
  const linkedFailCount = Object.values(failLinks).filter((v) => typeof v === "string" && v.trim().length > 0).length;
  return { employee, inspectionDate, failCount, linkedFailCount };
}

export default async function Home() {
  let lowStockCount = 0;
  let role: string | null = null;
  let actualRole: string | null = null;
  let tiles = [...baseTiles];
  let dashboard: DashboardData | null = null;
  let teammateOpsStats: TeammateOpsStats | null = null;
  let slaObservability: SlaObservabilityStats | null = null;
  let slaDailySummary: SlaDailySummary | null = null;
  let activeFieldAssignments: ActiveFieldAssignment[] = [];
  let canExpandDashboard = false;
  let unreadNotificationCount = 0;
  let statusChips: HomeStatusChip[] = [];
  const quickActionCandidates: HomeQuickActionCandidate[] = [];
  let quickActions: HomeQuickAction[] = [];

  try {
    const cookieStore = await cookies();
    const requestedRole = cookieStore.get(ROLE_VIEW_COOKIE)?.value ?? null;
    const supabase = await createServerSupabase();
    const supabaseAdmin = createSupabaseAdmin();
    const { data: authData } = await supabase.auth.getUser();

    let profile: ProfileRow | null = null;
    if (authData.user?.id) {
      const { data } = await supabase
        .from("profiles")
        .select("role,full_name,email")
        .eq("id", authData.user.id)
        .maybeSingle();
      profile = (data as ProfileRow | null) ?? null;
      actualRole = profile?.role ?? null;
      role = resolveEffectiveRole(profile?.role ?? null, requestedRole);
    }

    if (authData.user?.id) {
      const { count, error: unreadError } = await supabase
        .from("user_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", authData.user.id)
        .eq("is_read", false);
      if (unreadError) {
        console.error("[dashboard] failed to load unread notifications:", unreadError);
      } else {
        unreadNotificationCount = count ?? 0;
      }
    }

    const { data: inventoryRows, error: inventoryError } = await supabase
      .from("inventory_items")
      .select("quantity,minimum_quantity")
      .eq("is_active", true);

    if (inventoryError) {
      console.error("[dashboard] failed to load low stock count:", inventoryError);
    } else {
      lowStockCount = ((inventoryRows ?? []) as InventoryLowStockRow[]).filter(
        (item) => Number(item.quantity) <= Number(item.minimum_quantity)
      ).length;
    }

    if (authData.user?.id) {
      const lookbackIso = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
      const todayKey = dateKeyInTimeZone(new Date());

      const [inspectionsLiteRes, postTripDraftRes] = await Promise.all([
        supabase
          .from("inspections")
          .select("vehicle_id,inspection_type,created_at,checklist")
          .in("inspection_type", ["Pre-Trip", "Post-Trip"])
          .gte("created_at", lookbackIso)
          .order("created_at", { ascending: false })
          .limit(4000),
        supabaseAdmin
          .from("vehicle_inspection_drafts")
          .select("vehicle_id,inspection_type,updated_at,draft")
          .eq("inspection_type", "post-trip")
          .gte("updated_at", lookbackIso)
          .order("updated_at", { ascending: false })
          .limit(4000),
      ]);

      if (inspectionsLiteRes.error) {
        console.error("[dashboard] failed loading active usage inspections:", inspectionsLiteRes.error);
      }
      if (postTripDraftRes.error) {
        console.error("[dashboard] failed loading active usage drafts:", postTripDraftRes.error);
      }

      const latestInspectionByVehicleDate = new Map<string, ActiveUsageInspectionRow>();
      for (const row of (inspectionsLiteRes.data ?? []) as ActiveUsageInspectionRow[]) {
        const vehicleId = (row.vehicle_id ?? "").trim();
        if (!vehicleId) continue;
        const inspectionDateKey = deriveInspectionDateKey(row.checklist, row.created_at);
        if (inspectionDateKey !== todayKey) continue;
        const key = `${vehicleId}::${inspectionDateKey}`;
        const prev = latestInspectionByVehicleDate.get(key);
        if (!prev || new Date(row.created_at).getTime() > new Date(prev.created_at).getTime()) {
          latestInspectionByVehicleDate.set(key, row);
        }
      }

      const startedPostTripByVehicleDate = new Map<string, string>();
      for (const draftRow of (postTripDraftRes.data ?? []) as PostTripDraftRow[]) {
        const vehicleId = (draftRow.vehicle_id ?? "").trim();
        if (!vehicleId) continue;
        if (!hasDraftContent(draftRow.draft)) continue;
        const draftDateKey = deriveInspectionDateKey(draftRow.draft, draftRow.updated_at);
        if (draftDateKey !== todayKey) continue;
        const key = `${vehicleId}::${draftDateKey}`;
        const prevUpdatedAt = startedPostTripByVehicleDate.get(key);
        if (!prevUpdatedAt || new Date(draftRow.updated_at).getTime() > new Date(prevUpdatedAt).getTime()) {
          startedPostTripByVehicleDate.set(key, draftRow.updated_at);
        }
      }

      const preTripCandidates = Array.from(latestInspectionByVehicleDate.entries())
        .filter(([, row]) => (row.inspection_type ?? "").trim() === "Pre-Trip")
        .filter(([key, row]) => {
          const draftStartedAt = startedPostTripByVehicleDate.get(key);
          if (!draftStartedAt) return true;
          return new Date(draftStartedAt).getTime() < new Date(row.created_at).getTime();
        });

      const vehicleIds = Array.from(
        new Set(
          preTripCandidates
            .map(([, row]) => (row.vehicle_id ?? "").trim())
            .filter(Boolean)
        )
      );
      const vehicleLabelById = new Map<string, string>();
      if (vehicleIds.length > 0) {
        const { data: vehicleRows, error: vehicleRowsError } = await supabase
          .from("vehicles")
          .select("id,name")
          .in("id", vehicleIds);
        if (vehicleRowsError) {
          console.error("[dashboard] failed loading active usage vehicle labels:", vehicleRowsError);
        } else {
          for (const row of (vehicleRows ?? []) as Array<{ id: string; name: string | null }>) {
            const id = (row.id ?? "").trim();
            if (!id) continue;
            vehicleLabelById.set(id, row.name?.trim() || id);
          }
        }
      }

      activeFieldAssignments = preTripCandidates
        .map(([key, row]) => {
          const details = parseActiveFieldDetails(row.checklist);
          const vehicleId = (row.vehicle_id ?? "").trim();
          return {
            key,
            employeeNames: details.employeeNames,
            vehicleId,
            truckLabel: vehicleLabelById.get(vehicleId) ?? vehicleId,
            trailerLabel: details.trailerLabel,
            equipmentLabel: details.equipmentLabel,
            preTripAt: row.created_at,
          };
        })
        .sort((a, b) => new Date(b.preTripAt).getTime() - new Date(a.preTripAt).getTime());
    }

    const isLeadership = isManagementRole(role);
    const isMechanic = role === "mechanic";
    const isTeammateOpsRole = isTeammateRole(role);
    const canViewMaintenanceCenter = canAccessRoute(role, "maintenance_center");
    const canViewFertilizingOperations = canAccessRoute(role, "fertilizing_operations");
    const canViewPurchases = canAccessRoute(role, "purchases");

    if (canViewFertilizingOperations) {
      const fertilizingTile = {
        title: "Fertilizing Operations",
        href: "/fertilizing",
        desc: "Client properties, product planning, and chemical tracking workflows",
      };
      const inventoryIndex = tiles.findIndex((tile) => tile.title === "Inventory");
      tiles =
        inventoryIndex >= 0
          ? [...tiles.slice(0, inventoryIndex + 1), fertilizingTile, ...tiles.slice(inventoryIndex + 1)]
          : [...tiles, fertilizingTile];
    }

    if (canViewPurchases) {
      const purchasesTile = {
        title: "Purchases",
        href: "/purchases",
        desc: "Itemized purchase requests, approvals, AP funding, and receipts",
      };
      const notificationsIndex = tiles.findIndex((tile) => tile.title === "Notifications");
      tiles =
        notificationsIndex >= 0
          ? [...tiles.slice(0, notificationsIndex), purchasesTile, ...tiles.slice(notificationsIndex)]
          : [...tiles, purchasesTile];
    }

    if (canViewMaintenanceCenter) {
      const maintenanceTile = {
        title: "Maintenance Operations Dashboard",
        href: "/maintenance",
        desc: "Request queue, PM planning, downtime, and maintenance operations",
      };
      const notificationsIndex = tiles.findIndex((tile) => tile.title === "Notifications");
      tiles =
        notificationsIndex >= 0
          ? [...tiles.slice(0, notificationsIndex), maintenanceTile, ...tiles.slice(notificationsIndex)]
          : [...tiles, maintenanceTile];
    }

    if (canAccessRoute(role, "lead_approvals")) {
      const auditsTile = {
        title: "Audits",
        href: "/approvals",
        desc: "Review form sign-offs and pending lead approvals.",
      };
      const inventoryIndex = tiles.findIndex((tile) => tile.title === "Inventory");
      tiles =
        inventoryIndex >= 0
          ? [...tiles.slice(0, inventoryIndex), auditsTile, ...tiles.slice(inventoryIndex)]
          : [...tiles, auditsTile];
    }

    if (canAccessRoute(role, "audit_trail")) {
      tiles = [
        ...tiles,
        {
          title: "System Activity Log",
          href: "/audit",
          desc: "View system activity and change history.",
        },
      ];
    }

    if (isLeadership || isTeammateOpsRole) {
      const [gradesRes, teammateProfilesRes, inspectionsRes] = await Promise.all([
        supabase
          .from("form_submission_grades")
          .select("score,submitted_at,submitted_by,is_complete,accountability_flag,accountability_reason,form_type")
          .order("submitted_at", { ascending: false })
          .limit(4000),
        supabase
          .from("profiles")
          .select("id,full_name,email,role")
          .in("role", [...TEAMMATE_ROLES])
          .eq("status", "Active"),
        supabase
          .from("inspections")
          .select("created_at,checklist")
          .order("created_at", { ascending: false })
          .limit(4000),
      ]);

      const teammateProfiles = (teammateProfilesRes.data ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
        role?: string | null;
      }>;
      const allowed = new Set<string>();
      const roleByIdentity = new Map<string, string>();
      for (const p of teammateProfiles) {
        const roleLabel = (p.role ?? "team_member_1").replaceAll("_", " ");
        if (p.id) {
          const id = p.id.trim().toLowerCase();
          allowed.add(id);
          roleByIdentity.set(id, roleLabel);
        }
        if (p.full_name) {
          const name = p.full_name.trim().toLowerCase();
          allowed.add(name);
          roleByIdentity.set(name, roleLabel);
        }
        if (p.email) {
          const email = p.email.trim().toLowerCase();
          allowed.add(email);
          roleByIdentity.set(email, roleLabel);
        }
      }

      const gradeRows = ((gradesRes.data ?? []) as TeammateGradeRow[]).filter((row) => {
        const submittedBy = (row.submitted_by ?? "").trim().toLowerCase();
        return submittedBy && allowed.has(submittedBy);
      });
      const inspectionRows = ((inspectionsRes.data ?? []) as Array<{ created_at: string; checklist: unknown }>).filter(
        (row) => {
          const meta = parseInspectionMeta(row.checklist);
          return meta.employee && allowed.has(meta.employee.toLowerCase());
        }
      );

      const nowToday = startOfToday();
      const nowWeek = startOfWeek();
      const nowMonth = startOfMonth();
      const nowYear = startOfYear();
      const prevWeekStart = new Date(nowWeek);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);

      const dailyScores = gradeRows
        .filter((row) => new Date(row.submitted_at) >= nowToday)
        .map((row) => Number(row.score ?? 0));
      const weeklyScores = gradeRows
        .filter((row) => new Date(row.submitted_at) >= nowWeek)
        .map((row) => Number(row.score ?? 0));
      const monthlyScores = gradeRows
        .filter((row) => new Date(row.submitted_at) >= nowMonth)
        .map((row) => Number(row.score ?? 0));
      const ytdScores = gradeRows
        .filter((row) => new Date(row.submitted_at) >= nowYear)
        .map((row) => Number(row.score ?? 0));

      const byRoleMap = new Map<string, number>();
      for (const row of gradeRows) {
        const identity = (row.submitted_by ?? "").trim().toLowerCase();
        const roleLabel = roleByIdentity.get(identity) ?? "team_member_1";
        byRoleMap.set(roleLabel, (byRoleMap.get(roleLabel) ?? 0) + 1);
      }
      const byRole = Array.from(byRoleMap.entries())
        .map(([roleName, count]) => ({ role: roleName, count }))
        .sort((a, b) => b.count - a.count);

      const completedForms = gradeRows.filter((row) => row.is_complete === true).length;
      const flaggedForms = gradeRows.filter((row) => row.accountability_flag === true).length;
      const lateForms = gradeRows.filter((row) => {
        const reason = (row.accountability_reason ?? "").toLowerCase();
        return reason.includes("late") || reason.includes("not on time");
      }).length;

      const missedSectionCounts = new Map<string, number>();
      for (const row of gradeRows) {
        if (!row.accountability_reason) continue;
        const reason = row.accountability_reason.toLowerCase();
        if (!reason.includes("missing")) continue;
        const parts = row.accountability_reason.split(/[;,]/).map((part) => part.trim()).filter(Boolean);
        if (parts.length) {
          for (const part of parts) {
            const normalized = part.replace(/^missing required fields?:?/i, "").trim();
            if (!normalized) continue;
            const label = normalized.split(".")[0] || normalized;
            missedSectionCounts.set(label, (missedSectionCounts.get(label) ?? 0) + 1);
          }
        } else {
          const fallback = row.form_type || "form";
          missedSectionCounts.set(fallback, (missedSectionCounts.get(fallback) ?? 0) + 1);
        }
      }
      const topMissedSections = Array.from(missedSectionCounts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      let totalFailedItems = 0;
      let totalLinkedFailedItems = 0;
      for (const row of inspectionRows) {
        const meta = parseInspectionMeta(row.checklist);
        totalFailedItems += meta.failCount;
        totalLinkedFailedItems += Math.min(meta.linkedFailCount, meta.failCount);
      }
      const failToRequestLinkRate = pct(totalLinkedFailedItems, totalFailedItems);

      type HeatAgg = { name: string; role: string; current: number[]; previous: number[]; flags: number };
      const heatMapAgg = new Map<string, HeatAgg>();
      for (const row of gradeRows) {
        const identity = (row.submitted_by ?? "").trim().toLowerCase();
        const key = identity || "unknown";
        const current = heatMapAgg.get(key) ?? {
          name: row.submitted_by || "Unknown",
          role: roleByIdentity.get(identity) ?? "team_member_1",
          current: [],
          previous: [],
          flags: 0,
        };
        const submittedAt = new Date(row.submitted_at);
        const score = Number(row.score ?? 0);
        if (submittedAt >= nowWeek) current.current.push(score);
        else if (submittedAt >= prevWeekStart && submittedAt < nowWeek) current.previous.push(score);
        if (row.accountability_flag) current.flags += 1;
        heatMapAgg.set(key, current);
      }

      const teamHeatmap = Array.from(heatMapAgg.values())
        .map((row) => {
          const currentAvg = avgScore(row.current);
          const previousAvg = avgScore(row.previous);
          const delta = currentAvg - previousAvg;
          const trend: "up" | "down" | "flat" = delta >= 3 ? "up" : delta <= -3 ? "down" : "flat";
          return {
            name: row.name,
            role: row.role,
            avgScore: currentAvg,
            trend,
          };
        })
        .sort((a, b) => b.avgScore - a.avgScore)
        .slice(0, 12);

      const atRiskQueue = Array.from(heatMapAgg.values())
        .map((row) => {
          const formScore = avgScore(row.current.length ? row.current : row.previous);
          const overallScore = Math.max(0, Math.min(100, Math.round(formScore - row.flags * 5)));
          return {
            name: row.name,
            role: row.role,
            overallScore,
            flags: row.flags,
          };
        })
        .filter((row) => row.overallScore < 80 || row.flags > 2)
        .sort((a, b) => a.overallScore - b.overallScore || b.flags - a.flags)
        .slice(0, 10);

      teammateOpsStats = {
        daily: avgScore(dailyScores),
        weekly: avgScore(weeklyScores),
        monthly: avgScore(monthlyScores),
        ytd: avgScore(ytdScores),
        formCount: gradeRows.length,
        formVolume: {
          daily: dailyScores.length,
          weekly: weeklyScores.length,
          monthly: monthlyScores.length,
          ytd: ytdScores.length,
          byRole,
        },
        completionQuality: {
          completeRate: pct(completedForms, gradeRows.length),
          flaggedRate: pct(flaggedForms, gradeRows.length),
          lateRate: pct(lateForms, gradeRows.length),
        },
        topMissedSections,
        failToRequestLinkRate,
        teamHeatmap,
        atRiskQueue,
      };
    }
    canExpandDashboard = Boolean(isLeadership && teammateOpsStats);

    if (isMechanicOrHigher(role)) {
      tiles = [
        ...tiles,
        {
          title: "Accountability Center",
          href: "/form-reports",
          desc: "Team/member scorecards, mechanic accountability, SLA risk, and coaching actions",
        },
      ];
    }

    if (isLeadership) {
      const [vehicleReqRes, equipmentReqRes, gradesRes, slaRunsRes] = await Promise.all([
        supabase
          .from("maintenance_requests")
          .select("status,urgency")
          .in("status", MAINTENANCE_ACTIVE_STATUSES),
        supabase
          .from("equipment_maintenance_requests")
          .select("status,urgency")
          .in("status", MAINTENANCE_ACTIVE_STATUSES),
        supabase
          .from("form_submission_grades")
          .select("score,accountability_flag")
          .order("submitted_at", { ascending: false })
          .limit(400),
        supabase
          .from("sla_alert_run_logs")
          .select("ran_at,success,notifications_attempted")
          .order("ran_at", { ascending: false })
          .limit(250),
      ]);

      const vehicleReqs = (vehicleReqRes.data ?? []) as VehicleRequestRow[];
      const equipmentReqs = (equipmentReqRes.data ?? []) as EquipmentRequestRow[];
      const grades = (gradesRes.data ?? []) as GradeRow[];

      const openQueue = vehicleReqs.length + equipmentReqs.length;
      const urgentQueue = [...vehicleReqs, ...equipmentReqs].filter((row) => {
        const urgency = (row.urgency ?? "").trim();
        return urgency === "High" || urgency === "Urgent";
      }).length;
      const accountabilityFlags = grades.filter((row) => row.accountability_flag === true).length;
      const avgFormScore = grades.length
        ? Math.round(
            grades.reduce((sum, row) => sum + Number(row.score ?? 0), 0) / grades.length
          )
        : 0;
      const slaRuns = (slaRunsRes.data ?? []) as SlaRunLogRow[];
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const sevenDayMs = 7 * oneDayMs;
      const runs24h = slaRuns.filter((row) => now - new Date(row.ran_at).getTime() <= oneDayMs).length;
      const runs7d = slaRuns.filter((row) => now - new Date(row.ran_at).getTime() <= sevenDayMs);
      const success7d = runs7d.filter((row) => row.success === true).length;
      const attempted7d = runs7d.reduce(
        (sum, row) =>
          sum +
          (Number.isFinite(Number(row.notifications_attempted)) ? Number(row.notifications_attempted) : 0),
        0
      );
      const lastRun = slaRuns[0] ?? null;
      const lastSuccess = slaRuns.find((row) => row.success === true) ?? null;
      slaObservability = {
        runs24h,
        successRate7d: runs7d.length ? Math.round((success7d / runs7d.length) * 100) : 0,
        avgNotificationsAttempted7d: runs7d.length ? Math.round(attempted7d / runs7d.length) : 0,
        lastRunAt: lastRun?.ran_at ?? null,
        lastSuccessAt: lastSuccess?.ran_at ?? null,
        lastRunStatus: !lastRun ? "none" : lastRun.success ? "success" : "failed",
      };

      const startToday = new Date();
      startToday.setHours(0, 0, 0, 0);
      const { data: slaNotificationRows, error: slaNotificationError } = await supabaseAdmin
        .from("user_notifications")
        .select("kind,dedupe_key")
        .gte("created_at", startToday.toISOString())
        .is("resolved_at", null)
        .in("kind", [
          "sla_lead_approval_overdue",
          "sla_maintenance_request_overdue",
          "sla_flagged_queue_overdue",
        ])
        .limit(10000);
      if (slaNotificationError) {
        console.error("[dashboard] failed to load SLA daily summary:", slaNotificationError);
      } else {
        const uniqueByDedupe = new Map<string, string>();
        for (const row of (slaNotificationRows ?? []) as Array<{ kind: string; dedupe_key: string }>) {
          if (!row?.dedupe_key || !row?.kind) continue;
          if (!uniqueByDedupe.has(row.dedupe_key)) {
            uniqueByDedupe.set(row.dedupe_key, row.kind);
          }
        }
        let approvalOverdue = 0;
        let maintenanceOverdue = 0;
        let flaggedOverdue = 0;
        for (const kind of uniqueByDedupe.values()) {
          if (kind === "sla_lead_approval_overdue") approvalOverdue += 1;
          else if (kind === "sla_maintenance_request_overdue") maintenanceOverdue += 1;
          else if (kind === "sla_flagged_queue_overdue") flaggedOverdue += 1;
        }
        slaDailySummary = {
          approvalOverdue,
          maintenanceOverdue,
          flaggedOverdue,
          unresolvedTotal: uniqueByDedupe.size,
        };
      }

      statusChips = [
        {
          key: "open-queue",
          label: "Open Queue",
          value: String(openQueue),
          href: "/maintenance?section=queue&queueTab=Open",
          tone: openQueue > 0 ? "warning" : "default",
        },
        {
          key: "urgent-queue",
          label: "High/Urgent",
          value: String(urgentQueue),
          href: "/maintenance?section=queue&queueTab=Open&urgency=High,Urgent",
          tone: urgentQueue > 0 ? "danger" : "default",
        },
        {
          key: "unread-alerts",
          label: "Unread Alerts",
          value: String(unreadNotificationCount),
          href: "/notifications?unread=1&range=today",
          tone: unreadNotificationCount > 0 ? "danger" : "default",
        },
        {
          key: "low-stock",
          label: "Low Stock",
          value: String(lowStockCount),
          href: "/inventory?filter=low",
          tone: lowStockCount > 0 ? "warning" : "default",
        },
      ];

      if (urgentQueue > 0) {
        quickActionCandidates.push({
          key: "resolve-urgent-queue",
          label: `Resolve ${urgentQueue} High/Urgent Request${urgentQueue === 1 ? "" : "s"}`,
          href: "/maintenance?section=queue&queueTab=Open&urgency=High,Urgent",
          priority: 1,
        });
      }
      if ((slaDailySummary?.unresolvedTotal ?? 0) > 0) {
        quickActionCandidates.push({
          key: "triage-sla-alerts",
          label: `Triage ${slaDailySummary?.unresolvedTotal ?? 0} SLA Alert${(slaDailySummary?.unresolvedTotal ?? 0) === 1 ? "" : "s"}`,
          href: "/notifications?slaStatus=open",
          priority: 2,
        });
      }
      if (accountabilityFlags > 0) {
        quickActionCandidates.push({
          key: "review-accountability-flags",
          label: `Review ${accountabilityFlags} Accountability Flag${accountabilityFlags === 1 ? "" : "s"}`,
          href: "/form-reports?flagged=open",
          priority: 3,
        });
      }
      if (lowStockCount > 0) {
        quickActionCandidates.push({
          key: "resolve-low-stock",
          label: `Reorder ${lowStockCount} Low-Stock Item${lowStockCount === 1 ? "" : "s"}`,
          href: "/inventory?filter=low",
          priority: 4,
        });
      }
      if (unreadNotificationCount > 0) {
        quickActionCandidates.push({
          key: "review-unread-alerts",
          label: `Review ${unreadNotificationCount} Unread Alert${unreadNotificationCount === 1 ? "" : "s"}`,
          href: "/notifications?unread=1&range=today",
          priority: 5,
        });
      }

      dashboard = {
        title: "Maintenance Operations Dashboard",
        subtitle:
          role === "office_admin"
            ? "Live operations overview for office administration."
            : "Live operations overview for leadership.",
        stats: [
          { label: "Open Queue", value: String(openQueue) },
          { label: "High/Urgent", value: String(urgentQueue) },
          { label: "Low Stock", value: String(lowStockCount) },
          { label: "Avg Form Score", value: `${avgFormScore}%` },
          { label: "Accountability Flags", value: String(accountabilityFlags) },
        ],
        actions: [],
      };
    } else if (isMechanic) {
      const [vehicleReqRes, equipmentReqRes] = await Promise.all([
        supabase
          .from("maintenance_requests")
          .select("status,urgency")
          .in("status", MAINTENANCE_ACTIVE_STATUSES),
        supabase
          .from("equipment_maintenance_requests")
          .select("status,urgency")
          .in("status", MAINTENANCE_ACTIVE_STATUSES),
      ]);

      const vehicleReqs = (vehicleReqRes.data ?? []) as VehicleRequestRow[];
      const equipmentReqs = (equipmentReqRes.data ?? []) as EquipmentRequestRow[];
      const openQueue = vehicleReqs.length + equipmentReqs.length;
      const urgentQueue = [...vehicleReqs, ...equipmentReqs].filter((row) => {
        const urgency = (row.urgency ?? "").trim();
        return urgency === "High" || urgency === "Urgent";
      }).length;

      statusChips = [
        {
          key: "open-queue",
          label: "Open Queue",
          value: String(openQueue),
          href: "/maintenance?section=queue&queueTab=Open",
          tone: openQueue > 0 ? "warning" : "default",
        },
        {
          key: "urgent-queue",
          label: "High/Urgent",
          value: String(urgentQueue),
          href: "/maintenance?section=queue&queueTab=Open&urgency=High,Urgent",
          tone: urgentQueue > 0 ? "danger" : "default",
        },
        {
          key: "unread-alerts",
          label: "Unread Alerts",
          value: String(unreadNotificationCount),
          href: "/notifications?unread=1&range=today",
          tone: unreadNotificationCount > 0 ? "danger" : "default",
        },
        {
          key: "low-stock",
          label: "Low Stock",
          value: String(lowStockCount),
          href: "/inventory?filter=low",
          tone: lowStockCount > 0 ? "warning" : "default",
        },
      ];

      if (urgentQueue > 0) {
        quickActionCandidates.push({
          key: "mechanic-urgent-queue",
          label: `Resolve ${urgentQueue} High/Urgent Request${urgentQueue === 1 ? "" : "s"}`,
          href: "/maintenance?section=queue&queueTab=Open&urgency=High,Urgent",
          priority: 1,
        });
      }
      if (openQueue > 0) {
        quickActionCandidates.push({
          key: "mechanic-open-queue",
          label: `Process ${openQueue} Open Request${openQueue === 1 ? "" : "s"}`,
          href: "/maintenance?section=queue&queueTab=Open",
          priority: 2,
        });
      }
      if (lowStockCount > 0) {
        quickActionCandidates.push({
          key: "mechanic-low-stock",
          label: `Reorder ${lowStockCount} Low-Stock Item${lowStockCount === 1 ? "" : "s"}`,
          href: "/inventory?filter=low",
          priority: 3,
        });
      }
      if (unreadNotificationCount > 0) {
        quickActionCandidates.push({
          key: "mechanic-unread-alerts",
          label: `Review ${unreadNotificationCount} Unread Alert${unreadNotificationCount === 1 ? "" : "s"}`,
          href: "/notifications?unread=1&range=today",
          priority: 4,
        });
      }

      dashboard = {
        title: "Mechanic Dashboard",
        subtitle: "Active queue, priority issues, and parts risk.",
        stats: [
          { label: "Open Queue", value: String(openQueue) },
          { label: "High/Urgent", value: String(urgentQueue) },
          { label: "Low Stock Parts", value: String(lowStockCount) },
        ],
        actions: [],
      };
    } else if (isTeammateOpsRole) {
      const todayForms = teammateOpsStats?.formVolume.daily ?? 0;
      const weekForms = teammateOpsStats?.formVolume.weekly ?? 0;
      const trackedForms = teammateOpsStats?.formCount ?? 0;
      const todayAvg = teammateOpsStats?.daily ?? 0;

      statusChips = [
        {
          key: "today-forms",
          label: "Forms Today",
          value: String(todayForms),
          href: "/forms?type=pre_post&scope=mine",
          tone: todayForms > 0 ? "success" : "warning",
        },
        {
          key: "week-forms",
          label: "Forms This Week",
          value: String(weekForms),
          href: "/forms?scope=mine",
          tone: weekForms > 0 ? "success" : "default",
        },
        {
          key: "unread-alerts",
          label: "Unread Alerts",
          value: String(unreadNotificationCount),
          href: "/notifications?unread=1&range=today",
          tone: unreadNotificationCount > 0 ? "danger" : "default",
        },
        {
          key: "tracked-forms",
          label: "Tracked Forms",
          value: String(trackedForms),
          href: "/forms?scope=mine",
          tone: "default",
        },
      ];

      if (todayForms === 0) {
        quickActionCandidates.push({
          key: "start-today-form",
          label: "Start Today’s First Form",
          href: "/scan",
          priority: 1,
        });
      }
      if (todayAvg < 85 && todayForms > 0) {
        quickActionCandidates.push({
          key: "review-today-score",
          label: `Review Today’s ${todayAvg}% Form Score`,
          href: "/forms?scope=mine",
          priority: 2,
        });
      }
      if (unreadNotificationCount > 0) {
        quickActionCandidates.push({
          key: "teammate-unread-alerts",
          label: `Review ${unreadNotificationCount} Unread Alert${unreadNotificationCount === 1 ? "" : "s"}`,
          href: "/notifications?unread=1&range=today",
          priority: 3,
        });
      }

      dashboard = {
        title: "Teammate Operations Dashboard",
        subtitle: "Average form score metrics for apprentice through team lead 2 roles.",
        stats: [
          { label: "Today Avg Score", value: `${teammateOpsStats?.daily ?? 0}%` },
          { label: "Week Avg Score", value: `${teammateOpsStats?.weekly ?? 0}%` },
          { label: "Month Avg Score", value: `${teammateOpsStats?.monthly ?? 0}%` },
          { label: "YTD Avg Score", value: `${teammateOpsStats?.ytd ?? 0}%` },
          { label: "Tracked Forms", value: String(teammateOpsStats?.formCount ?? 0) },
        ],
        actions: [],
      };
    } else {
      const teammateName =
        (profile?.full_name || "").trim() ||
        ((profile?.email || "").split("@")[0] || "").trim();
      const teammateNeedle = teammateName.toLowerCase();
      const today = todayDateKey();

      const [inspectionsRes, vehicleReqRes, equipmentReqRes] = await Promise.all([
        supabase
          .from("inspections")
          .select("inspection_type,overall_status,created_at,checklist")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("maintenance_requests")
          .select("status,description")
          .in("status", MAINTENANCE_ACTIVE_STATUSES)
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("equipment_maintenance_requests")
          .select("status,description")
          .in("status", MAINTENANCE_ACTIVE_STATUSES)
          .order("created_at", { ascending: false })
          .limit(300),
      ]);

      const inspections = (inspectionsRes.data ?? []) as InspectionRow[];
      const vehicleReqs = (vehicleReqRes.data ?? []) as VehicleRequestRow[];
      const equipmentReqs = (equipmentReqRes.data ?? []) as EquipmentRequestRow[];

      const myTodayInspections = inspections.filter((row) => {
        if (!row.created_at.startsWith(today)) return false;
        const employee = parseChecklistEmployee(row.checklist).toLowerCase();
        if (!employee || !teammateNeedle) return false;
        return employee === teammateNeedle;
      });

      const preTripToday = myTodayInspections.filter(
        (row) => (row.inspection_type ?? "").trim() === "Pre-Trip"
      ).length;
      const postTripToday = myTodayInspections.filter(
        (row) => (row.inspection_type ?? "").trim() === "Post-Trip"
      ).length;
      const issueReportsToday = myTodayInspections.filter((row) => {
        const s = (row.overall_status ?? "").trim();
        return s === "Fail - Maintenance Required" || s === "Out of Service";
      }).length;

      const myOpenVehicleRequests = vehicleReqs.filter((row) =>
        (row.description ?? "").toLowerCase().includes(`teammate: ${teammateNeedle}`)
      ).length;
      const myOpenEquipmentRequests = equipmentReqs.filter((row) =>
        (row.description ?? "").toLowerCase().includes(`teammate: ${teammateNeedle}`)
      ).length;
      const myOpenRequests = myOpenVehicleRequests + myOpenEquipmentRequests;

      statusChips = [
        {
          key: "pretrip-today",
          label: "Pre-Trips Today",
          value: String(preTripToday),
          href: "/forms?type=pre_post&scope=mine",
          tone: preTripToday > 0 ? "success" : "warning",
        },
        {
          key: "posttrip-today",
          label: "Post-Trips Today",
          value: String(postTripToday),
          href: "/forms?type=pre_post&scope=mine",
          tone: postTripToday > 0 ? "success" : "warning",
        },
        {
          key: "issues-reported",
          label: "Issues Reported",
          value: String(issueReportsToday),
          href: "/forms?type=pre_post&scope=mine",
          tone: issueReportsToday > 0 ? "warning" : "default",
        },
        {
          key: "unread-alerts",
          label: "Unread Alerts",
          value: String(unreadNotificationCount),
          href: "/notifications?unread=1&range=today",
          tone: unreadNotificationCount > 0 ? "danger" : "default",
        },
      ];

      if (preTripToday === 0) {
        quickActionCandidates.push({
          key: "complete-pretrip",
          label: "Complete Pre-Trip Inspection",
          href: "/scan",
          priority: 1,
        });
      }
      if (preTripToday > 0 && postTripToday === 0) {
        quickActionCandidates.push({
          key: "complete-posttrip",
          label: "Complete Post-Trip Inspection",
          href: "/forms?type=post_trip&scope=mine",
          priority: 2,
        });
      }
      if (myOpenRequests > 0) {
        quickActionCandidates.push({
          key: "track-open-requests",
          label: `Track ${myOpenRequests} Open Request${myOpenRequests === 1 ? "" : "s"}`,
          href: "/notifications?search=maintenance",
          priority: 3,
        });
      }
      if (unreadNotificationCount > 0) {
        quickActionCandidates.push({
          key: "employee-unread-alerts",
          label: `Review ${unreadNotificationCount} Unread Alert${unreadNotificationCount === 1 ? "" : "s"}`,
          href: "/notifications?unread=1&range=today",
          priority: 4,
        });
      }

      dashboard = {
        title: "Teammate Dashboard",
        subtitle: "Today’s completion status and your active issues.",
        stats: [
          { label: "Pre-Trips Today", value: String(preTripToday) },
          { label: "Post-Trips Today", value: String(postTripToday) },
          { label: "Issues Reported Today", value: String(issueReportsToday) },
          {
            label: "Your Open Requests",
            value: String(myOpenRequests),
          },
        ],
        actions: [],
      };
    }

    quickActions = quickActionCandidates
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 3)
      .map((candidate) => ({
        key: candidate.key,
        label: candidate.label,
        href: candidate.href,
      }));

    const auditIndex = tiles.findIndex((tile) => tile.href === "/audit");
    if (auditIndex >= 0 && auditIndex !== tiles.length - 1) {
      const [auditTile] = tiles.splice(auditIndex, 1);
      if (auditTile) tiles.push(auditTile);
    }
  } catch (error) {
    console.error("[dashboard] unexpected dashboard load error:", error);
  }

  const effectiveRole = role ?? "employee";
  const primaryTitles = new Set<string>([
    "Scan QR Code",
    "Vehicles",
    "Equipment",
    "Forms",
    "Inventory",
    "Maintenance Operations Dashboard",
  ]);
  if (effectiveRole === "owner" || effectiveRole === "operations_manager") {
    primaryTitles.add("Fertilizing Operations");
  }
  const primaryTiles = tiles.filter((tile) => primaryTitles.has(tile.title));
  const secondaryTiles = tiles.filter((tile) => !primaryTitles.has(tile.title));
  const tier1Titles = new Set<string>([
    "Vehicles",
    "Equipment",
    "Maintenance Operations Dashboard",
  ]);
  const tier1PrimaryTiles = primaryTiles.filter((tile) => tier1Titles.has(tile.title));
  const tier2PrimaryTiles = primaryTiles.filter((tile) => !tier1Titles.has(tile.title));
  const orderedPrimaryTiles = [...tier1PrimaryTiles, ...tier2PrimaryTiles];

  return (
    <main
      style={{
        padding: "calc(40px + env(safe-area-inset-top)) 20px 28px 8px",
        maxWidth: 1100,
        margin: "0 auto",
        color: "var(--foreground)",
        background: "var(--background)",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <Image
          src="/App_Logo.png"
          alt="Outdoor Independence logo"
          width={300}
          height={56}
          className="brand-logo"
          style={{ height: 56, width: "auto", objectFit: "contain" }}
        />
        <Link href="/settings" style={headerButtonStyle}>
          Settings
        </Link>
      </div>
      <h1 style={{ margin: "6px 0 10px", textAlign: "center" }}>Home</h1>
      <p style={{ opacity: 0.75, marginTop: 0 }}>
        Choose a section to manage assets and operations.
      </p>
      <RoleViewBanner actualRole={actualRole} effectiveRole={role} />

      <section style={homePriorityGroupStyle}>
        {quickActions.length > 0 ? (
          <section style={doThisNowSectionStyle}>
            <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 900, marginBottom: 10 }}>Do This Now</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {quickActions.map((action, index) => (
                <Link
                  key={action.key}
                  href={action.href}
                  style={quickActionStyle(index === 0)}
                  className={`home-quick-action${index === 0 ? " primary" : ""}`}
                >
                  {index === 0 ? <span aria-hidden="true">⚠</span> : <span aria-hidden="true">•</span>}
                  <span>{action.label}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {statusChips.length > 0 ? (
          <section style={{ marginTop: quickActions.length > 0 ? 10 : 2 }}>
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800, marginBottom: 8 }}>Today Status</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {statusChips.map((chip) => (
                <Link
                  key={chip.key}
                  href={chip.href}
                  style={statusChipStyle(chip.tone)}
                  className="home-status-chip"
                >
                  <span style={{ fontSize: 11, opacity: 0.8 }} aria-hidden="true">↗</span>
                  <span style={{ opacity: 0.74, fontWeight: 700 }}>{chip.label}</span>
                  <span style={{ fontWeight: 900, fontSize: 14 }}>{chip.value}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 10 }}>Primary Modules</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {orderedPrimaryTiles.map((t) => {
              const isTier1 = tier1Titles.has(t.title);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  style={moduleTileStyle(isTier1 ? "tier1" : "tier2")}
                  className={isTier1 ? "home-module-tier1" : "home-module-tier2"}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: isTier1 ? 18 : 16, fontWeight: 800 }}>{t.title}</div>
                    {t.title === "Inventory" && lowStockCount > 0 ? (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#ffdfdf",
                          background: "rgba(190,40,40,0.45)",
                          border: "1px solid rgba(255,120,120,0.6)",
                          borderRadius: 999,
                          padding: "3px 9px",
                        }}
                      >
                        {lowStockCount} Low
                      </div>
                    ) : role === "apprentice" && t.title === "Maintenance Operations Dashboard" ? (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.16)",
                          background: "rgba(255,255,255,0.08)",
                          padding: "3px 9px",
                        }}
                      >
                        View Only
                      </div>
                    ) : null}
                  </div>
                  <div style={{ opacity: 0.8, marginTop: 7, lineHeight: 1.35, fontSize: isTier1 ? 14 : 13 }}>
                    {t.desc}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </section>

      {dashboard ? (
        <section style={{ marginTop: 14, opacity: 0.86 }}>
          <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 6, opacity: 0.72 }}>Operational Insights</div>
          <HomeDashboardCard
            dashboard={dashboard}
            teammateOpsStats={teammateOpsStats}
            canExpandDashboard={canExpandDashboard}
            slaObservability={slaObservability}
            slaDailySummary={slaDailySummary}
            activeFieldAssignments={activeFieldAssignments}
            showActions={false}
            compact
          />
        </section>
      ) : null}

      {secondaryTiles.length > 0 ? (
        <section style={{ marginTop: 34 }}>
          <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 10, opacity: 0.9 }}>Secondary Modules</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {secondaryTiles.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                style={moduleTileStyle("secondary")}
                className="home-module-secondary"
              >
                <div style={{ fontSize: 16, fontWeight: 800 }}>{t.title}</div>
                <div style={{ opacity: 0.75, marginTop: 6, lineHeight: 1.35, fontSize: 13 }}>{t.desc}</div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

const headerButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid var(--surface-border)",
  background: "var(--surface)",
  color: "inherit",
  textDecoration: "none",
  fontWeight: 800,
};

function statusChipStyle(tone: HomeStatusChip["tone"] = "default"): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    textDecoration: "none",
    color: "inherit",
    borderRadius: 999,
    border: "1px solid var(--surface-border)",
    background: "rgba(255,255,255,0.05)",
    padding: "8px 13px",
    fontSize: 13,
    minHeight: 36,
    lineHeight: 1,
  };
  if (tone === "danger") {
    return {
      ...base,
      border: "1px solid rgba(255,120,120,0.45)",
      background: "rgba(120,20,20,0.35)",
    };
  }
  if (tone === "warning") {
    return {
      ...base,
      border: "1px solid rgba(255,215,120,0.45)",
      background: "rgba(120,96,20,0.28)",
    };
  }
  if (tone === "success") {
    return {
      ...base,
      border: "1px solid rgba(126,255,167,0.45)",
      background: "rgba(16,84,41,0.3)",
    };
  }
  return base;
}

function quickActionStyle(primary: boolean): React.CSSProperties {
  if (primary) {
    return {
      padding: "10px 14px",
      borderRadius: 12,
      border: "1px solid rgba(255,215,120,0.7)",
      background:
        "linear-gradient(180deg, rgba(120,96,20,0.55) 0%, rgba(120,96,20,0.34) 100%)",
      boxShadow: "0 12px 28px rgba(0,0,0,0.32)",
      color: "inherit",
      textDecoration: "none",
      fontWeight: 900,
      fontSize: 14,
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
    };
  }
  return {
    padding: "9px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,215,120,0.38)",
    background: "rgba(120,96,20,0.2)",
    color: "inherit",
    textDecoration: "none",
    fontWeight: 800,
    fontSize: 13,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };
}

function moduleTileStyle(tier: "tier1" | "tier2" | "secondary"): React.CSSProperties {
  if (tier === "tier1") {
    return {
      border: "1px solid var(--surface-border-strong)",
      borderRadius: 16,
      padding: 20,
      textDecoration: "none",
      color: "inherit",
      background: "var(--surface-elevated)",
      boxShadow: "var(--shadow-soft)",
    };
  }
  if (tier === "tier2") {
    return {
      border: "1px solid var(--surface-border)",
      borderRadius: 15,
      padding: 15,
      textDecoration: "none",
      color: "inherit",
      background: "var(--surface)",
    };
  }
  return {
    border: "1px solid var(--surface-border)",
    borderRadius: 14,
    padding: 13,
    textDecoration: "none",
    color: "inherit",
    background: "rgba(255,255,255,0.02)",
    opacity: 0.94,
  };
}

const homePriorityGroupStyle: React.CSSProperties = {
  marginTop: 8,
  border: "1px solid var(--surface-border)",
  borderRadius: 18,
  background: "rgba(255,255,255,0.025)",
  padding: 14,
};

const doThisNowSectionStyle: React.CSSProperties = {
  border: "1px solid rgba(255,215,120,0.5)",
  borderRadius: 14,
  padding: 12,
  background:
    "linear-gradient(180deg, rgba(120,96,20,0.34) 0%, rgba(120,96,20,0.2) 100%)",
  boxShadow: "0 12px 30px rgba(0,0,0,0.3)",
};
