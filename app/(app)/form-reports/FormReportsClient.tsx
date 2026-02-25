"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import AccountabilityTrackerPanel from "@/components/accountability/AccountabilityTrackerPanel";

type ScorePeriod = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

type GradeRow = {
  id: number;
  form_type: string;
  form_id: string;
  submitted_at: string;
  submitted_by: string | null;
  vehicle_id: string | null;
  equipment_id: string | null;
  score: number;
  is_complete: boolean;
  has_na: boolean;
  missing_count: number;
  missing_fields: unknown;
  accountability_flag: boolean;
  accountability_reason: string | null;
  metadata: unknown;
};

type MaintenanceLogScoreRow = {
  id: string;
  created_at: string;
  created_by: string | null;
  request_id: string | null;
  mechanic_self_score: number | null;
  notes: string | null;
  status_update: string | null;
};

type InspectionRow = {
  id: string;
  created_at: string;
  overall_status: string | null;
  checklist: unknown;
};

type RequestRow = {
  id: string;
  created_at: string;
  vehicle_id: string | null;
  equipment_id: string | null;
  urgency: string | null;
  system_affected: string | null;
  status: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type FormGradeLikeRow = {
  id: number;
  grade_id: number;
  user_id: string;
};

type FormGradeReviewRow = {
  id: number;
  grade_id: number;
  review_status: "open" | "in_review" | "resolved";
  owner_id: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type FormGradeReviewEventRow = {
  id: number;
  grade_id: number;
  actor_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  from_owner_id: string | null;
  to_owner_id: string | null;
  note: string | null;
  created_at: string;
};

type PersonScoreRow = {
  key: string;
  userId: string | null;
  name: string;
  role: string | null;
  forms: number;
  avgFormScore: number;
  onTimeRate: number;
  failLinkRate: number;
  formFlags: number;
  incompleteForms: number;
  logs: number;
  mechanicObjectiveScore: number;
  linkageRate: number;
  closureRate: number;
  overallScore: number;
};

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
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

function getPeriodStart(period: ScorePeriod) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "daily") return start;
  if (period === "weekly") {
    const day = start.getDay();
    const diffToMonday = (day + 6) % 7;
    start.setDate(start.getDate() - diffToMonday);
    return start;
  }
  if (period === "monthly") {
    start.setDate(1);
    return start;
  }
  if (period === "quarterly") {
    const month = start.getMonth();
    const quarterStart = Math.floor(month / 3) * 3;
    start.setMonth(quarterStart, 1);
    return start;
  }
  start.setMonth(0, 1);
  return start;
}

function inPeriod(iso: string, period: ScorePeriod) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d >= getPeriodStart(period);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizedPersonKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function mechanicScoreBand(score: number) {
  if (score <= 25) return "Intervention";
  if (score <= 50) return "Needs Review";
  if (score <= 75) return "Operational";
  return "Good";
}

function maintenanceLogQualityScore(log: MaintenanceLogScoreRow) {
  let objectiveScore = 100;
  if (!log.request_id) objectiveScore -= 6;
  if ((log.status_update ?? "").trim() === "In Progress") objectiveScore -= 8;
  if (!(log.status_update ?? "").trim()) objectiveScore -= 10;
  const notesLength = (log.notes ?? "").trim().length;
  if (notesLength < 20) objectiveScore -= 8;
  if (notesLength === 0) objectiveScore -= 8;
  return clampPercent(objectiveScore);
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
    const secObj = sectionValue as Record<string, unknown>;
    if (secObj.applicable !== true) continue;
    const items = secObj.items && typeof secObj.items === "object" ? (secObj.items as Record<string, unknown>) : {};
    for (const v of Object.values(items)) {
      if (v === "fail") failCount += 1;
    }
  }
  const exiting = obj.exiting && typeof obj.exiting === "object" ? (obj.exiting as Record<string, unknown>) : {};
  for (const v of Object.values(exiting)) {
    if (v === "fail") failCount += 1;
  }

  const linkedFailCount = Object.values(failLinks).filter((v) => typeof v === "string" && v.trim().length > 0).length;
  return { employee, inspectionDate, failCount, linkedFailCount };
}

