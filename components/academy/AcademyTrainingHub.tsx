"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import type { AppRole } from "@/lib/roleView";

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
  certification_result: "" | "Certified Mowing Technician" | "Additional Training Required";
};

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
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [dailyProgress, setDailyProgress] = useState<DailyProgressRow[]>([]);
  const [dailySkillProgress, setDailySkillProgress] = useState<DailySkillProgressRow[]>([]);
  const [dailySkillNotes, setDailySkillNotes] = useState<DailySkillNoteRow[]>([]);
  const [certifications, setCertifications] = useState<CertificationRow[]>([]);

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
        setSkills([]);
        setEnrollments([]);
        setDailyProgress([]);
        setDailySkillProgress([]);
        setDailySkillNotes([]);
        setCertifications([]);
        setLoading(false);
        return;
      }

      const [weeksRes, skillsRes, enrollmentsRes, profilesRes] = await Promise.all([
        supabase
          .from("academy_training_weeks")
          .select("id,program_id,week_number,title,goal_percent,goal_description")
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
      if (skillsRes.error) throw skillsRes.error;
      if (enrollmentsRes.error) throw enrollmentsRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const nextWeeks = (weeksRes.data ?? []) as WeekRow[];
      const nextSkills = (skillsRes.data ?? []) as SkillRow[];
      const nextEnrollments = (enrollmentsRes.data ?? []) as EnrollmentRow[];
      const nextProfiles = (profilesRes.data ?? []) as ProfileRow[];

      setWeeks(nextWeeks);
      setSkills(nextSkills);
      setEnrollments(nextEnrollments);
      setProfiles(nextProfiles);

      if (nextEnrollments.length === 0) {
        setDailyProgress([]);
        setDailySkillProgress([]);
        setDailySkillNotes([]);
        setCertifications([]);
        setLoading(false);
        return;
      }

      const enrollmentIds = nextEnrollments.map((row) => row.id);

      const progressRes = await supabase
        .from("academy_training_daily_progress")
        .select("id,enrollment_id,progress_date,week_number,completion_percent")
        .in("enrollment_id", enrollmentIds)
        .order("progress_date", { ascending: false });

      if (progressRes.error) throw progressRes.error;

      const nextProgress = (progressRes.data ?? []) as DailyProgressRow[];
      setDailyProgress(nextProgress);

      const progressIds = nextProgress.map((row) => row.id);
      if (progressIds.length === 0) {
        setDailySkillProgress([]);
        setDailySkillNotes([]);
        setCertifications([]);
        setLoading(false);
        return;
      }

      const [skillProgressRes, notesRes, certificationsRes] = await Promise.all([
        supabase
          .from("academy_training_daily_skill_progress")
          .select("daily_progress_id,skill_id,status")
          .in("daily_progress_id", progressIds),
        supabase
          .from("academy_training_daily_skill_notes")
          .select("daily_progress_id,skill_id,note")
          .in("daily_progress_id", progressIds),
        supabase
          .from("academy_training_certifications")
          .select(
            "id,enrollment_id,employee_name,crew_leader_id,start_date,certification_date,crew_leader_approval,operations_approval,certification_result"
          )
          .in("enrollment_id", enrollmentIds),
      ]);

      if (skillProgressRes.error) throw skillProgressRes.error;
      if (notesRes.error) throw notesRes.error;
      if (certificationsRes.error) throw certificationsRes.error;

      setDailySkillProgress((skillProgressRes.data ?? []) as DailySkillProgressRow[]);
      setDailySkillNotes((notesRes.data ?? []) as DailySkillNoteRow[]);
      setCertifications((certificationsRes.data ?? []) as CertificationRow[]);
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
        <SummaryTile title="Week 2" subtitle="Operational / Independent Ready" value="50% Goal" />
        <SummaryTile title="Week 3" subtitle="Refinement & Consistency" value="75% Goal" />
        <SummaryTile title="Week 4" subtitle="Excellence & Certification" value="100% Goal" />
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
                  <select
                    value={assignmentDraft.trainee_id}
                    onChange={(e) => setAssignmentDraft((prev) => ({ ...prev, trainee_id: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">Select apprentice...</option>
                    {traineeProfileOptions.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {formatPerson(profile)} {profile.department ? `(${profile.department})` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Trainer">
                  <select
                    value={assignmentDraft.trainer_id}
                    onChange={(e) => setAssignmentDraft((prev) => ({ ...prev, trainer_id: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">Unassigned</option>
                    {trainerProfileOptions.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {formatPerson(profile)} {profile.role ? `(${profile.role})` : ""}
                      </option>
                    ))}
                  </select>
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
                          <select
                            value={row.trainer_id ?? ""}
                            onChange={(e) => void updateEnrollmentTrainer(row.id, e.target.value)}
                            style={{ ...inputStyle, minWidth: 220 }}
                          >
                            <option value="">Set trainer...</option>
                            {trainerProfileOptions.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {formatPerson(profile)}
                              </option>
                            ))}
                          </select>
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
                      return (
                        <section key={week.id} style={weekSectionStyle}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                            <div style={{ fontWeight: 800 }}>
                              Week {week.week_number}: {week.title}
                            </div>
                            <div style={goalBadgeStyle}>{week.goal_percent}% Goal</div>
                          </div>
                          <div style={{ opacity: 0.72, marginTop: 4, marginBottom: 8 }}>{week.goal_description}</div>

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
                    <select
                      value={certDraft.crew_leader_id}
                      onChange={(e) => setCertDraft((prev) => ({ ...prev, crew_leader_id: e.target.value }))}
                      style={inputStyle}
                    >
                      <option value="">Select crew leader...</option>
                      {trainerProfileOptions.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {formatPerson(profile)}
                        </option>
                      ))}
                    </select>
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
