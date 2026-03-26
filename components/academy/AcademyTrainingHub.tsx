"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import type { AppRole } from "@/lib/roleView";
import EmployeeMenuSelect from "@/components/EmployeeMenuSelect";
import { fetchEmployeeAvatarUrls, type EmployeeBadgeOption } from "@/lib/employeeBadges";

type AcademyTrainingHubProps = {
  viewerId: string | null;
  viewerRole: AppRole | null;
  viewerDepartment: string | null;
  viewerName: string | null;
};

type ProgramRow = {
  id: string;
  slug: string;
  name: string;
  department: string;
  program_length_weeks: number;
  focus: string | null;
  summary: string | null;
  is_active: boolean;
};

type WeekRow = {
  id: string;
  program_id: string;
  week_number: number;
  title: string;
  goal_percent: number;
  goal_description: string;
};

type WeekRequirementRow = {
  id: string;
  program_id: string;
  week_number: number;
  min_pass_percent: number;
  require_safety_pass: boolean;
  require_quality_pass: boolean;
  require_efficiency_pass: boolean;
  require_no_open_incidents: boolean;
  production_benchmark: string | null;
  quality_defect_tolerance: string | null;
  notes: string | null;
};

type SkillRow = {
  id: string;
  program_id: string;
  week_number: number;
  skill_key: string;
  skill_label: string;
  sort_order: number;
};

type EnrollmentRow = {
  id: string;
  program_id: string;
  trainee_id: string;
  trainer_id: string | null;
  department: string;
  start_date: string;
  target_completion_date: string | null;
  is_active: boolean;
};

type DailyProgressRow = {
  id: string;
  enrollment_id: string;
  progress_date: string;
  week_number: number;
  completion_percent: number;
};

type DailySkillProgressRow = {
  daily_progress_id: string;
  skill_id: string;
  status: number;
};

type DailySkillNoteRow = {
  daily_progress_id: string;
  skill_id: string;
  note: string;
};

type CertificationRow = {
  id: string;
  enrollment_id: string;
  employee_name: string;
  crew_leader_id: string | null;
  start_date: string;
  certification_date: string | null;
  crew_leader_approval: string | null;
  operations_approval: string | null;
  certification_result: string | null;
  final_practical_score: number | null;
  safety_signoff: boolean;
  quality_signoff: boolean;
  efficiency_signoff: boolean;
  workflow_signoff: boolean;
  equipment_signoff: boolean;
  customer_standards_signoff: boolean;
  remediation_plan: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  email: string | null;
  role: string | null;
  department: string | null;
  status: string | null;
};

type DashboardEnrollment = EnrollmentRow & {
  trainee: ProfileRow | null;
  trainer: ProfileRow | null;
  latestProgress: DailyProgressRow | null;
  score: number;
  currentWeek: number;
  targetWeekGoal: number;
};

type CertificationDraft = {
  employee_name: string;
  crew_leader_id: string;
  start_date: string;
  certification_date: string;
  crew_leader_approval: string;
  operations_approval: string;
  final_practical_score: string;
  safety_signoff: boolean;
  quality_signoff: boolean;
  efficiency_signoff: boolean;
  workflow_signoff: boolean;
  equipment_signoff: boolean;
  customer_standards_signoff: boolean;
  remediation_plan: string;
  certification_result: "" | "Certified Mowing Technician" | "Additional Training Required";
};

type IncidentType = "near_miss" | "property_damage" | "safety_incident" | "customer_issue";
type IncidentSeverity = "low" | "medium" | "high" | "critical";

type IncidentLogRow = {
  id: string;
  enrollment_id: string;
  incident_date: string;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  summary: string;
  action_taken: string | null;
  reported_by: string | null;
  resolved_at: string | null;
};

type FollowupType = "30_day" | "60_day";

type FollowupRow = {
  id: string;
  enrollment_id: string;
  followup_type: FollowupType;
  due_date: string;
  completed_date: string | null;
  reviewer_id: string | null;
  score_percent: number | null;
  notes: string | null;
};

type IncidentDraft = {
  incident_date: string;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  summary: string;
  action_taken: string;
};

type CertificationSignoffKey =
  | "safety_signoff"
  | "quality_signoff"
  | "efficiency_signoff"
  | "workflow_signoff"
  | "equipment_signoff"
  | "customer_standards_signoff";

type AssignmentDraft = {
  trainee_id: string;
  trainer_id: string;
  start_date: string;
};

const STATUS_OPTIONS = [
  { value: 1, label: "Not Yet Introduced", badge: "#3e4047" },
  { value: 2, label: "Explained & Demonstrated", badge: "#4e6f9d" },
  { value: 3, label: "Performed With Guidance", badge: "#7d6b2f" },
  { value: 4, label: "Performed Independently", badge: "#2f7d54" },
  { value: 5, label: "Excellent", badge: "#2a9f60" },
] as const;

const MANAGEMENT_ROLES = new Set<AppRole>(["owner", "operations_manager", "office_admin"]);
const MANAGEMENT_PLUS_MECHANIC_ROLES = new Set<AppRole>(["owner", "operations_manager", "office_admin", "mechanic"]);
const LEAD_ROLES = new Set<AppRole>(["team_lead_1", "team_lead_2"]);
const TEAMMATE_ROLES = new Set<AppRole>(["team_member_1", "team_member_2", "employee"]);
const DAILY_FORM_ENABLED_DEPARTMENTS = new Set(["mowing"]);
const CERTIFICATION_MIN_SCORE = 85;

const INCIDENT_TYPE_OPTIONS: Array<{ value: IncidentType; label: string }> = [
  { value: "near_miss", label: "Near Miss" },
  { value: "property_damage", label: "Property Damage" },
  { value: "safety_incident", label: "Safety Incident" },
  { value: "customer_issue", label: "Customer Issue" },
];