export default function FormReportsClient() {
  const [period, setPeriod] = useState<ScorePeriod>("weekly");
  const [nowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLogScoreRow[]>([]);
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [vehicleRequests, setVehicleRequests] = useState<RequestRow[]>([]);
  const [equipmentRequests, setEquipmentRequests] = useState<RequestRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [gradeLikes, setGradeLikes] = useState<FormGradeLikeRow[]>([]);
  const [gradeReviews, setGradeReviews] = useState<FormGradeReviewRow[]>([]);
  const [gradeReviewEvents, setGradeReviewEvents] = useState<FormGradeReviewEventRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [likeError, setLikeError] = useState<string | null>(null);
  const [likingGradeIds, setLikingGradeIds] = useState<number[]>([]);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueBusyGradeIds, setQueueBusyGradeIds] = useState<number[]>([]);
  const [queueStatusFilter, setQueueStatusFilter] = useState<"all" | "unresolved" | "resolved">("unresolved");
  const [queueAssetFilter, setQueueAssetFilter] = useState<"all" | "vehicle" | "equipment">("all");
  const [queueTeammateFilter, setQueueTeammateFilter] = useState<string>("all");
  const [queueMineOnly, setQueueMineOnly] = useState(false);
  const [queueRecentActivityOnly, setQueueRecentActivityOnly] = useState(false);
  const [queueSelectedGradeIds, setQueueSelectedGradeIds] = useState<number[]>([]);
  const [bulkResolutionNote, setBulkResolutionNote] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [queueResolutionDraftByGrade, setQueueResolutionDraftByGrade] = useState<Record<number, string>>({});
  const [queueModalGradeId, setQueueModalGradeId] = useState<number | null>(null);
  const [selectedPersonKey, setSelectedPersonKey] = useState<string>("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      setErrorMessage(null);
      const supabase = createSupabaseBrowser();
      const [
        gradesRes,
        logsRes,
        equipmentLogsRes,
        inspectionsRes,
        vehicleReqRes,
        equipmentReqRes,
        profilesRes,
        likesRes,
        reviewsRes,
        eventsRes,
        authRes,
      ] = await Promise.all([
        supabase
          .from("form_submission_grades")
          .select("id,form_type,form_id,submitted_at,submitted_by,vehicle_id,equipment_id,score,is_complete,has_na,missing_count,missing_fields,accountability_flag,accountability_reason,metadata")
          .order("submitted_at", { ascending: false })
          .limit(1500),
        supabase
          .from("maintenance_logs")
          .select("id,created_at,created_by,request_id,mechanic_self_score,notes,status_update")
          .order("created_at", { ascending: false })
          .limit(1500),
        supabase
          .from("equipment_maintenance_logs")
          .select("id,created_at,created_by,request_id,mechanic_self_score,notes,status_update")
          .order("created_at", { ascending: false })
          .limit(1500),
        supabase
          .from("inspections")
          .select("id,created_at,overall_status,checklist")
          .order("created_at", { ascending: false })
          .limit(1500),
        supabase
          .from("maintenance_requests")
          .select("id,created_at,vehicle_id,urgency,status,system_affected")
          .order("created_at", { ascending: false })
          .limit(1500),
        supabase
          .from("equipment_maintenance_requests")
          .select("id,created_at,equipment_id,urgency,status,system_affected")
          .order("created_at", { ascending: false })
          .limit(1500),
        supabase
          .from("profiles")
          .select("id,full_name,email,role")
          .eq("status", "Active")
          .order("full_name", { ascending: true }),
        supabase
          .from("form_submission_grade_likes")
          .select("id,grade_id,user_id")
          .limit(5000),
        supabase
          .from("form_submission_grade_reviews")
          .select("id,grade_id,review_status,owner_id,resolution_note,resolved_at,created_at,updated_at")
          .limit(5000),
        supabase
          .from("form_submission_grade_review_events")
          .select("id,grade_id,actor_id,event_type,from_status,to_status,from_owner_id,to_owner_id,note,created_at")
          .order("created_at", { ascending: false })
          .limit(10000),
        supabase.auth.getUser(),
      ]);

      if (!alive) return;
      if (
        gradesRes.error ||
        logsRes.error ||
        equipmentLogsRes.error ||
        inspectionsRes.error ||
        vehicleReqRes.error ||
        equipmentReqRes.error ||
        profilesRes.error
      ) {
        setErrorMessage(
          gradesRes.error?.message ||
            logsRes.error?.message ||
            equipmentLogsRes.error?.message ||
            inspectionsRes.error?.message ||
            vehicleReqRes.error?.message ||
            equipmentReqRes.error?.message ||
            profilesRes.error?.message ||
            "Failed to load accountability data."
        );
      }

      setGrades((gradesRes.data ?? []) as GradeRow[]);
      setMaintenanceLogs([
        ...((logsRes.data ?? []) as MaintenanceLogScoreRow[]),
        ...((equipmentLogsRes.data ?? []) as MaintenanceLogScoreRow[]),
      ]);
      setInspections((inspectionsRes.data ?? []) as InspectionRow[]);
      setVehicleRequests((vehicleReqRes.data ?? []) as RequestRow[]);
      setEquipmentRequests((equipmentReqRes.data ?? []) as RequestRow[]);
      setProfiles((profilesRes.data ?? []) as ProfileRow[]);
      if (likesRes.error) {
        setLikeError(likesRes.error.message);
      } else {
        setLikeError(null);
        setGradeLikes((likesRes.data ?? []) as FormGradeLikeRow[]);
      }
      if (reviewsRes.error) {
        setQueueError(reviewsRes.error.message);
      } else {
        setQueueError(null);
        setGradeReviews((reviewsRes.data ?? []) as FormGradeReviewRow[]);
      }
      if (eventsRes.error) {
        setQueueError(eventsRes.error.message);
      } else {
        setGradeReviewEvents((eventsRes.data ?? []) as FormGradeReviewEventRow[]);
      }
      setCurrentUserId(authRes.data.user?.id ?? null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const nameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of profiles) {
      map[p.id] = p.full_name?.trim() || p.email?.trim() || p.id;
    }
    return map;
  }, [profiles]);

  const profileIdByIdentity = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profiles) {
      map.set(normalizedPersonKey(p.id), p.id);
      if (p.full_name) map.set(normalizedPersonKey(p.full_name), p.id);
      if (p.email) map.set(normalizedPersonKey(p.email), p.id);
    }
    return map;
  }, [profiles]);

  const currentUserRole = useMemo(() => {
    if (!currentUserId) return null;
    return profiles.find((p) => p.id === currentUserId)?.role ?? null;
  }, [currentUserId, profiles]);
  const canOverrideQueueOwnership =
    currentUserRole === "owner" || currentUserRole === "operations_manager";

  const periodGrades = useMemo(
    () => grades.filter((row) => inPeriod(row.submitted_at, period)),
    [grades, period]
  );

  const periodInspections = useMemo(
    () => inspections.filter((row) => inPeriod(row.created_at, period)),
    [inspections, period]
  );

  const periodLogs = useMemo(
    () => maintenanceLogs.filter((row) => inPeriod(row.created_at, period)),
    [maintenanceLogs, period]
  );

  const unifiedScoreboard = useMemo<PersonScoreRow[]>(() => {
    type AggregationRow = {
      key: string;
      userId: string | null;
      name: string;
      role: string | null;
      forms: number;
      formScoreTotal: number;
      formFlags: number;
      incompleteForms: number;
      inspections: number;
      onTime: number;
      failCount: number;
      linkedFailCount: number;
      logs: number;
      mechanicScoreTotal: number;
      withRequest: number;
      closed: number;
    };

    const rows = new Map<string, AggregationRow>();
    const keyByDisplay = new Map<string, string>();

    const ensureRow = (key: string, defaults: Partial<AggregationRow> = {}) => {
      const existing = rows.get(key);
      if (existing) return existing;
      const created: AggregationRow = {
        key,
        userId: defaults.userId ?? null,
        name: defaults.name ?? "Unknown",
        role: defaults.role ?? null,
        forms: 0,
        formScoreTotal: 0,
        formFlags: 0,
        incompleteForms: 0,
        inspections: 0,
        onTime: 0,
        failCount: 0,
        linkedFailCount: 0,
        logs: 0,
        mechanicScoreTotal: 0,
        withRequest: 0,
        closed: 0,
      };
      rows.set(key, created);
      return created;
    };

    for (const p of profiles) {
      const key = `uid:${p.id}`;
      const displayName = p.full_name?.trim() || p.email?.trim() || p.id;
      ensureRow(key, { userId: p.id, name: displayName, role: p.role ?? null });
      keyByDisplay.set(normalizedPersonKey(displayName), key);
      keyByDisplay.set(normalizedPersonKey(p.id), key);
      if (p.email) keyByDisplay.set(normalizedPersonKey(p.email), key);
    }

    const resolveByDisplay = (raw: string | null | undefined) => {
      const cleaned = (raw ?? "").trim();
      if (!cleaned) return ensureRow("name:unknown", { name: "Unknown" });
      const normalized = normalizedPersonKey(cleaned);
      const existingKey = keyByDisplay.get(normalized);
      if (existingKey) return ensureRow(existingKey);
      const fallbackKey = `name:${normalized}`;
      const created = ensureRow(fallbackKey, { name: cleaned });
      keyByDisplay.set(normalized, fallbackKey);
      return created;
    };

    for (const row of periodGrades) {
      const target = resolveByDisplay(row.submitted_by);
      target.forms += 1;
      target.formScoreTotal += Number(row.score ?? 0);
      if (row.accountability_flag) target.formFlags += 1;
      if (!row.is_complete) target.incompleteForms += 1;
    }

    for (const row of periodInspections) {
      const meta = parseInspectionMeta(row.checklist);
      const target = resolveByDisplay(meta.employee);
      target.inspections += 1;
      if (meta.inspectionDate && row.created_at.slice(0, 10) === meta.inspectionDate) {
        target.onTime += 1;
      }
      target.failCount += meta.failCount;
      target.linkedFailCount += Math.min(meta.linkedFailCount, meta.failCount);
    }

    for (const row of periodLogs) {
      const target = resolveByDisplay(row.created_by);
      target.logs += 1;
      target.mechanicScoreTotal += maintenanceLogQualityScore(row);
      if (row.request_id) target.withRequest += 1;
      if ((row.status_update ?? "").trim() === "Closed") target.closed += 1;
    }

    return Array.from(rows.values())
      .filter((row) => row.forms > 0 || row.logs > 0 || row.inspections > 0)
      .map((row) => {
        const avgFormScore = row.forms ? Math.round(row.formScoreTotal / row.forms) : 0;
        const onTimeRate = row.inspections ? Math.round((row.onTime / row.inspections) * 100) : 100;
        const failLinkRate = row.failCount ? Math.round((row.linkedFailCount / row.failCount) * 100) : 100;
        const mechanicObjectiveScore = row.logs ? Math.round(row.mechanicScoreTotal / row.logs) : 0;
        const linkageRate = row.logs ? Math.round((row.withRequest / row.logs) * 100) : 100;
        const closureRate = row.logs ? Math.round((row.closed / row.logs) * 100) : 100;

        const formsComposite = clampPercent(
          avgFormScore * 0.5 +
            onTimeRate * 0.25 +
            failLinkRate * 0.25 -
            row.formFlags * 8 -
            row.incompleteForms * 4
        );
        const mechanicComposite = clampPercent(
          mechanicObjectiveScore * 0.6 + linkageRate * 0.2 + closureRate * 0.2
        );

        const overallScore = clampPercent(
          formsComposite * 0.6 + mechanicComposite * 0.4
        );

        return {
          key: row.key,
          userId: row.userId,
          name: row.name,
          role: row.role,
          forms: row.forms,
          avgFormScore,
          onTimeRate,
          failLinkRate,
          formFlags: row.formFlags,
          incompleteForms: row.incompleteForms,
          logs: row.logs,
          mechanicObjectiveScore,
          linkageRate,
          closureRate,
          overallScore,
        };
      })
      .sort((a, b) => b.overallScore - a.overallScore || b.forms + b.logs - (a.forms + a.logs));
  }, [periodGrades, periodInspections, periodLogs, profiles]);

  const effectiveSelectedPersonKey = useMemo(() => {
    if (!unifiedScoreboard.length) return "";
    if (selectedPersonKey && unifiedScoreboard.some((row) => row.key === selectedPersonKey)) {
      return selectedPersonKey;
    }
    return unifiedScoreboard[0].key;
  }, [selectedPersonKey, unifiedScoreboard]);

  const selectedPerson = useMemo(
    () => unifiedScoreboard.find((row) => row.key === effectiveSelectedPersonKey) ?? null,
    [effectiveSelectedPersonKey, unifiedScoreboard]
  );

  const selectedIdentitySet = useMemo(() => {
    const values = new Set<string>();
    if (!selectedPerson) return values;
    values.add(normalizedPersonKey(selectedPerson.name));
    if (selectedPerson.userId) values.add(normalizedPersonKey(selectedPerson.userId));
    const matchedProfile = selectedPerson.userId
      ? profiles.find((p) => p.id === selectedPerson.userId)
      : profiles.find((p) => normalizedPersonKey(p.full_name || p.email || p.id) === normalizedPersonKey(selectedPerson.name));
    if (matchedProfile?.full_name) values.add(normalizedPersonKey(matchedProfile.full_name));
    if (matchedProfile?.email) values.add(normalizedPersonKey(matchedProfile.email));
    if (matchedProfile?.id) values.add(normalizedPersonKey(matchedProfile.id));
    return values;
  }, [profiles, selectedPerson]);

  const selectedFormRows = useMemo(() => {
    if (!selectedPerson || selectedIdentitySet.size === 0) return [];
    return periodGrades
      .filter((row) => selectedIdentitySet.has(normalizedPersonKey(row.submitted_by)))
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
      .slice(0, 20);
  }, [periodGrades, selectedIdentitySet, selectedPerson]);

  const selectedInspectionRows = useMemo(() => {
    if (!selectedPerson || selectedIdentitySet.size === 0) return [];
    return periodInspections
      .filter((row) => {
        const meta = parseInspectionMeta(row.checklist);
        return selectedIdentitySet.has(normalizedPersonKey(meta.employee));
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20);
  }, [periodInspections, selectedIdentitySet, selectedPerson]);

  const selectedLogRows = useMemo(() => {
    if (!selectedPerson || selectedIdentitySet.size === 0) return [];
    return periodLogs
      .filter((row) => {
        const byId = selectedPerson.userId && row.created_by === selectedPerson.userId;
        const byName = selectedIdentitySet.has(normalizedPersonKey(row.created_by));
        const byProfileName = row.created_by && selectedIdentitySet.has(normalizedPersonKey(nameById[row.created_by]));
        return Boolean(byId || byName || byProfileName);
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20);
  }, [nameById, periodLogs, selectedIdentitySet, selectedPerson]);

  const likeCountByGrade = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of gradeLikes) {
      map.set(row.grade_id, (map.get(row.grade_id) || 0) + 1);
    }
    return map;
  }, [gradeLikes]);

  const likedGradeIdSet = useMemo(() => {
    const set = new Set<number>();
    if (!currentUserId) return set;
    for (const row of gradeLikes) {
      if (row.user_id === currentUserId) set.add(row.grade_id);
    }
    return set;
  }, [currentUserId, gradeLikes]);

  const reviewByGradeId = useMemo(() => {
    const map = new Map<number, FormGradeReviewRow>();
    for (const row of gradeReviews) {
      map.set(row.grade_id, row);
    }
    return map;
  }, [gradeReviews]);

  const reviewEventsByGradeId = useMemo(() => {
    const map = new Map<number, FormGradeReviewEventRow[]>();
    for (const row of gradeReviewEvents) {
      const arr = map.get(row.grade_id) ?? [];
      arr.push(row);
      map.set(row.grade_id, arr);
    }
    for (const [key, rows] of map) {
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      map.set(key, rows);
    }
    return map;
  }, [gradeReviewEvents]);

  const allFlaggedQueueRows = useMemo(() => {
    return periodGrades
      .filter((row) => row.accountability_flag)
      .map((row) => {
        const review = reviewByGradeId.get(row.id);
        const reviewStatus = review?.review_status ?? "open";
        const submittedByLabel = row.submitted_by?.trim() || "Unknown";
        const submittedProfileId = profileIdByIdentity.get(normalizedPersonKey(row.submitted_by)) ?? null;
        const assetType = row.vehicle_id ? "vehicle" : row.equipment_id ? "equipment" : "none";
        const recentEvents = reviewEventsByGradeId.get(row.id) ?? [];
        return {
          row,
          review,
          reviewStatus,
          submittedByLabel,
          submittedProfileId,
          ownerName: review?.owner_id ? nameById[review.owner_id] || review.owner_id : "Unassigned",
          assetType,
          recentEvents,
        };
      });
  }, [nameById, periodGrades, profileIdByIdentity, reviewByGradeId, reviewEventsByGradeId]);

  const flaggedQueueRows = useMemo(() => {
    return allFlaggedQueueRows
      .filter((item) => {
        if (queueStatusFilter === "resolved" && item.reviewStatus !== "resolved") return false;
        if (queueStatusFilter === "unresolved" && item.reviewStatus === "resolved") return false;
        if (queueAssetFilter !== "all" && item.assetType !== queueAssetFilter) return false;
        if (queueTeammateFilter !== "all" && item.submittedByLabel !== queueTeammateFilter) return false;
        if (queueMineOnly && currentUserId && item.review?.owner_id !== currentUserId) return false;
        if (queueRecentActivityOnly) {
          const hasRecent = item.recentEvents.some(
            (event) =>
              (nowMs - new Date(event.created_at).getTime()) / (1000 * 60 * 60) <= 24 * 7
          );
          if (!hasRecent) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.row.submitted_at).getTime() - new Date(a.row.submitted_at).getTime()
      );
  }, [allFlaggedQueueRows, currentUserId, nowMs, queueAssetFilter, queueMineOnly, queueRecentActivityOnly, queueStatusFilter, queueTeammateFilter]);

  const selectedFlaggedQueueItem = useMemo(() => {
    if (!queueModalGradeId) return null;
    return allFlaggedQueueRows.find((row) => row.row.id === queueModalGradeId) ?? null;
  }, [allFlaggedQueueRows, queueModalGradeId]);

  const flaggedTeammateOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of periodGrades) {
      if (!row.accountability_flag) continue;
      set.add(row.submitted_by?.trim() || "Unknown");
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [periodGrades]);

  const flaggedQueueSummary = useMemo(() => {
    const allFlagged = periodGrades.filter((row) => row.accountability_flag);
    const openCount = allFlagged.filter((row) => {
      const status = reviewByGradeId.get(row.id)?.review_status ?? "open";
      return status !== "resolved";
    }).length;
    const unresolvedOlderThan48h = allFlagged.filter((row) => {
      const review = reviewByGradeId.get(row.id);
      const status = review?.review_status ?? "open";
      if (status === "resolved") return false;
      const basisTime = review?.created_at ?? row.submitted_at;
      const hours = (nowMs - new Date(basisTime).getTime()) / (1000 * 60 * 60);
      return hours > 48;
    }).length;
    const resolvedWithDuration = allFlagged
      .map((row) => {
        const review = reviewByGradeId.get(row.id);
        if (!review?.resolved_at) return null;
        const hours =
          (new Date(review.resolved_at).getTime() - new Date(review.created_at).getTime()) /
          (1000 * 60 * 60);
        return hours >= 0 ? hours : null;
      })
      .filter((v): v is number => typeof v === "number");
    const avgResolveHours = resolvedWithDuration.length
      ? Math.round((resolvedWithDuration.reduce((sum, v) => sum + v, 0) / resolvedWithDuration.length) * 10) / 10
      : 0;
    return { openCount, unresolvedOlderThan48h, avgResolveHours };
  }, [nowMs, periodGrades, reviewByGradeId]);

  const visibleFlaggedGradeIds = useMemo(
    () => flaggedQueueRows.map((item) => item.row.id),
    [flaggedQueueRows]
  );

  const globalRisk = useMemo(() => {
    if (!nowMs) {
      return { slaBreaches: 0, unacknowledged: 0, repeatFailures: 0, openRequests: 0 };
    }
    const requests = [...vehicleRequests, ...equipmentRequests].filter((r) => inPeriod(r.created_at, period));
    const linkedRequestIds = new Set(
      maintenanceLogs
        .filter((l) => !!l.request_id)
        .map((l) => l.request_id as string)
    );
    let slaBreaches = 0;
    let unacknowledged = 0;
    for (const req of requests) {
      const status = (req.status || "").trim();
      if (status === "Closed" || status === "Resolved") continue;
      const ageHours = (nowMs - new Date(req.created_at).getTime()) / (1000 * 60 * 60);
      const urgency = (req.urgency || "").trim();
      const maxHours = urgency === "Urgent" ? 12 : urgency === "High" ? 24 : 48;
      if (ageHours > maxHours) slaBreaches += 1;
      if (!linkedRequestIds.has(req.id) && ageHours > 24) unacknowledged += 1;
    }

    const repeatKeyCount: Record<string, number> = {};
    for (const req of requests) {
      const assetId = req.vehicle_id || req.equipment_id || "unknown";
      const system = (req.system_affected || "Other").trim();
      const key = `${assetId}::${system}`;
      repeatKeyCount[key] = (repeatKeyCount[key] || 0) + 1;
    }
    const repeatFailures = Object.values(repeatKeyCount).filter((count) => count >= 2).length;
    return { slaBreaches, unacknowledged, repeatFailures, openRequests: requests.length };
  }, [vehicleRequests, equipmentRequests, maintenanceLogs, period, nowMs]);

  const summary = useMemo(() => {
    const submissions = periodGrades.length;
    const avgScore = submissions
      ? Math.round(periodGrades.reduce((sum, row) => sum + Number(row.score ?? 0), 0) / submissions)
      : 0;
    const flags = periodGrades.filter((row) => row.accountability_flag).length;
    return { submissions, avgScore, flags };
  }, [periodGrades]);

  const selectedFlaggedMissingFields = useMemo(() => {
    if (!selectedFlaggedQueueItem) return [];
    return Array.isArray(selectedFlaggedQueueItem.row.missing_fields)
      ? selectedFlaggedQueueItem.row.missing_fields.map((v) => String(v))
      : [];
  }, [selectedFlaggedQueueItem]);

  const selectedFlaggedMetadataText = useMemo(() => {
    if (!selectedFlaggedQueueItem) return "";
    const value = selectedFlaggedQueueItem.row.metadata;
    if (!value || typeof value !== "object") return "";
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "";
    }
  }, [selectedFlaggedQueueItem]);

  async function toggleFlagLike(gradeId: number) {
    if (!currentUserId) {
      setLikeError("You must be signed in to like a flagged form.");
      return;
    }
    if (likingGradeIds.includes(gradeId)) return;
    setLikeError(null);
    setLikingGradeIds((prev) => [...prev, gradeId]);
    const supabase = createSupabaseBrowser();
    const isLiked = likedGradeIdSet.has(gradeId);
    if (isLiked) {
      const { error } = await supabase
        .from("form_submission_grade_likes")
        .delete()
        .eq("grade_id", gradeId)
        .eq("user_id", currentUserId);
      setLikingGradeIds((prev) => prev.filter((id) => id !== gradeId));
      if (error) {
        setLikeError(error.message);
        return;
      }
      setGradeLikes((prev) =>
        prev.filter((row) => !(row.grade_id === gradeId && row.user_id === currentUserId))
      );
      return;
    }

    const { data, error } = await supabase
      .from("form_submission_grade_likes")
      .insert({ grade_id: gradeId, user_id: currentUserId })
      .select("id,grade_id,user_id")
      .single();
    setLikingGradeIds((prev) => prev.filter((id) => id !== gradeId));
    if (error || !data) {
      setLikeError(error?.message || "Failed to like flagged form.");
      return;
    }
    setGradeLikes((prev) => [data as FormGradeLikeRow, ...prev]);
  }

  async function upsertGradeReview(
    gradeId: number,
    patch: Partial<Pick<FormGradeReviewRow, "review_status" | "owner_id" | "resolution_note" | "resolved_at">>,
    eventType: "assign" | "release" | "mark_in_review" | "resolve"
  ) {
    if (queueBusyGradeIds.includes(gradeId)) return;
    setQueueError(null);
    setQueueBusyGradeIds((prev) => [...prev, gradeId]);
    const existing = reviewByGradeId.get(gradeId);
    const payload = {
      grade_id: gradeId,
      review_status: (patch.review_status ?? existing?.review_status ?? "open") as "open" | "in_review" | "resolved",
      owner_id: patch.owner_id !== undefined ? patch.owner_id : existing?.owner_id ?? null,
      resolution_note:
        patch.resolution_note !== undefined ? patch.resolution_note : existing?.resolution_note ?? null,
      resolved_at: patch.resolved_at !== undefined ? patch.resolved_at : existing?.resolved_at ?? null,
    };
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase
      .from("form_submission_grade_reviews")
      .upsert(payload, { onConflict: "grade_id" })
      .select("id,grade_id,review_status,owner_id,resolution_note,resolved_at,created_at,updated_at")
      .single();
    setQueueBusyGradeIds((prev) => prev.filter((id) => id !== gradeId));
    if (error || !data) {
      setQueueError(error?.message || "Failed to update flagged queue item.");
      return;
    }
    setGradeReviews((prev) => {
      const filtered = prev.filter((row) => row.grade_id !== gradeId);
      return [data as FormGradeReviewRow, ...filtered];
    });

    if (currentUserId) {
      const eventPayload = {
        grade_id: gradeId,
        actor_id: currentUserId,
        event_type: eventType,
        from_status: existing?.review_status ?? "open",
        to_status: (data as FormGradeReviewRow).review_status,
        from_owner_id: existing?.owner_id ?? null,
        to_owner_id: (data as FormGradeReviewRow).owner_id,
        note: patch.resolution_note ?? null,
      };
      const { data: eventData, error: eventError } = await supabase
        .from("form_submission_grade_review_events")
        .insert(eventPayload)
        .select("id,grade_id,actor_id,event_type,from_status,to_status,from_owner_id,to_owner_id,note,created_at")
        .single();
      if (!eventError && eventData) {
        setGradeReviewEvents((prev) => [eventData as FormGradeReviewEventRow, ...prev]);
        await fetch("/api/form-reports/queue-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gradeId,
            eventId: (eventData as FormGradeReviewEventRow).id,
            eventType,
            fromOwnerId: existing?.owner_id ?? null,
            toOwnerId: (data as FormGradeReviewRow).owner_id ?? null,
          }),
        });
      } else if (eventError) {
        setQueueError(eventError.message);
      }
    }
  }

  async function bulkApplyQueueAction(action: "assign" | "mark_in_review" | "resolve") {
    if (!queueSelectedGradeIds.length) {
      setQueueError("Select at least one flagged queue item first.");
      return;
    }
    if (action === "assign" && !currentUserId) {
      setQueueError("You must be signed in to assign items.");
      return;
    }
    if (action === "resolve" && !bulkResolutionNote.trim()) {
      setQueueError("Bulk resolve requires a resolution note.");
      return;
    }

    setQueueError(null);
    setBulkBusy(true);
    let updated = 0;
    let skipped = 0;

    for (const gradeId of queueSelectedGradeIds) {
      const item = allFlaggedQueueRows.find((row) => row.row.id === gradeId);
      if (!item) {
        skipped += 1;
        continue;
      }
      const isOwner = currentUserId && item.review?.owner_id === currentUserId;
      const canManage = Boolean(isOwner || canOverrideQueueOwnership);

      if (action === "assign") {
        if (!currentUserId) {
          skipped += 1;
          continue;
        }
        await upsertGradeReview(
          gradeId,
          {
            owner_id: currentUserId,
            review_status: item.reviewStatus === "resolved" ? "in_review" : item.reviewStatus,
          },
          "assign"
        );
        updated += 1;
        continue;
      }

      if (action === "mark_in_review") {
        if (!item.review?.owner_id || !canManage) {
          skipped += 1;
          continue;
        }
        await upsertGradeReview(
          gradeId,
          {
            review_status: "in_review",
            resolved_at: null,
          },
          "mark_in_review"
        );
        updated += 1;
        continue;
      }

      if (!item.review?.owner_id || !canManage) {
        skipped += 1;
        continue;
      }
      await upsertGradeReview(
        gradeId,
        {
          review_status: "resolved",
          owner_id: item.review.owner_id,
          resolved_at: new Date().toISOString(),
          resolution_note: bulkResolutionNote.trim(),
        },
        "resolve"
      );
      updated += 1;
    }

    setBulkBusy(false);
    setQueueSelectedGradeIds([]);
    if (action === "resolve") setBulkResolutionNote("");
    setQueueError(`Bulk ${action.replaceAll("_", " ")} complete. Updated ${updated}, skipped ${skipped}.`);
  }

  function renderQueueActions(item: {
    row: GradeRow;
    review: FormGradeReviewRow | undefined;
    reviewStatus: "open" | "in_review" | "resolved";
  }) {
    return (
      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={!currentUserId || queueBusyGradeIds.includes(item.row.id)}
          onClick={() =>
            void upsertGradeReview(
              item.row.id,
              {
                owner_id: currentUserId,
                review_status: item.reviewStatus === "resolved" ? "in_review" : item.reviewStatus,
              },
              "assign"
            )
          }
          style={smallButtonStyle()}
        >
          Assign to me
        </button>
        <button
          type="button"
          disabled={
            !item.review?.owner_id ||
            queueBusyGradeIds.includes(item.row.id) ||
            !((currentUserId && item.review?.owner_id === currentUserId) || canOverrideQueueOwnership)
          }
          onClick={() =>
            void upsertGradeReview(
              item.row.id,
              {
                owner_id: null,
                review_status: "open",
                resolved_at: null,
              },
              "release"
            )
          }
          style={smallButtonStyle()}
        >
          Release ownership
        </button>
        <button
          type="button"
          disabled={queueBusyGradeIds.includes(item.row.id)}
          onClick={() => {
            if (!item.review?.owner_id) {
              setQueueError("Assign an owner before moving an item to in review.");
              return;
            }
            if (
              !((currentUserId && item.review?.owner_id === currentUserId) || canOverrideQueueOwnership)
            ) {
              setQueueError("Only the owner can move this item to in review.");
              return;
            }
            void upsertGradeReview(
              item.row.id,
              {
                review_status: "in_review",
                resolved_at: null,
              },
              "mark_in_review"
            );
          }}
          style={smallButtonStyle()}
        >
          Mark in review
        </button>
        <button
          type="button"
          disabled={queueBusyGradeIds.includes(item.row.id)}
          onClick={() => {
            const note = (queueResolutionDraftByGrade[item.row.id] ?? item.review?.resolution_note ?? "").trim();
            if (!note) {
              setQueueError("Resolution note is required before resolving a flagged item.");
              return;
            }
            if (!item.review?.owner_id) {
              setQueueError("Assign an owner before resolving a flagged item.");
              return;
            }
            if (
              !((currentUserId && item.review?.owner_id === currentUserId) || canOverrideQueueOwnership)
            ) {
              setQueueError("Only the owner can resolve this item.");
              return;
            }
            void upsertGradeReview(
              item.row.id,
              {
                review_status: "resolved",
                owner_id: item.review.owner_id,
                resolved_at: new Date().toISOString(),
                resolution_note: note,
              },
              "resolve"
            );
          }}
          style={smallButtonStyle()}
        >
          Resolve
        </button>
      </div>
    );
  }

  return (
    <main style={{ maxWidth: 1260, margin: "0 auto", paddingBottom: 40 }}>
      <h1 style={{ marginBottom: 6 }}>Accountability Center</h1>
      <div style={{ opacity: 0.75 }}>
        Team member and mechanic accountability, SLA health, repeat failure trends, and coaching action tracking.
      </div>

      <div style={{ marginTop: 12, maxWidth: 280 }}>
        <select value={period} onChange={(e) => setPeriod(e.target.value as ScorePeriod)} style={inputStyle()}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="yearly">Yearly</option>
        </select>
      </div>

      <section style={{ marginTop: 14, ...cardStyle() }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <Stat label="Graded Submissions" value={String(summary.submissions)} />
          <Stat label="Avg Form Score" value={`${summary.avgScore}%`} />
          <Stat label="Accountability Flags" value={String(summary.flags)} />
          <Stat label="Open Requests" value={String(globalRisk.openRequests)} />
          <Stat label="SLA Breaches" value={String(globalRisk.slaBreaches)} />
          <Stat label="Unacknowledged >24h" value={String(globalRisk.unacknowledged)} />
          <Stat label="Repeat Failures" value={String(globalRisk.repeatFailures)} />
        </div>
      </section>

      {selectedFlaggedQueueItem ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 1200,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
          onClick={() => setQueueModalGradeId(null)}
        >
          <div
            style={{
              width: "min(980px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              border: "1px solid rgba(255,255,255,0.16)",
              borderRadius: 14,
              background: "rgba(14,16,20,0.98)",
              padding: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>
                {selectedFlaggedQueueItem.row.form_type} · #{selectedFlaggedQueueItem.row.form_id}
              </div>
              <button type="button" style={smallButtonStyle()} onClick={() => setQueueModalGradeId(null)}>
                Close
              </button>
            </div>

            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
              <Stat label="Status" value={selectedFlaggedQueueItem.reviewStatus.replaceAll("_", " ")} />
              <Stat label="Owner" value={selectedFlaggedQueueItem.ownerName} />
              <Stat label="Score" value={`${selectedFlaggedQueueItem.row.score}%`} />
              <Stat label="Missing Count" value={String(selectedFlaggedQueueItem.row.missing_count ?? 0)} />
            </div>

            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.86 }}>
              Submitted: {new Date(selectedFlaggedQueueItem.row.submitted_at).toLocaleString()} · By{" "}
              {selectedFlaggedQueueItem.submittedProfileId ? (
                <Link href={`/employees/${selectedFlaggedQueueItem.submittedProfileId}`} style={{ color: "#9fcbff", textDecoration: "underline" }}>
                  {selectedFlaggedQueueItem.submittedByLabel}
                </Link>
              ) : (
                selectedFlaggedQueueItem.submittedByLabel
              )}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.86 }}>
              {selectedFlaggedQueueItem.row.vehicle_id ? (
                <Link href={`/vehicles/${selectedFlaggedQueueItem.row.vehicle_id}`} style={{ color: "#9fcbff", textDecoration: "underline" }}>
                  Vehicle: {selectedFlaggedQueueItem.row.vehicle_id}
                </Link>
              ) : selectedFlaggedQueueItem.row.equipment_id ? (
                <Link href={`/equipment/${selectedFlaggedQueueItem.row.equipment_id}`} style={{ color: "#9fcbff", textDecoration: "underline" }}>
                  Equipment: {selectedFlaggedQueueItem.row.equipment_id}
                </Link>
              ) : (
                "No linked asset"
              )}
            </div>

            <div style={{ marginTop: 10 }}>
              <input
                value={
                  queueResolutionDraftByGrade[selectedFlaggedQueueItem.row.id] ??
                  selectedFlaggedQueueItem.review?.resolution_note ??
                  ""
                }
                onChange={(e) =>
                  setQueueResolutionDraftByGrade((prev) => ({
                    ...prev,
                    [selectedFlaggedQueueItem.row.id]: e.target.value,
                  }))
                }
                placeholder="Resolution note (required to resolve)"
                style={inputStyle()}
              />
            </div>
            {renderQueueActions(selectedFlaggedQueueItem)}

            <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 10 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Accountability Reason</div>
              <div style={{ fontSize: 13, opacity: 0.86 }}>
                {selectedFlaggedQueueItem.row.accountability_reason || "No reason recorded."}
              </div>
            </div>

            <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 10 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Missing Fields</div>
              {selectedFlaggedMissingFields.length === 0 ? (
                <div style={{ fontSize: 13, opacity: 0.75 }}>No missing fields recorded.</div>
              ) : (
                <div style={{ display: "grid", gap: 4 }}>
                  {selectedFlaggedMissingFields.map((field) => (
                    <div key={`mf-${field}`} style={{ fontSize: 13, opacity: 0.86 }}>
                      - {field}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 10 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Metadata</div>
              {selectedFlaggedMetadataText ? (
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 10,
                    padding: 10,
                    fontSize: 12,
                  }}
                >
                  {selectedFlaggedMetadataText}
                </pre>
              ) : (
                <div style={{ fontSize: 13, opacity: 0.75 }}>No metadata recorded.</div>
              )}
            </div>

            <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 10 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Full Activity Timeline</div>
              {(selectedFlaggedQueueItem.recentEvents ?? []).length === 0 ? (
                <div style={{ fontSize: 13, opacity: 0.75 }}>No events recorded yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {selectedFlaggedQueueItem.recentEvents.map((event) => (
                    <div key={`modal-event-${event.id}`} style={{ fontSize: 13, opacity: 0.86 }}>
                      {new Date(event.created_at).toLocaleString()} · {nameById[event.actor_id] || event.actor_id} ·{" "}
                      {event.event_type.replaceAll("_", " ")}
                      {event.from_status ? ` · from ${event.from_status.replaceAll("_", " ")}` : ""}
                      {event.to_status ? ` · to ${event.to_status.replaceAll("_", " ")}` : ""}
                      {event.note ? ` · ${event.note}` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <section style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Flagged Queue</div>
        <div style={{ opacity: 0.75, marginBottom: 10 }}>
          Triage flagged forms with assignment and resolution workflow.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 10 }}>
          <Stat label="Open Flags" value={String(flaggedQueueSummary.openCount)} />
          <Stat label="Avg Resolve Time (h)" value={String(flaggedQueueSummary.avgResolveHours)} />
          <Stat label="Unresolved >48h" value={String(flaggedQueueSummary.unresolvedOlderThan48h)} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 10 }}>
          <select
            value={queueStatusFilter}
            onChange={(e) => setQueueStatusFilter(e.target.value as "all" | "unresolved" | "resolved")}
            style={inputStyle()}
          >
            <option value="unresolved">Unresolved</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
          <select
            value={queueAssetFilter}
            onChange={(e) => setQueueAssetFilter(e.target.value as "all" | "vehicle" | "equipment")}
            style={inputStyle()}
          >
            <option value="all">All Assets</option>
            <option value="vehicle">Vehicle</option>
            <option value="equipment">Equipment</option>
          </select>
          <select value={queueTeammateFilter} onChange={(e) => setQueueTeammateFilter(e.target.value)} style={inputStyle()}>
            <option value="all">All Teammates</option>
            {flaggedTeammateOptions.map((option) => (
              <option key={`flagged-tm-${option}`} value={option}>
                {option}
              </option>
            ))}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={queueMineOnly} onChange={(e) => setQueueMineOnly(e.target.checked)} />
            Mine only
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={queueRecentActivityOnly}
              onChange={(e) => setQueueRecentActivityOnly(e.target.checked)}
            />
            Activity in last 7 days
          </label>
        </div>
        <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, opacity: 0.82 }}>
              Selected: {queueSelectedGradeIds.length}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={
                  visibleFlaggedGradeIds.length > 0 &&
                  visibleFlaggedGradeIds.every((id) => queueSelectedGradeIds.includes(id))
                }
                onChange={(e) =>
                  setQueueSelectedGradeIds((prev) => {
                    if (e.target.checked) {
                      return Array.from(new Set([...prev, ...visibleFlaggedGradeIds]));
                    }
                    return prev.filter((id) => !visibleFlaggedGradeIds.includes(id));
                  })
                }
              />
              Select all visible
            </label>
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={smallButtonStyle()} disabled={bulkBusy} onClick={() => void bulkApplyQueueAction("assign")}>
              {bulkBusy ? "Working..." : "Bulk Assign to Me"}
            </button>
            <button type="button" style={smallButtonStyle()} disabled={bulkBusy} onClick={() => void bulkApplyQueueAction("mark_in_review")}>
              {bulkBusy ? "Working..." : "Bulk Mark In Review"}
            </button>
            <button type="button" style={smallButtonStyle()} disabled={bulkBusy} onClick={() => void bulkApplyQueueAction("resolve")}>
              {bulkBusy ? "Working..." : "Bulk Resolve"}
            </button>
          </div>
          <div style={{ marginTop: 8 }}>
            <input
              value={bulkResolutionNote}
              onChange={(e) => setBulkResolutionNote(e.target.value)}
              placeholder="Bulk resolution note (required for bulk resolve)"
              style={inputStyle()}
            />
          </div>
        </div>
        {queueError ? <div style={{ color: "#ff9d9d", marginBottom: 8 }}>{queueError}</div> : null}

        {!flaggedQueueRows.length ? (
          <div style={{ opacity: 0.75 }}>No flagged items in this filter.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {flaggedQueueRows.map((item) => (
              <div key={`flagged-queue-${item.row.id}`} style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={queueSelectedGradeIds.includes(item.row.id)}
                      onChange={(e) =>
                        setQueueSelectedGradeIds((prev) =>
                          e.target.checked
                            ? Array.from(new Set([...prev, item.row.id]))
                            : prev.filter((id) => id !== item.row.id)
                        )
                      }
                    />
                    <div style={{ fontWeight: 800 }}>
                      {item.row.form_type} · #{item.row.form_id}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Status: {item.reviewStatus.replace("_", " ")} · Owner: {item.ownerName}
                  </div>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.82 }}>
                  Submitted: {new Date(item.row.submitted_at).toLocaleString()} · By{" "}
                  {item.submittedProfileId ? (
                    <Link href={`/employees/${item.submittedProfileId}`} style={{ color: "#9fcbff", textDecoration: "underline" }}>
                      {item.submittedByLabel}
                    </Link>
                  ) : (
                    item.submittedByLabel
                  )}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.82 }}>
                  {item.row.vehicle_id ? (
                    <Link href={`/vehicles/${item.row.vehicle_id}`} style={{ color: "#9fcbff", textDecoration: "underline" }}>
                      Vehicle: {item.row.vehicle_id}
                    </Link>
                  ) : item.row.equipment_id ? (
                    <Link href={`/equipment/${item.row.equipment_id}`} style={{ color: "#9fcbff", textDecoration: "underline" }}>
                      Equipment: {item.row.equipment_id}
                    </Link>
                  ) : (
                    "No linked asset"
                  )}
                  {item.row.accountability_reason ? ` · Reason: ${item.row.accountability_reason}` : ""}
                </div>
                {item.review?.resolution_note ? (
                  <div style={{ marginTop: 4, fontSize: 12, opacity: 0.82 }}>
                    Resolution note: {item.review.resolution_note}
                  </div>
                ) : null}
                <div style={{ marginTop: 8 }}>
                  <input
                    value={
                      queueResolutionDraftByGrade[item.row.id] ??
                      item.review?.resolution_note ??
                      ""
                    }
                    onChange={(e) =>
                      setQueueResolutionDraftByGrade((prev) => ({
                        ...prev,
                        [item.row.id]: e.target.value,
                      }))
                    }
                    placeholder="Resolution note (required to resolve)"
                    style={inputStyle()}
                  />
                </div>
                <div style={{ marginTop: 8 }}>
                  <button type="button" style={smallButtonStyle()} onClick={() => setQueueModalGradeId(item.row.id)}>
                    Open details
                  </button>
                </div>
                {renderQueueActions(item)}
                {item.recentEvents.length > 0 ? (
                  <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 8 }}>
                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Recent activity</div>
                    <div style={{ display: "grid", gap: 4 }}>
                      {item.recentEvents.slice(0, 5).map((event) => (
                        <div key={`event-${event.id}`} style={{ fontSize: 12, opacity: 0.82 }}>
                          {new Date(event.created_at).toLocaleString()} ·{" "}
                          {(nameById[event.actor_id] || event.actor_id)} ·{" "}
                          {event.event_type.replaceAll("_", " ")}
                          {event.to_status ? ` · ${event.to_status.replaceAll("_", " ")}` : ""}
                          {event.note ? ` · ${event.note}` : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 4 }}>Employee Scoreboard</div>
        <div style={{ opacity: 0.75, marginBottom: 10 }}>
          Click an employee to open score breakdown and submitted forms.
        </div>
        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading...</div>
        ) : errorMessage ? (
          <div style={{ color: "#ff9d9d" }}>{errorMessage}</div>
        ) : !unifiedScoreboard.length ? (
          <div style={{ opacity: 0.75 }}>No score data in this period.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {unifiedScoreboard.map((row) => {
              const selected = row.key === effectiveSelectedPersonKey;
              return (
                <div key={row.key} style={{ display: "grid", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setSelectedPersonKey(row.key)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(220px, 1.5fr) repeat(7, minmax(90px, 1fr))",
                      gap: 8,
                      border: selected
                        ? "1px solid rgba(126,255,167,0.45)"
                        : "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 10,
                      padding: 10,
                      alignItems: "center",
                      background: selected ? "rgba(126,255,167,0.10)" : "rgba(255,255,255,0.02)",
                      color: "inherit",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800 }}>{row.name}</div>
                      <div style={{ opacity: 0.7, fontSize: 12 }}>{row.role || "No role set"}</div>
                    </div>
                    <MiniStat label="Overall" value={`${row.overallScore}%`} />
                    <MiniStat label="Forms" value={String(row.forms)} />
                    <MiniStat label="Form Avg" value={`${row.avgFormScore}%`} />
                    <MiniStat label="On-Time" value={`${row.onTimeRate}%`} />
                    <MiniStat label="Flags" value={String(row.formFlags)} />
                    <MiniStat label="Logs" value={String(row.logs)} />
                    <MiniStat label="Mech Obj" value={`${row.mechanicObjectiveScore}%`} />
                  </button>
                  {row.userId ? (
                    <Link
                      href={`/employees/${row.userId}`}
                      style={{ fontSize: 12, color: "#9fcbff", textDecoration: "underline", justifySelf: "start" }}
                    >
                      Open employee profile
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>
          {selectedPerson ? `${selectedPerson.name} · Score Detail` : "Select an employee"}
        </div>
        {!selectedPerson ? (
          <div style={{ opacity: 0.75 }}>No employee selected.</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {selectedPerson.userId ? (
              <div>
                <Link
                  href={`/employees/${selectedPerson.userId}`}
                  style={{ fontSize: 13, color: "#9fcbff", textDecoration: "underline" }}
                >
                  Go to employee detail page
                </Link>
              </div>
            ) : null}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <Stat label="Overall Score" value={`${selectedPerson.overallScore}%`} />
              <Stat label="Form Score" value={`${selectedPerson.avgFormScore}%`} />
              <Stat label="On-Time Inspections" value={`${selectedPerson.onTimeRate}%`} />
              <Stat label="Fail→Request Link Rate" value={`${selectedPerson.failLinkRate}%`} />
              <Stat label="Mechanic Objective" value={`${selectedPerson.mechanicObjectiveScore}%`} />
              <Stat label="Mechanic Linkage Rate" value={`${selectedPerson.linkageRate}%`} />
              <Stat label="Mechanic Closure Rate" value={`${selectedPerson.closureRate}%`} />
              <Stat label="Mechanic Band" value={mechanicScoreBand(selectedPerson.mechanicObjectiveScore)} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
              <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Submitted Graded Forms</div>
                {likeError ? <div style={{ color: "#ff9d9d", marginBottom: 8 }}>{likeError}</div> : null}
                {!selectedFormRows.length ? (
                  <div style={{ opacity: 0.75 }}>No graded forms in this period.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {selectedFormRows.map((row) => (
                      <div key={row.id} style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 700 }}>{row.form_type}</div>
                          <div style={{ fontWeight: 800 }}>{row.score}%</div>
                        </div>
                        <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>
                          {new Date(row.submitted_at).toLocaleString()}
                        </div>
                        <div style={{ opacity: 0.82, fontSize: 12, marginTop: 4 }}>
                          {row.vehicle_id ? `Vehicle: ${row.vehicle_id}` : row.equipment_id ? `Equipment: ${row.equipment_id}` : "No linked asset"}
                        </div>
                        <div style={{ opacity: 0.82, fontSize: 12, marginTop: 4 }}>
                          {row.is_complete ? "Complete" : "Incomplete"}
                          {row.has_na ? " · Contains N/A" : ""}
                          {row.accountability_flag ? " · Flagged" : ""}
                        </div>
                        {row.accountability_flag ? (
                          <div style={{ marginTop: 8 }}>
                            <button
                              type="button"
                              onClick={() => void toggleFlagLike(row.id)}
                              disabled={likingGradeIds.includes(row.id)}
                              style={{
                                border: "1px solid rgba(255,255,255,0.16)",
                                background: likedGradeIdSet.has(row.id)
                                  ? "rgba(126,255,167,0.18)"
                                  : "rgba(255,255,255,0.04)",
                                color: "inherit",
                                borderRadius: 999,
                                padding: "6px 10px",
                                cursor: "pointer",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              {likingGradeIds.includes(row.id)
                                ? "Saving..."
                                : `${likedGradeIdSet.has(row.id) ? "Liked" : "Like"} · ${
                                    likeCountByGrade.get(row.id) || 0
                                  }`}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Inspection Forms</div>
                {!selectedInspectionRows.length ? (
                  <div style={{ opacity: 0.75 }}>No inspections in this period.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {selectedInspectionRows.map((row) => {
                      const meta = parseInspectionMeta(row.checklist);
                      return (
                        <div key={row.id} style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                            <div style={{ fontWeight: 700 }}>{row.overall_status || "Inspection"}</div>
                            <div style={{ fontWeight: 800 }}>{meta.failCount} fail(s)</div>
                          </div>
                          <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>
                            {new Date(row.created_at).toLocaleString()}
                          </div>
                          <div style={{ opacity: 0.82, fontSize: 12, marginTop: 4 }}>
                            Linked fail requests: {meta.linkedFailCount}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Maintenance Logs</div>
                {!selectedLogRows.length ? (
                  <div style={{ opacity: 0.75 }}>No maintenance logs in this period.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {selectedLogRows.map((row) => (
                      <div key={row.id} style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 700 }}>{row.status_update || "No status update"}</div>
                          <div style={{ fontWeight: 800 }}>{maintenanceLogQualityScore(row)}%</div>
                        </div>
                        <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>
                          {new Date(row.created_at).toLocaleString()}
                        </div>
                        <div style={{ opacity: 0.82, fontSize: 12, marginTop: 4 }}>
                          {row.request_id ? `Linked request: ${row.request_id}` : "No request linked"}
                        </div>
                        <div style={{ opacity: 0.82, fontSize: 12, marginTop: 4 }}>
                          {(row.notes ?? "").trim() || "No notes entered"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <AccountabilityTrackerPanel profiles={profiles} />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        padding: 10,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div style={{ opacity: 0.72, fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 900, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ opacity: 0.7, fontSize: 11 }}>{label}</div>
      <div style={{ fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function smallButtonStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.04)",
    color: "inherit",
    borderRadius: 999,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
  };
}