const INCIDENT_SEVERITY_OPTIONS: Array<{ value: IncidentSeverity; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const CERTIFICATION_SIGNOFF_FIELDS: Array<{ key: CertificationSignoffKey; label: string }> = [
  { key: "safety_signoff", label: "Safety" },
  { key: "quality_signoff", label: "Quality" },
  { key: "efficiency_signoff", label: "Efficiency" },
  { key: "workflow_signoff", label: "Workflow / MEATS" },
  { key: "equipment_signoff", label: "Equipment Care" },
  { key: "customer_standards_signoff", label: "Customer Standards" },
];

const INCIDENT_SEVERITY_BADGE_BY_VALUE: Record<IncidentSeverity, string> = {
  low: "#4e6f9d",
  medium: "#7d6b2f",
  high: "#9c5d2f",
  critical: "#b94b4b",
};

function getIncidentTypeLabel(value: IncidentType) {
  return INCIDENT_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function formatPerson(profile: ProfileRow | null | undefined, fallback = "Unassigned") {
  if (!profile) return fallback;
  const nickname = (profile.nickname || "").trim();
  const fullName = (profile.full_name || "").trim();
  const email = (profile.email || "").trim();
  return nickname || fullName || email || fallback;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function statusToPercent(status: number) {
  if (status <= 1) return 0;
  if (status >= 5) return 100;
  return Math.round(((status - 1) / 4) * 100);
}

function clampWeek(week: number, maxWeeks: number) {
  if (week < 1) return 1;
  if (week > maxWeeks) return maxWeeks;
  return week;
}

function getWeekFromStart(startDate: string, targetDateIso: string, maxWeeks: number) {
  const start = new Date(`${startDate}T00:00:00`);
  const target = new Date(`${targetDateIso}T00:00:00`);
  const diffMs = target.getTime() - start.getTime();
  const diffDays = Number.isFinite(diffMs) ? Math.floor(diffMs / 86_400_000) : 0;
  const week = Math.floor(Math.max(diffDays, 0) / 7) + 1;
  return clampWeek(week, maxWeeks);
}

function hasDailyFormEnabled(department: string | null | undefined) {
  return DAILY_FORM_ENABLED_DEPARTMENTS.has((department || "").trim().toLowerCase());
}

export default function AcademyTrainingHub(props: AcademyTrainingHubProps) {
  const { viewerId, viewerRole, viewerDepartment } = props;
  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const [program, setProgram] = useState<ProgramRow | null>(null);
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [weekRequirements, setWeekRequirements] = useState<WeekRequirementRow[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [dailyProgress, setDailyProgress] = useState<DailyProgressRow[]>([]);
  const [dailySkillProgress, setDailySkillProgress] = useState<DailySkillProgressRow[]>([]);
  const [dailySkillNotes, setDailySkillNotes] = useState<DailySkillNoteRow[]>([]);
  const [certifications, setCertifications] = useState<CertificationRow[]>([]);
  const [incidentLogs, setIncidentLogs] = useState<IncidentLogRow[]>([]);
  const [followups, setFollowups] = useState<FollowupRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [activeEnrollmentId, setActiveEnrollmentId] = useState<string>("");
  const [activeDate, setActiveDate] = useState<string>(todayIso);
  const [draftProgressId, setDraftProgressId] = useState<string | null>(null);
  const [draftStatusBySkillId, setDraftStatusBySkillId] = useState<Record<string, number>>({});
  const [draftNoteBySkillId, setDraftNoteBySkillId] = useState<Record<string, string>>({});
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [avatarUrlById, setAvatarUrlById] = useState<Record<string, string>>({});
  const [incidentDraft, setIncidentDraft] = useState<IncidentDraft>({
    incident_date: todayIso,
    incident_type: "near_miss",
    severity: "low",
    summary: "",
    action_taken: "",
  });

  const [assignmentDraft, setAssignmentDraft] = useState<AssignmentDraft>({
    trainee_id: "",
    trainer_id: "",
    start_date: todayIso,
  });

  const [certDraft, setCertDraft] = useState<CertificationDraft>({
    employee_name: "",
    crew_leader_id: "",
    start_date: "",
    certification_date: "",
    crew_leader_approval: "",
    operations_approval: "",
    final_practical_score: "",
    safety_signoff: false,
    quality_signoff: false,
    efficiency_signoff: false,
    workflow_signoff: false,
    equipment_signoff: false,
    customer_standards_signoff: false,
    remediation_plan: "",
    certification_result: "",
  });

  const isManagement = viewerRole ? MANAGEMENT_ROLES.has(viewerRole) : false;
  const isManagementOrMechanic = viewerRole ? MANAGEMENT_PLUS_MECHANIC_ROLES.has(viewerRole) : false;
  const isLead = viewerRole ? LEAD_ROLES.has(viewerRole) : false;
  const isTeammateRole = viewerRole ? TEAMMATE_ROLES.has(viewerRole) : false;
  const canViewCompanyDepartments = isManagement;
  const canManageAssignments = isManagementOrMechanic || isLead;

  const profileById = useMemo(() => {
    return new Map(profiles.map((p) => [p.id, p]));
  }, [profiles]);

  const goalByWeek = useMemo(() => {
    const map = new Map<number, number>();
    for (const week of weeks) {
      map.set(week.week_number, week.goal_percent);
    }
    return map;
  }, [weeks]);

  const weekRequirementByWeek = useMemo(() => {
    const map = new Map<number, WeekRequirementRow>();
    for (const row of weekRequirements) {
      map.set(row.week_number, row);
    }
    return map;
  }, [weekRequirements]);

  const skillsByWeek = useMemo(() => {
    const map = new Map<number, SkillRow[]>();
    for (const skill of skills) {
      const list = map.get(skill.week_number) ?? [];
      list.push(skill);
      map.set(skill.week_number, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.sort_order - b.sort_order) || a.skill_label.localeCompare(b.skill_label));
    }
    return map;
  }, [skills]);

  const latestProgressByEnrollment = useMemo(() => {
    const map = new Map<string, DailyProgressRow>();
    const sorted = [...dailyProgress].sort((a, b) => b.progress_date.localeCompare(a.progress_date));
    for (const row of sorted) {
      if (!map.has(row.enrollment_id)) map.set(row.enrollment_id, row);
    }
    return map;
  }, [dailyProgress]);

  const scoreByProgressId = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of dailyProgress) {
      map.set(row.id, Number(row.completion_percent || 0));
    }
    return map;
  }, [dailyProgress]);

  const enrollmentDashboardRows = useMemo<DashboardEnrollment[]>(() => {
    const maxWeeks = program?.program_length_weeks ?? 4;
    return enrollments.map((enrollment) => {
      const trainee = profileById.get(enrollment.trainee_id) ?? null;
      const trainer = profileById.get(enrollment.trainer_id ?? "") ?? null;
      const latestProgress = latestProgressByEnrollment.get(enrollment.id) ?? null;
      const score = latestProgress ? Number(scoreByProgressId.get(latestProgress.id) ?? 0) : 0;
      const currentWeek = getWeekFromStart(enrollment.start_date, todayIso, maxWeeks);
      const targetWeekGoal = goalByWeek.get(currentWeek) ?? 0;
      return {
        ...enrollment,
        trainee,
        trainer,
        latestProgress,
        score,
        currentWeek,
        targetWeekGoal,
      };
    });
  }, [enrollments, profileById, latestProgressByEnrollment, scoreByProgressId, todayIso, program?.program_length_weeks, goalByWeek]);

  const apprenticeRows = useMemo(() => {
    return enrollmentDashboardRows.filter((row) => {
      const role = (row.trainee?.role || "").trim().toLowerCase();
      return role === "apprentice";
    });
  }, [enrollmentDashboardRows]);

  const selfApprenticeRows = useMemo(() => {
    if (!viewerId) return [] as DashboardEnrollment[];
    return apprenticeRows.filter((row) => row.trainee_id === viewerId);
  }, [apprenticeRows, viewerId]);

  const trainerAssignedRows = useMemo(() => {
    if (!viewerId) return [] as DashboardEnrollment[];
    return apprenticeRows.filter((row) => row.trainer_id === viewerId);
  }, [apprenticeRows, viewerId]);

  const deptApprenticeRows = useMemo(() => {
    if (!viewerDepartment) return [] as DashboardEnrollment[];
    return apprenticeRows.filter((row) => {
      const dept = row.trainee?.department || row.department;
      return dept === viewerDepartment;
    });
  }, [apprenticeRows, viewerDepartment]);

  const companyDepartmentMap = useMemo(() => {
    const map = new Map<string, DashboardEnrollment[]>();
    for (const row of apprenticeRows) {
      const dept = row.trainee?.department || row.department || "Unassigned";
      const list = map.get(dept) ?? [];
      list.push(row);
      map.set(dept, list);
    }
    return map;
  }, [apprenticeRows]);

  const activeEnrollment = useMemo(() => {
    return apprenticeRows.find((row) => row.id === activeEnrollmentId) ?? null;
  }, [apprenticeRows, activeEnrollmentId]);
  const activeEnrollmentDepartment = activeEnrollment?.trainee?.department || activeEnrollment?.department || null;
  const activeEnrollmentSupportsDailyForm = hasDailyFormEnabled(activeEnrollmentDepartment);

  const canEditAnyProgress = useMemo(() => {
    if (!viewerId || !viewerRole) return false;
    if (isManagementOrMechanic || isLead) return true;
    return trainerAssignedRows.length > 0;
  }, [viewerId, viewerRole, isManagementOrMechanic, isLead, trainerAssignedRows.length]);

  const canViewTrainerNotes = useMemo(() => {
    if (!viewerId || !viewerRole) return false;
    if (isManagementOrMechanic || isLead) return true;
    if (activeEnrollment?.trainer_id && activeEnrollment.trainer_id === viewerId) return true;
    return false;
  }, [viewerId, viewerRole, isManagementOrMechanic, isLead, activeEnrollment?.trainer_id]);

  const currentCertification = useMemo(() => {
    if (!activeEnrollment) return null;
    return certifications.find((row) => row.enrollment_id === activeEnrollment.id) ?? null;
  }, [activeEnrollment, certifications]);

  const activeEnrollmentIncidents = useMemo(() => {
    if (!activeEnrollment) return [] as IncidentLogRow[];
    return incidentLogs
      .filter((row) => row.enrollment_id === activeEnrollment.id)
      .sort((a, b) => b.incident_date.localeCompare(a.incident_date));
  }, [activeEnrollment, incidentLogs]);

  const openCriticalIncidentCount = useMemo(() => {
    return activeEnrollmentIncidents.filter((row) => row.severity === "critical" && !row.resolved_at).length;
  }, [activeEnrollmentIncidents]);

  const activeEnrollmentFollowups = useMemo(() => {
    if (!activeEnrollment) return [] as FollowupRow[];
    return followups
      .filter((row) => row.enrollment_id === activeEnrollment.id)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [activeEnrollment, followups]);

  async function loadTrainingData() {
    if (!viewerId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowser();

      const { data: programsData, error: programsError } = await supabase
        .from("academy_training_programs")
        .select("id,slug,name,department,program_length_weeks,focus,summary,is_active")
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      if (programsError) throw programsError;

      const programRows = (programsData ?? []) as ProgramRow[];
      const selectedProgram =
        programRows.find((row) => row.slug === "mowing-technician-4-week-training-certification") ??
        programRows[0] ??
        null;

      setProgram(selectedProgram);

      if (!selectedProgram) {
        setWeeks([]);
        setWeekRequirements([]);
        setSkills([]);
        setEnrollments([]);
        setDailyProgress([]);
        setDailySkillProgress([]);
        setDailySkillNotes([]);
        setCertifications([]);
        setIncidentLogs([]);
        setFollowups([]);
        return;
      }

      const [weeksRes, weekRequirementsRes, skillsRes, enrollmentsRes, profilesRes] = await Promise.all([
        supabase
          .from("academy_training_weeks")
          .select("id,program_id,week_number,title,goal_percent,goal_description")
          .eq("program_id", selectedProgram.id)
          .order("week_number", { ascending: true }),
        supabase
          .from("academy_training_week_requirements")
          .select(
            "id,program_id,week_number,min_pass_percent,require_safety_pass,require_quality_pass,require_efficiency_pass,require_no_open_incidents,production_benchmark,quality_defect_tolerance,notes"
          )
          .eq("program_id", selectedProgram.id)
          .order("week_number", { ascending: true }),
        supabase
          .from("academy_training_skills")
          .select("id,program_id,week_number,skill_key,skill_label,sort_order")
          .eq("program_id", selectedProgram.id)
          .order("week_number", { ascending: true })
          .order("sort_order", { ascending: true }),
        supabase
          .from("academy_training_enrollments")
          .select("id,program_id,trainee_id,trainer_id,department,start_date,target_completion_date,is_active")
          .eq("program_id", selectedProgram.id)
          .eq("is_active", true)
          .order("start_date", { ascending: true }),
        supabase
          .from("profiles")
          .select("id,full_name,first_name,last_name,nickname,email,role,department,status")
          .order("full_name", { ascending: true }),
      ]);

      if (weeksRes.error) throw weeksRes.error;
      if (weekRequirementsRes.error) throw weekRequirementsRes.error;
      if (skillsRes.error) throw skillsRes.error;
      if (enrollmentsRes.error) throw enrollmentsRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const nextWeeks = (weeksRes.data ?? []) as WeekRow[];
      const nextWeekRequirements = (weekRequirementsRes.data ?? []) as WeekRequirementRow[];
      const nextSkills = (skillsRes.data ?? []) as SkillRow[];
      const nextEnrollments = (enrollmentsRes.data ?? []) as EnrollmentRow[];
      const nextProfiles = (profilesRes.data ?? []) as ProfileRow[];

      setWeeks(nextWeeks);
      setWeekRequirements(nextWeekRequirements);
      setSkills(nextSkills);
      setEnrollments(nextEnrollments);
      setProfiles(nextProfiles);

      if (nextEnrollments.length === 0) {
        setDailyProgress([]);
        setDailySkillProgress([]);
        setDailySkillNotes([]);
        setCertifications([]);
        setIncidentLogs([]);
        setFollowups([]);
        return;
      }

      const enrollmentIds = nextEnrollments.map((row) => row.id);

      const [progressRes, certificationsRes, incidentLogsRes, followupsRes] = await Promise.all([
        supabase
          .from("academy_training_daily_progress")
          .select("id,enrollment_id,progress_date,week_number,completion_percent")
          .in("enrollment_id", enrollmentIds)
          .order("progress_date", { ascending: false }),
        supabase
          .from("academy_training_certifications")
          .select(
            "id,enrollment_id,employee_name,crew_leader_id,start_date,certification_date,crew_leader_approval,operations_approval,certification_result,final_practical_score,safety_signoff,quality_signoff,efficiency_signoff,workflow_signoff,equipment_signoff,customer_standards_signoff,remediation_plan"
          )
          .in("enrollment_id", enrollmentIds),
        supabase
          .from("academy_training_incident_logs")
          .select("id,enrollment_id,incident_date,incident_type,severity,summary,action_taken,reported_by,resolved_at")
          .in("enrollment_id", enrollmentIds)
          .order("incident_date", { ascending: false }),
        supabase
          .from("academy_training_followups")
          .select("id,enrollment_id,followup_type,due_date,completed_date,reviewer_id,score_percent,notes")
          .in("enrollment_id", enrollmentIds)
          .order("due_date", { ascending: true }),
      ]);

      if (progressRes.error) throw progressRes.error;
      if (certificationsRes.error) throw certificationsRes.error;
      if (incidentLogsRes.error) throw incidentLogsRes.error;
      if (followupsRes.error) throw followupsRes.error;

      const nextProgress = (progressRes.data ?? []) as DailyProgressRow[];
      setDailyProgress(nextProgress);
      setCertifications((certificationsRes.data ?? []) as CertificationRow[]);
      setIncidentLogs((incidentLogsRes.data ?? []) as IncidentLogRow[]);
      setFollowups((followupsRes.data ?? []) as FollowupRow[]);

      const progressIds = nextProgress.map((row) => row.id);
      if (progressIds.length === 0) {
        setDailySkillProgress([]);
        setDailySkillNotes([]);
        return;
      }

      const [skillProgressRes, notesRes] = await Promise.all([
        supabase
          .from("academy_training_daily_skill_progress")
          .select("daily_progress_id,skill_id,status")
          .in("daily_progress_id", progressIds),
        supabase
          .from("academy_training_daily_skill_notes")
          .select("daily_progress_id,skill_id,note")
          .in("daily_progress_id", progressIds),
      ]);

      if (skillProgressRes.error) throw skillProgressRes.error;
      if (notesRes.error) throw notesRes.error;

      setDailySkillProgress((skillProgressRes.data ?? []) as DailySkillProgressRow[]);
      setDailySkillNotes((notesRes.data ?? []) as DailySkillNoteRow[]);
    } catch (err) {
      console.error("[academy-training] load error", err);
      setError(err instanceof Error ? err.message : "Failed to load training data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTrainingData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerId]);

  useEffect(() => {
    if (apprenticeRows.length === 0) {
      setActiveEnrollmentId("");
      return;
    }

    const hasExisting = apprenticeRows.some((row) => row.id === activeEnrollmentId);
    if (hasExisting) return;

    const selfRow = viewerId ? apprenticeRows.find((row) => row.trainee_id === viewerId) : null;
    if (selfRow) {
      setActiveEnrollmentId(selfRow.id);
      return;
    }

    const assignedRow = viewerId ? apprenticeRows.find((row) => row.trainer_id === viewerId) : null;
    if (assignedRow) {
      setActiveEnrollmentId(assignedRow.id);
      return;
    }

    setActiveEnrollmentId(apprenticeRows[0]?.id ?? "");
  }, [activeEnrollmentId, apprenticeRows, viewerId]);

  useEffect(() => {
    if (!activeEnrollment || skills.length === 0) {
      setDraftProgressId(null);
      setDraftStatusBySkillId({});
      setDraftNoteBySkillId({});
      setDraftMessage(null);
      return;
    }

    if (!activeEnrollmentSupportsDailyForm) {
      setDraftProgressId(null);
      setDraftStatusBySkillId({});
      setDraftNoteBySkillId({});
      setDraftMessage("Daily checklist is not configured for this department yet.");
      return;
    }

    const baseStatus: Record<string, number> = {};
    for (const skill of skills) {
      baseStatus[skill.id] = 1;
    }

    const enrollmentRows = dailyProgress
      .filter((row) => row.enrollment_id === activeEnrollment.id)
      .sort((a, b) => b.progress_date.localeCompare(a.progress_date));

    const todayRow = enrollmentRows.find((row) => row.progress_date === activeDate) ?? null;
    const previousRow = enrollmentRows.find((row) => row.progress_date < activeDate) ?? null;

    const sourceRow = todayRow ?? previousRow;
    if (sourceRow) {
      const rowSkills = dailySkillProgress.filter((row) => row.daily_progress_id === sourceRow.id);
      for (const row of rowSkills) {
        if (baseStatus[row.skill_id] != null) {
          baseStatus[row.skill_id] = row.status;
        }
      }
    }

    const noteState: Record<string, string> = {};
    if (todayRow && canViewTrainerNotes) {
      const notes = dailySkillNotes.filter((row) => row.daily_progress_id === todayRow.id);
      for (const row of notes) {
        noteState[row.skill_id] = row.note;
      }
    }

    setDraftProgressId(todayRow?.id ?? null);
    setDraftStatusBySkillId(baseStatus);
    setDraftNoteBySkillId(noteState);

    if (todayRow) {
      setDraftMessage(`Loaded checklist for ${todayRow.progress_date}.`);
    } else if (previousRow) {
      setDraftMessage(`Prefilled status values from ${previousRow.progress_date}. Add fresh notes for today.`);
    } else {
      setDraftMessage("No previous checklist found. Starting with all skills at Not Yet Introduced.");
    }
  }, [
    activeEnrollment,
    activeEnrollmentSupportsDailyForm,
    activeDate,
    canViewTrainerNotes,
    dailyProgress,
    dailySkillNotes,
    dailySkillProgress,
    skills,
  ]);

  useEffect(() => {
    if (!activeEnrollment) {
      setCertDraft({
        employee_name: "",
        crew_leader_id: "",
        start_date: "",
        certification_date: "",
        crew_leader_approval: "",
        operations_approval: "",
        final_practical_score: "",
        safety_signoff: false,
        quality_signoff: false,
        efficiency_signoff: false,
        workflow_signoff: false,
        equipment_signoff: false,
        customer_standards_signoff: false,
        remediation_plan: "",
        certification_result: "",
      });
      return;
    }

    const existing = certifications.find((row) => row.enrollment_id === activeEnrollment.id) ?? null;
    const employeeName = formatPerson(activeEnrollment.trainee, "");
    setCertDraft({
      employee_name: existing?.employee_name ?? employeeName,
      crew_leader_id: existing?.crew_leader_id ?? "",
      start_date: existing?.start_date ?? activeEnrollment.start_date,
      certification_date: existing?.certification_date ?? "",
      crew_leader_approval: existing?.crew_leader_approval ?? "",
      operations_approval: existing?.operations_approval ?? "",
      final_practical_score: existing?.final_practical_score != null ? String(existing.final_practical_score) : "",
      safety_signoff: existing?.safety_signoff ?? false,
      quality_signoff: existing?.quality_signoff ?? false,
      efficiency_signoff: existing?.efficiency_signoff ?? false,
      workflow_signoff: existing?.workflow_signoff ?? false,
      equipment_signoff: existing?.equipment_signoff ?? false,
      customer_standards_signoff: existing?.customer_standards_signoff ?? false,
      remediation_plan: existing?.remediation_plan ?? "",
      certification_result:
        existing?.certification_result === "Certified Mowing Technician" ||
        existing?.certification_result === "Additional Training Required"
          ? existing.certification_result
          : "",
    });
  }, [activeEnrollment, certifications]);

  const draftScore = useMemo(() => {
    const statuses = Object.values(draftStatusBySkillId);
    if (statuses.length === 0) return 0;
    const total = statuses.reduce((sum, status) => sum + statusToPercent(status), 0);
    return Number((total / statuses.length).toFixed(1));
  }, [draftStatusBySkillId]);

  const trainerRowsForEditor = useMemo(() => {
    if (isManagementOrMechanic || isLead) {
      return apprenticeRows;
    }
    if (!viewerId) return [] as DashboardEnrollment[];
    return apprenticeRows.filter((row) => row.trainer_id === viewerId);
  }, [apprenticeRows, viewerId, isManagementOrMechanic, isLead]);

  const traineeProfileOptions = useMemo(() => {
    return profiles
      .filter((profile) => (profile.role || "").trim().toLowerCase() === "apprentice")
      .sort((a, b) => formatPerson(a, "").localeCompare(formatPerson(b, "")));
  }, [profiles]);

  const trainerProfileOptions = useMemo(() => {
    return profiles
      .filter((profile) => {
        const role = (profile.role || "").trim().toLowerCase();
        return role !== "apprentice";
      })
      .sort((a, b) => formatPerson(a, "").localeCompare(formatPerson(b, "")));
  }, [profiles]);

  const traineeBadgeOptions = useMemo(
    () =>
      traineeProfileOptions.map(
        (profile) =>
          ({
            id: profile.id,
            first_name: profile.first_name,
            last_name: profile.last_name,
            nickname: profile.nickname,
            full_name: profile.full_name,
            email: profile.email,
            department: profile.department,
            role: profile.role,
            status: profile.status,
          }) as EmployeeBadgeOption
      ),
    [traineeProfileOptions]
  );

  const trainerBadgeOptions = useMemo(
    () =>
      trainerProfileOptions.map(
        (profile) =>
          ({
            id: profile.id,
            first_name: profile.first_name,
            last_name: profile.last_name,
            nickname: profile.nickname,
            full_name: profile.full_name,
            email: profile.email,
            department: profile.department,
            role: profile.role,
            status: profile.status,
          }) as EmployeeBadgeOption
      ),
    [trainerProfileOptions]
  );

  useEffect(() => {
    let active = true;
    const ids = Array.from(
      new Set([...traineeBadgeOptions, ...trainerBadgeOptions].map((row) => row.id).filter(Boolean))
    );
    if (!ids.length) {
      void Promise.resolve().then(() => {
        if (!active) return;
        setAvatarUrlById({});
      });
      return;
    }
    void (async () => {
      const urls = await fetchEmployeeAvatarUrls(ids);
      if (!active) return;
      setAvatarUrlById(urls);
    })();
    return () => {
      active = false;
    };
  }, [trainerBadgeOptions, traineeBadgeOptions]);

  async function saveDailyProgress() {
    if (!viewerId || !program || !activeEnrollment || !canEditAnyProgress) return;
    if (!activeEnrollmentSupportsDailyForm) {
      setError("Daily checklist is not configured for this department yet.");
      return;
    }

    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      const supabase = createSupabaseBrowser();
      const maxWeeks = program.program_length_weeks || 4;
      const weekNumber = getWeekFromStart(activeEnrollment.start_date, activeDate, maxWeeks);

      let progressId = draftProgressId;

      if (!progressId) {
        const { data, error: insertError } = await supabase
          .from("academy_training_daily_progress")
          .insert({
            enrollment_id: activeEnrollment.id,
            progress_date: activeDate,
            week_number: weekNumber,
            trainer_id: viewerId,
            submitted_by: viewerId,
            completion_percent: draftScore,
          })
          .select("id")
          .single();

        if (insertError) throw insertError;
        progressId = data.id as string;
      } else {
        const { error: updateError } = await supabase
          .from("academy_training_daily_progress")
          .update({
            week_number: weekNumber,
            trainer_id: viewerId,
            submitted_by: viewerId,
            completion_percent: draftScore,
            updated_at: new Date().toISOString(),
          })
          .eq("id", progressId);

        if (updateError) throw updateError;
      }

      const skillRows = skills.map((skill) => ({
        daily_progress_id: progressId,
        skill_id: skill.id,
        status: Number(draftStatusBySkillId[skill.id] || 1),
        updated_at: new Date().toISOString(),
      }));

      const { error: upsertSkillError } = await supabase
        .from("academy_training_daily_skill_progress")
        .upsert(skillRows, { onConflict: "daily_progress_id,skill_id" });

      if (upsertSkillError) throw upsertSkillError;

      if (canViewTrainerNotes) {
        const nonEmptyNoteRows = skills
          .map((skill) => ({
            daily_progress_id: progressId,
            skill_id: skill.id,
            note: (draftNoteBySkillId[skill.id] || "").trim(),
            created_by: viewerId,
            updated_at: new Date().toISOString(),
          }))
          .filter((row) => row.note.length > 0);

        if (nonEmptyNoteRows.length > 0) {
          const { error: upsertNoteError } = await supabase
            .from("academy_training_daily_skill_notes")
            .upsert(nonEmptyNoteRows, { onConflict: "daily_progress_id,skill_id" });
          if (upsertNoteError) throw upsertNoteError;
        }

        const keepSkillIds = new Set(nonEmptyNoteRows.map((row) => row.skill_id));
        const existingRows = dailySkillNotes.filter((row) => row.daily_progress_id === progressId);
        const toDelete = existingRows.filter((row) => !keepSkillIds.has(row.skill_id));
        if (toDelete.length > 0) {
          const { error: deleteNoteError } = await supabase
            .from("academy_training_daily_skill_notes")
            .delete()
            .eq("daily_progress_id", progressId)
            .in(
              "skill_id",
              toDelete.map((row) => row.skill_id)
            );
          if (deleteNoteError) throw deleteNoteError;
        }
      }

      setDraftProgressId(progressId);
      setInfo("Daily progression checklist saved.");
      await loadTrainingData();
    } catch (err) {
      console.error("[academy-training] save progress error", err);
      setError(err instanceof Error ? err.message : "Failed to save daily progression.");
    } finally {
      setSaving(false);
    }
  }

  async function saveCertification() {
    if (!viewerId || !activeEnrollment || !canEditAnyProgress) return;

    const scoreInput = certDraft.final_practical_score.trim();
    let finalPracticalScore: number | null = null;
    if (scoreInput.length > 0) {
      const parsed = Number(scoreInput);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        setError("Final practical score must be a number between 0 and 100.");
        return;
      }
      finalPracticalScore = Number(parsed.toFixed(2));
    }

    const remediationPlan = certDraft.remediation_plan.trim();
    const requiresAllSignoffs =
      certDraft.safety_signoff &&
      certDraft.quality_signoff &&
      certDraft.efficiency_signoff &&
      certDraft.workflow_signoff &&
      certDraft.equipment_signoff &&
      certDraft.customer_standards_signoff;

    if (certDraft.certification_result === "Certified Mowing Technician") {
      if (!certDraft.certification_date) {
        setError("Certification date is required before marking a trainee certified.");
        return;
      }
      if (finalPracticalScore == null || finalPracticalScore < CERTIFICATION_MIN_SCORE) {
        setError(`Final practical score must be at least ${CERTIFICATION_MIN_SCORE}% to certify.`);
        return;
      }
      if (!requiresAllSignoffs) {
        setError("All certification signoffs must be completed before certification.");
        return;
      }
      if (openCriticalIncidentCount > 0) {
        setError("Resolve all open critical incidents before certification.");
        return;
      }
    }

    if (certDraft.certification_result === "Additional Training Required" && remediationPlan.length === 0) {
      setError("Remediation plan is required when additional training is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      const supabase = createSupabaseBrowser();
      const existing = currentCertification;

      const payload = {
        enrollment_id: activeEnrollment.id,
        employee_name: certDraft.employee_name.trim() || formatPerson(activeEnrollment.trainee, ""),
        crew_leader_id: certDraft.crew_leader_id || null,
        start_date: certDraft.start_date || activeEnrollment.start_date,
        certification_date: certDraft.certification_date || null,
        crew_leader_approval: certDraft.crew_leader_approval.trim() || null,
        operations_approval: certDraft.operations_approval.trim() || null,
        final_practical_score: finalPracticalScore,
        safety_signoff: certDraft.safety_signoff,
        quality_signoff: certDraft.quality_signoff,
        efficiency_signoff: certDraft.efficiency_signoff,
        workflow_signoff: certDraft.workflow_signoff,
        equipment_signoff: certDraft.equipment_signoff,
        customer_standards_signoff: certDraft.customer_standards_signoff,
        remediation_plan: remediationPlan || null,
        certification_result: certDraft.certification_result || null,
        updated_by: viewerId,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        const { error: updateError } = await supabase
          .from("academy_training_certifications")
          .update(payload)
          .eq("id", existing.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("academy_training_certifications")
          .insert({
            ...payload,
            created_by: viewerId,
          });
        if (insertError) throw insertError;
      }

      setInfo("Certification section saved.");
      await loadTrainingData();
    } catch (err) {
      console.error("[academy-training] save certification error", err);
      setError(err instanceof Error ? err.message : "Failed to save certification.");
    } finally {
      setSaving(false);
    }
  }

  async function saveIncidentLog() {
    if (!viewerId || !activeEnrollment || !canEditAnyProgress) return;

    const summary = incidentDraft.summary.trim();
    if (!summary) {
      setError("Incident summary is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      const supabase = createSupabaseBrowser();
      const { error: insertError } = await supabase.from("academy_training_incident_logs").insert({
        enrollment_id: activeEnrollment.id,
        incident_date: incidentDraft.incident_date || todayIso,
        incident_type: incidentDraft.incident_type,
        severity: incidentDraft.severity,
        summary,
        action_taken: incidentDraft.action_taken.trim() || null,
        reported_by: viewerId,
      });
      if (insertError) throw insertError;

      setIncidentDraft({
        incident_date: todayIso,
        incident_type: "near_miss",
        severity: "low",
        summary: "",
        action_taken: "",
      });
      setInfo("Incident logged.");
      await loadTrainingData();
    } catch (err) {
      console.error("[academy-training] save incident error", err);
      setError(err instanceof Error ? err.message : "Failed to save incident log.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleIncidentResolved(incident: IncidentLogRow) {
    if (!canEditAnyProgress) return;

    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      const supabase = createSupabaseBrowser();
      const { error: updateError } = await supabase
        .from("academy_training_incident_logs")
        .update({
          resolved_at: incident.resolved_at ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", incident.id);
      if (updateError) throw updateError;

      setInfo(incident.resolved_at ? "Incident reopened." : "Incident marked as resolved.");
      await loadTrainingData();
    } catch (err) {
      console.error("[academy-training] resolve incident error", err);
      setError(err instanceof Error ? err.message : "Failed to update incident status.");
    } finally {
      setSaving(false);
    }
  }

  async function createEnrollmentAssignment() {
    if (!viewerId || !program || !canManageAssignments) return;
    if (!assignmentDraft.trainee_id) {
      setError("Select an apprentice for assignment.");
      return;
    }

    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      const supabase = createSupabaseBrowser();
      const trainee = profileById.get(assignmentDraft.trainee_id) ?? null;
      const dept = trainee?.department || program.department;

      const startDate = assignmentDraft.start_date || todayIso;
      const targetDateObj = new Date(`${startDate}T00:00:00`);
      targetDateObj.setDate(targetDateObj.getDate() + 28);
      const targetDate = toIsoDate(targetDateObj);

      const { error: insertError } = await supabase.from("academy_training_enrollments").insert({
        program_id: program.id,
        trainee_id: assignmentDraft.trainee_id,
        trainer_id: assignmentDraft.trainer_id || null,
        department: dept,
        start_date: startDate,
        target_completion_date: targetDate,
        is_active: true,
        created_by: viewerId,
      });

      if (insertError) throw insertError;

      setAssignmentDraft({
        trainee_id: "",
        trainer_id: "",
        start_date: todayIso,
      });
      setInfo("Apprentice assignment created.");
      await loadTrainingData();
    } catch (err) {
      console.error("[academy-training] create assignment error", err);
      setError(err instanceof Error ? err.message : "Failed to create assignment.");
    } finally {
      setSaving(false);
    }
  }

  async function updateEnrollmentTrainer(enrollmentId: string, trainerId: string) {
    if (!canManageAssignments) return;
    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      const supabase = createSupabaseBrowser();
      const { error: updateError } = await supabase
        .from("academy_training_enrollments")
        .update({
          trainer_id: trainerId || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", enrollmentId);
      if (updateError) throw updateError;
      setInfo("Trainer assignment updated.");
      await loadTrainingData();
    } catch (err) {
      console.error("[academy-training] update trainer error", err);
      setError(err instanceof Error ? err.message : "Failed to update trainer assignment.");
    } finally {
      setSaving(false);
    }
  }

  if (!viewerId) {
    return null;
  }

  if (loading) {
    return <section style={cardStyle}>Loading trainee dashboards...</section>;
  }

  if (!program) {
    return (
      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Training Program</h2>
        <div style={{ opacity: 0.75 }}>No training program is active yet.</div>
      </section>
    );
  }

  return (
    <section style={{ ...cardStyle, marginBottom: 6 }}>
      <h2 style={{ marginTop: 0, marginBottom: 8 }}>{program.name}</h2>
      <div style={{ opacity: 0.78, marginBottom: 12 }}>
        Field-based progression tracking for mowing apprentices. MEATS = Mow, Edge, Air, Three, Sixty.
      </div>

      <div style={summaryGridStyle}>
        <SummaryTile title="Week 1" subtitle="Foundations" value="25% Goal" />
        <SummaryTile title="Week 2" subtitle="Operational Development" value="50% Goal" />
        <SummaryTile title="Week 3" subtitle="Efficiency & Quality" value="75% Goal" />
        <SummaryTile title="Week 4" subtitle="Independent Technician Development" value="100% Goal" />
      </div>

      {error ? <div style={{ ...inlineMessageStyle, color: "#ffb4b4" }}>{error}</div> : null}
      {info ? <div style={{ ...inlineMessageStyle, color: "#a6ffbe" }}>{info}</div> : null}

      {viewerRole === "apprentice" ? (
        <TraineeDashboard
          rows={selfApprenticeRows}
          skillsByWeek={skillsByWeek}
          dailySkillProgress={dailySkillProgress}
        />
      ) : null}

      {(isTeammateRole || isLead || isManagementOrMechanic) && viewerRole !== "apprentice" ? (
        <TeammateDashboard title="Teammate Dashboard" rows={deptApprenticeRows} department={viewerDepartment} />
      ) : null}

      {canViewCompanyDepartments ? <DepartmentDashboard groups={companyDepartmentMap} /> : null}

      {canEditAnyProgress ? (
        <section style={{ ...subCardStyle, marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Trainer Dashboard</h3>
          <div style={{ opacity: 0.78, marginBottom: 12 }}>
            Edit apprentice daily progression. Status values prefill from the prior day; add fresh notes for each skill as needed.
          </div>

          {canManageAssignments ? (
            <section style={{ ...innerCardStyle, marginBottom: 12 }}>
              <h4 style={{ marginTop: 0 }}>Assign Apprentice</h4>
              <div style={threeColGridStyle}>
                <Field label="Apprentice">
                  <EmployeeMenuSelect
                    value={assignmentDraft.trainee_id}
                    onChange={(nextValue) =>
                      setAssignmentDraft((prev) => ({ ...prev, trainee_id: nextValue }))
                    }
                    options={traineeBadgeOptions}
                    placeholder="Select apprentice..."
                    avatarUrlById={avatarUrlById}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Trainer">
                  <EmployeeMenuSelect
                    value={assignmentDraft.trainer_id}
                    onChange={(nextValue) =>
                      setAssignmentDraft((prev) => ({ ...prev, trainer_id: nextValue }))
                    }
                    options={trainerBadgeOptions}
                    placeholder="Unassigned"
                    allowClear
                    clearLabel="Unassigned"
                    avatarUrlById={avatarUrlById}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Start Date">
                  <input
                    type="date"
                    value={assignmentDraft.start_date}
                    onChange={(e) => setAssignmentDraft((prev) => ({ ...prev, start_date: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
              </div>
              <div style={{ marginTop: 10 }}>
                <button type="button" style={actionButtonStyle} onClick={() => void createEnrollmentAssignment()} disabled={saving}>
                  {saving ? "Saving..." : "Assign Apprentice"}
                </button>
              </div>
            </section>
          ) : null}

          <section style={{ ...innerCardStyle, marginBottom: 12 }}>
            <h4 style={{ marginTop: 0 }}>Apprentices Under Training</h4>
            {trainerRowsForEditor.length === 0 ? (
              <div style={{ opacity: 0.72 }}>No apprentices currently assigned to your trainer scope.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {trainerRowsForEditor.map((row) => (
                  <div key={row.id} style={rowCardStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{formatPerson(row.trainee)}</div>
                        <div style={{ opacity: 0.75, fontSize: 13 }}>
                          Score {row.score.toFixed(1)}% · Week {row.currentWeek} target {row.targetWeekGoal}%
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          style={rowActionButtonStyle}
                          onClick={() => {
                            setActiveEnrollmentId(row.id);
                            setActiveDate(todayIso);
                          }}
                        >
                          {hasDailyFormEnabled(row.trainee?.department || row.department) ? "Open Checklist" : "Open Progress"}
                        </button>
                        {canManageAssignments ? (
                          <div style={{ minWidth: 220 }}>
                            <EmployeeMenuSelect
                              value={row.trainer_id ?? ""}
                              onChange={(nextValue) => void updateEnrollmentTrainer(row.id, nextValue)}
                              options={trainerBadgeOptions}
                              placeholder="Set trainer..."
                              allowClear
                              clearLabel="Unassigned"
                              avatarUrlById={avatarUrlById}
                              style={inputStyle}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {activeEnrollment ? (
            <section style={innerCardStyle}>
              <h4 style={{ marginTop: 0 }}>Daily Progression Checklist</h4>
              <div style={{ opacity: 0.78, marginBottom: 10 }}>
                Apprentice: <strong>{formatPerson(activeEnrollment.trainee)}</strong> · Trainer: {formatPerson(activeEnrollment.trainer)}
              </div>
              {activeEnrollmentSupportsDailyForm ? (
                <>
                  <div style={twoColGridStyle}>
                    <Field label="Checklist Date">
                      <input
                        type="date"
                        value={activeDate}
                        onChange={(e) => setActiveDate(e.target.value)}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Live Draft Score">
                      <div style={scoreBadgeStyle}>{draftScore.toFixed(1)}%</div>
                    </Field>
                  </div>

                  {draftMessage ? <div style={{ opacity: 0.74, marginBottom: 10 }}>{draftMessage}</div> : null}

                  <div style={{ display: "grid", gap: 14, marginBottom: 12 }}>
                    {weeks.map((week) => {
                      const list = skillsByWeek.get(week.week_number) ?? [];
                      const requirement = weekRequirementByWeek.get(week.week_number) ?? null;
                      const weekStatuses = list.map((skill) => draftStatusBySkillId[skill.id] ?? 1);
                      const weekDraftScore =
                        weekStatuses.length > 0
                          ? Number(
                              (
                                weekStatuses.reduce((sum, statusValue) => sum + statusToPercent(statusValue), 0) /
                                weekStatuses.length
                              ).toFixed(1)
                            )
                          : 0;
                      const weekGateMet = requirement ? weekDraftScore >= requirement.min_pass_percent : null;
                      const requireNoOpenIncidents = requirement?.require_no_open_incidents ?? false;
                      return (
                        <section key={week.id} style={weekSectionStyle}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                            <div style={{ fontWeight: 800 }}>
                              Week {week.week_number}: {week.title}
                            </div>
                            <div style={goalBadgeStyle}>{week.goal_percent}% Goal</div>
                          </div>
                          <div style={{ opacity: 0.72, marginTop: 4, marginBottom: 8 }}>{week.goal_description}</div>

                          {requirement ? (
                            <section style={gateCardStyle}>
                              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                                Weekly Gate: {weekDraftScore.toFixed(1)}% / {requirement.min_pass_percent}%{" "}
                                {weekGateMet ? "Pass" : "Needs Work"}
                              </div>
                              <div style={gateGridStyle}>
                                <div style={gateItemStyle}>Safety Gate: {requirement.require_safety_pass ? "Required" : "Optional"}</div>
                                <div style={gateItemStyle}>Quality Gate: {requirement.require_quality_pass ? "Required" : "Optional"}</div>
                                <div style={gateItemStyle}>Efficiency Gate: {requirement.require_efficiency_pass ? "Required" : "Optional"}</div>
                                <div style={gateItemStyle}>
                                  Open Incident Gate:{" "}
                                  {requireNoOpenIncidents
                                    ? openCriticalIncidentCount > 0
                                      ? `Blocked (${openCriticalIncidentCount} critical open)`
                                      : "Clear"
                                    : "Not Required"}
                                </div>
                              </div>
                              {requirement.production_benchmark ? (
                                <div style={{ opacity: 0.75, marginTop: 6 }}>
                                  Benchmark: {requirement.production_benchmark}
                                </div>
                              ) : null}
                              {requirement.quality_defect_tolerance ? (
                                <div style={{ opacity: 0.75, marginTop: 4 }}>
                                  Quality tolerance: {requirement.quality_defect_tolerance}
                                </div>
                              ) : null}
                              {requirement.notes ? <div style={{ opacity: 0.75, marginTop: 4 }}>{requirement.notes}</div> : null}
                            </section>
                          ) : null}

                          <div style={{ display: "grid", gap: 8 }}>
                            {list.map((skill) => {
                              const currentStatus = draftStatusBySkillId[skill.id] ?? 1;
                              const currentNote = draftNoteBySkillId[skill.id] ?? "";
                              const statusLabel = STATUS_OPTIONS.find((option) => option.value === currentStatus)?.label ?? "Not Yet Introduced";
                              const statusColor = STATUS_OPTIONS.find((option) => option.value === currentStatus)?.badge ?? "#3e4047";
                              return (
                                <div key={skill.id} style={skillRowStyle}>
                                  <div style={{ fontWeight: 700 }}>{skill.skill_label}</div>
                                  <div style={skillControlRowStyle}>
                                    <select
                                      value={String(currentStatus)}
                                      onChange={(e) =>
                                        setDraftStatusBySkillId((prev) => ({
                                          ...prev,
                                          [skill.id]: Number(e.target.value),
                                        }))
                                      }
                                      style={{ ...inputStyle, minWidth: 230 }}
                                    >
                                      {STATUS_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.value}. {option.label}
                                        </option>
                                      ))}
                                    </select>
                                    <div style={{ ...statusBadgeStyle, borderColor: statusColor }}>
                                      {statusLabel}
                                    </div>
                                  </div>
                                  {canViewTrainerNotes ? (
                                    <textarea
                                      value={currentNote}
                                      onChange={(e) =>
                                        setDraftNoteBySkillId((prev) => ({
                                          ...prev,
                                          [skill.id]: e.target.value,
                                        }))
                                      }
                                      style={{ ...inputStyle, minHeight: 70 }}
                                      placeholder="Trainer note for today (not visible to apprentice)"
                                    />
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                    <button type="button" style={actionButtonStyle} onClick={() => void saveDailyProgress()} disabled={saving}>
                      {saving ? "Saving..." : "Save Daily Progress"}
                    </button>
                    <button
                      type="button"
                      style={secondaryButtonStyle}
                      onClick={() => {
                        setActiveDate(todayIso);
                        setDraftMessage(null);
                      }}
                    >
                      Reset to Today
                    </button>
                  </div>
                </>
              ) : (
                <div style={departmentNotReadyStyle}>
                  Daily progression checklist is not configured for this department yet. Dashboard scoring and assignment tracking remain available.
                </div>
              )}

              <section style={weekSectionStyle}>
                <h5 style={{ marginTop: 0, marginBottom: 8 }}>Safety & Incident Log</h5>
                <div style={{ opacity: 0.76, marginBottom: 10 }}>
                  Open critical incidents:{" "}
                  <strong style={{ color: openCriticalIncidentCount > 0 ? "#ffb4b4" : "#a6ffbe" }}>
                    {openCriticalIncidentCount}
                  </strong>
                </div>

                <div style={threeColGridStyle}>
                  <Field label="Incident Date">
                    <input
                      type="date"
                      value={incidentDraft.incident_date}
                      onChange={(e) => setIncidentDraft((prev) => ({ ...prev, incident_date: e.target.value }))}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Incident Type">
                    <select
                      value={incidentDraft.incident_type}
                      onChange={(e) =>
                        setIncidentDraft((prev) => ({
                          ...prev,
                          incident_type: e.target.value as IncidentType,
                        }))
                      }
                      style={inputStyle}
                    >
                      {INCIDENT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Severity">
                    <select
                      value={incidentDraft.severity}
                      onChange={(e) =>
                        setIncidentDraft((prev) => ({
                          ...prev,
                          severity: e.target.value as IncidentSeverity,
                        }))
                      }
                      style={inputStyle}
                    >
                      {INCIDENT_SEVERITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Incident Summary">
                  <textarea
                    value={incidentDraft.summary}
                    onChange={(e) => setIncidentDraft((prev) => ({ ...prev, summary: e.target.value }))}
                    style={{ ...inputStyle, minHeight: 65 }}
                    placeholder="What happened?"
                  />
                </Field>

                <Field label="Action Taken (Optional)">
                  <textarea
                    value={incidentDraft.action_taken}
                    onChange={(e) => setIncidentDraft((prev) => ({ ...prev, action_taken: e.target.value }))}
                    style={{ ...inputStyle, minHeight: 65 }}
                    placeholder="Immediate containment or follow-up action"
                  />
                </Field>

                <div style={{ marginTop: 10, marginBottom: 8 }}>
                  <button type="button" style={actionButtonStyle} onClick={() => void saveIncidentLog()} disabled={saving}>
                    {saving ? "Saving..." : "Log Incident"}
                  </button>
                </div>

                {activeEnrollmentIncidents.length === 0 ? (
                  <div style={{ opacity: 0.72 }}>No incidents logged for this apprentice yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    {activeEnrollmentIncidents.map((incident) => {
                      const severityLabel =
                        INCIDENT_SEVERITY_OPTIONS.find((option) => option.value === incident.severity)?.label ?? incident.severity;
                      const severityColor = INCIDENT_SEVERITY_BADGE_BY_VALUE[incident.severity];
                      const reporter = incident.reported_by ? formatPerson(profileById.get(incident.reported_by) ?? null, "Unknown") : "Unknown";
                      return (
                        <div key={incident.id} style={incidentRowStyle}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                            <div style={{ minWidth: 250 }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                                <span style={{ fontWeight: 700 }}>{incident.incident_date}</span>
                                <span style={{ opacity: 0.82 }}>{getIncidentTypeLabel(incident.incident_type)}</span>
                                <span style={{ ...statusBadgeStyle, borderColor: severityColor }}>{severityLabel}</span>
                                <span style={{ ...statusBadgeStyle, borderColor: incident.resolved_at ? "#2f7d54" : "#9c5d2f" }}>
                                  {incident.resolved_at ? "Resolved" : "Open"}
                                </span>
                              </div>
                              <div style={{ fontWeight: 600, marginBottom: 4 }}>{incident.summary}</div>
                              {incident.action_taken ? <div style={{ opacity: 0.77, marginBottom: 4 }}>Action: {incident.action_taken}</div> : null}
                              <div style={{ opacity: 0.72, fontSize: 12 }}>
                                Reported by {reporter}
                                {incident.resolved_at ? ` · Resolved ${incident.resolved_at.slice(0, 10)}` : ""}
                              </div>
                            </div>
                            <button
                              type="button"
                              style={secondaryButtonStyle}
                              onClick={() => void toggleIncidentResolved(incident)}
                              disabled={saving}
                            >
                              {incident.resolved_at ? "Reopen" : "Mark Resolved"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section style={weekSectionStyle}>
                <h5 style={{ marginTop: 0, marginBottom: 8 }}>Post-Certification Followups</h5>
                {activeEnrollmentFollowups.length === 0 ? (
                  <div style={{ opacity: 0.72 }}>
                    Followups auto-populate after certification date is set and result is Certified Mowing Technician.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {activeEnrollmentFollowups.map((followup) => {
                      const reviewerName = followup.reviewer_id
                        ? formatPerson(profileById.get(followup.reviewer_id) ?? null, "Unassigned")
                        : "Unassigned";
                      const isComplete = Boolean(followup.completed_date);
                      return (
                        <div key={followup.id} style={incidentRowStyle}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                                {followup.followup_type === "30_day" ? "30-Day Followup" : "60-Day Followup"} · Due {followup.due_date}
                              </div>
                              <div style={{ opacity: 0.75, fontSize: 13 }}>
                                Status: {isComplete ? `Completed ${followup.completed_date}` : "Open"} · Reviewer: {reviewerName}
                              </div>
                              {followup.score_percent != null ? (
                                <div style={{ opacity: 0.8, fontSize: 13, marginTop: 2 }}>
                                  Followup score: {Number(followup.score_percent).toFixed(1)}%
                                </div>
                              ) : null}
                              {followup.notes ? <div style={{ opacity: 0.78, marginTop: 4 }}>{followup.notes}</div> : null}
                            </div>
                            <span style={{ ...statusBadgeStyle, borderColor: isComplete ? "#2f7d54" : "#7d6b2f", height: "fit-content" }}>
                              {isComplete ? "Complete" : "Pending"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section style={weekSectionStyle}>
                <h5 style={{ marginTop: 0, marginBottom: 8 }}>Final Certification</h5>
                <div style={threeColGridStyle}>
                  <Field label="Employee Name">
                    <input
                      value={certDraft.employee_name}
                      onChange={(e) => setCertDraft((prev) => ({ ...prev, employee_name: e.target.value }))}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Crew Leader">
                    <EmployeeMenuSelect
                      value={certDraft.crew_leader_id}
                      onChange={(nextValue) =>
                        setCertDraft((prev) => ({ ...prev, crew_leader_id: nextValue }))
                      }
                      options={trainerBadgeOptions}
                      placeholder="Select crew leader..."
                      avatarUrlById={avatarUrlById}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Start Date">
                    <input
                      type="date"
                      value={certDraft.start_date}
                      onChange={(e) => setCertDraft((prev) => ({ ...prev, start_date: e.target.value }))}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Certification Date">
                    <input
                      type="date"
                      value={certDraft.certification_date}
                      onChange={(e) => setCertDraft((prev) => ({ ...prev, certification_date: e.target.value }))}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Crew Leader Approval">
                    <input
                      value={certDraft.crew_leader_approval}
                      onChange={(e) => setCertDraft((prev) => ({ ...prev, crew_leader_approval: e.target.value }))}
                      style={inputStyle}
                      placeholder="Name / signed"
                    />
                  </Field>
                  <Field label="Operations Approval">
                    <input
                      value={certDraft.operations_approval}
                      onChange={(e) => setCertDraft((prev) => ({ ...prev, operations_approval: e.target.value }))}
                      style={inputStyle}
                      placeholder="Name / signed"
                    />
                  </Field>
                  <Field label={`Final Practical Score (>= ${CERTIFICATION_MIN_SCORE}%)`}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={certDraft.final_practical_score}
                      onChange={(e) => setCertDraft((prev) => ({ ...prev, final_practical_score: e.target.value }))}
                      style={inputStyle}
                      placeholder="0 - 100"
                    />
                  </Field>
                </div>

                <div style={{ opacity: 0.75, marginTop: 8, marginBottom: 8 }}>
                  Certification gates require score threshold, all signoffs, and no open critical incidents.
                </div>
                <div style={signoffGridStyle}>
                  {CERTIFICATION_SIGNOFF_FIELDS.map((field) => (
                    <label key={field.key} style={checkboxRowStyle}>
                      <input
                        type="checkbox"
                        checked={certDraft[field.key]}
                        onChange={(e) =>
                          setCertDraft((prev) => ({
                            ...prev,
                            [field.key]: e.target.checked,
                          }))
                        }
                      />
                      <span>{field.label}</span>
                    </label>
                  ))}
                </div>

                <Field label="Certification Result">
                  <select
                    value={certDraft.certification_result}
                    onChange={(e) =>
                      setCertDraft((prev) => ({
                        ...prev,
                        certification_result: e.target.value as CertificationDraft["certification_result"],
                      }))
                    }
                    style={{ ...inputStyle, maxWidth: 340 }}
                  >
                    <option value="">Select result...</option>
                    <option value="Certified Mowing Technician">Certified Mowing Technician</option>
                    <option value="Additional Training Required">Additional Training Required</option>
                  </select>
                </Field>

                <Field
                  label={
                    certDraft.certification_result === "Additional Training Required"
                      ? "Remediation Plan (Required)"
                      : "Remediation Plan (Optional)"
                  }
                >
                  <textarea
                    value={certDraft.remediation_plan}
                    onChange={(e) => setCertDraft((prev) => ({ ...prev, remediation_plan: e.target.value }))}
                    style={{ ...inputStyle, minHeight: 75 }}
                    placeholder="Targeted retraining plan, timeline, and reassessment criteria"
                  />
                </Field>

                <div style={{ marginTop: 10 }}>
                  <button type="button" style={actionButtonStyle} onClick={() => void saveCertification()} disabled={saving}>
                    {saving ? "Saving..." : "Save Certification"}
                  </button>
                </div>
              </section>
            </section>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

function SummaryTile({ title, subtitle, value }: { title: string; subtitle: string; value: string }) {
  return (
    <div style={summaryTileStyle}>
      <div style={{ fontSize: 12, opacity: 0.72 }}>{title}</div>
      <div style={{ fontWeight: 800 }}>{subtitle}</div>
      <div style={{ color: "#9dffb8", marginTop: 2, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function TraineeDashboard({
  rows,
  skillsByWeek,
  dailySkillProgress,
}: {
  rows: DashboardEnrollment[];
  skillsByWeek: Map<number, SkillRow[]>;
  dailySkillProgress: DailySkillProgressRow[];
}) {
  if (rows.length === 0) {
    return (
      <section style={{ ...subCardStyle, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Trainee Dashboard</h3>
        <div style={{ opacity: 0.72 }}>No active training assignment found.</div>
      </section>
    );
  }

  const row = rows[0];
  const dailyFormEnabled = hasDailyFormEnabled(row.trainee?.department || row.department);
  const latestRow = row.latestProgress;
  const statusBySkill = new Map<string, number>();
  if (latestRow) {
    for (const skill of dailySkillProgress.filter((entry) => entry.daily_progress_id === latestRow.id)) {
      statusBySkill.set(skill.skill_id, skill.status);
    }
  }

  return (
    <section style={{ ...subCardStyle, marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>Trainee Dashboard</h3>
      <div style={{ opacity: 0.78, marginBottom: 10 }}>
        Current score: <strong>{row.score.toFixed(1)}%</strong> · Current week: {row.currentWeek} · Target: {row.targetWeekGoal}%
      </div>
      {!dailyFormEnabled ? (
        <div style={departmentNotReadyStyle}>
          Daily progression checklist is not configured for your department yet. Your progress dashboard will update when that checklist is enabled.
        </div>
      ) : null}
      <div style={{ opacity: 0.72, marginBottom: 10 }}>
        Daily progression checklist {latestRow ? `(latest update: ${latestRow.progress_date})` : "(no checklist submitted yet)"}
      </div>

      {dailyFormEnabled && latestRow ? (
        <div style={{ display: "grid", gap: 10 }}>
          {[...skillsByWeek.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([weekNumber, list]) => (
              <section key={weekNumber} style={weekSectionStyle}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Week {weekNumber}</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {list.map((skill) => {
                    const statusValue = statusBySkill.get(skill.id) ?? 1;
                    const status = STATUS_OPTIONS.find((option) => option.value === statusValue) ?? STATUS_OPTIONS[0];
                    return (
                      <div key={skill.id} style={readonlySkillRowStyle}>
                        <span>{skill.skill_label}</span>
                        <span style={{ ...statusBadgeStyle, borderColor: status.badge }}>{status.label}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
        </div>
      ) : dailyFormEnabled ? (
        <div style={{ opacity: 0.74 }}>Your trainer has not submitted a checklist yet.</div>
      ) : null}
    </section>
  );
}

function TeammateDashboard({ title, rows, department }: { title: string; rows: DashboardEnrollment[]; department: string | null }) {
  return (
    <section style={{ ...subCardStyle, marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div style={{ opacity: 0.78, marginBottom: 10 }}>
        Department: <strong>{department || "Unassigned"}</strong>
      </div>
      {rows.length === 0 ? (
        <div style={{ opacity: 0.72 }}>No apprentice records found for this department.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((row) => (
            <div key={row.id} style={rowCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{formatPerson(row.trainee)}</div>
                  <div style={{ opacity: 0.72, fontSize: 13 }}>
                    Trainer: {formatPerson(row.trainer)} · Last update: {row.latestProgress?.progress_date ?? "None"}
                  </div>
                </div>
                <div style={scoreBadgeStyle}>{row.score.toFixed(1)}%</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DepartmentDashboard({ groups }: { groups: Map<string, DashboardEnrollment[]> }) {
  const entries = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <section style={{ ...subCardStyle, marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>Company Apprentice Progress by Department</h3>
      {entries.length === 0 ? (
        <div style={{ opacity: 0.72 }}>No apprentice data found.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {entries.map(([dept, rows]) => (
            <section key={dept} style={weekSectionStyle}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{dept}</div>
              <div style={{ display: "grid", gap: 8 }}>
                {rows.map((row) => (
                  <div key={row.id} style={readonlySkillRowStyle}>
                    <span>
                      {formatPerson(row.trainee)} · Trainer: {formatPerson(row.trainer)}
                    </span>
                    <span style={scoreBadgeStyle}>{row.score.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.74, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 14,
  padding: 14,
  background: "rgba(255,255,255,0.03)",
};

const subCardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 12,
  padding: 12,
  background: "rgba(255,255,255,0.02)",
};

const innerCardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 12,
  padding: 12,
  background: "rgba(7,10,12,0.55)",
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  marginBottom: 10,
};

const summaryTileStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 10,
  padding: "10px 12px",
  background: "rgba(255,255,255,0.02)",
};

const rowCardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.13)",
  borderRadius: 10,
  padding: "10px 12px",
  background: "rgba(255,255,255,0.02)",
};

const weekSectionStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.13)",
  borderRadius: 10,
  padding: "10px 12px",
  background: "rgba(255,255,255,0.02)",
};

const gateCardStyle: React.CSSProperties = {
  border: "1px solid rgba(126,255,167,0.25)",
  borderRadius: 10,
  padding: "10px 10px",
  background: "rgba(126,255,167,0.07)",
  marginBottom: 10,
};

const gateGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 6,
};

const gateItemStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  padding: "6px 8px",
  background: "rgba(7,10,12,0.35)",
  fontSize: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
  padding: "8px 10px",
};

const twoColGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  marginBottom: 10,
};

const threeColGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
};

const scoreBadgeStyle: React.CSSProperties = {
  border: "1px solid rgba(126,255,167,0.35)",
  borderRadius: 999,
  background: "rgba(126,255,167,0.14)",
  padding: "4px 10px",
  fontWeight: 700,
  width: "fit-content",
};

const goalBadgeStyle: React.CSSProperties = {
  border: "1px solid rgba(126,255,167,0.32)",
  borderRadius: 999,
  background: "rgba(126,255,167,0.12)",
  padding: "2px 10px",
  fontSize: 12,
  fontWeight: 700,
};

const actionButtonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(126,255,167,0.35)",
  background: "rgba(126,255,167,0.14)",
  color: "inherit",
  padding: "8px 12px",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  padding: "8px 12px",
  fontWeight: 700,
  cursor: "pointer",
};

const rowActionButtonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  padding: "7px 10px",
  fontWeight: 700,
  cursor: "pointer",
};

const skillRowStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  padding: "10px 10px",
  background: "rgba(255,255,255,0.02)",
  display: "grid",
  gap: 8,
};

const incidentRowStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  padding: "8px 10px",
  background: "rgba(255,255,255,0.03)",
};

const readonlySkillRowStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.11)",
  borderRadius: 10,
  padding: "8px 10px",
  background: "rgba(255,255,255,0.02)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const skillControlRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const statusBadgeStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.25)",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 700,
  background: "rgba(255,255,255,0.04)",
};

const signoffGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  marginBottom: 10,
};

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 10,
  padding: "8px 10px",
  background: "rgba(255,255,255,0.02)",
};

const inlineMessageStyle: React.CSSProperties = {
  marginBottom: 8,
  fontSize: 13,
};

const departmentNotReadyStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.03)",
  padding: "10px 12px",
  opacity: 0.86,
  marginBottom: 10,
};
