"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type AccountabilityCategory = "attendance" | "quality" | "safety" | "procedural";
type ProgramStep = "Step 1" | "Step 2" | "Step 3" | "Step 4";

type OccurrenceRow = {
  id: number;
  created_at: string;
  teammate_id: string;
  manager_id: string;
  category: AccountabilityCategory;
  occurrence_type: string;
  occurrence_date: string;
  falloff_date: string;
  status: "Active" | "Complete";
  step_of_program: ProgramStep;
  meeting_date: string | null;
  linked_form_id: number | null;
  immediate_termination: boolean;
  notes: string | null;
};

type AccountabilityFormRow = {
  id: number;
  created_at: string;
  teammate_id: string;
  manager_id: string;
  category: AccountabilityCategory;
  form_date: string;
  disciplinary_step: ProgramStep;
  linked_occurrence_id: number | null;
};

type NewOccurrenceState = {
  teammate_id: string;
  manager_id: string;
  category: AccountabilityCategory;
  occurrence_type: string;
  occurrence_date: string;
  step_of_program: ProgramStep;
  meeting_date: string;
  linked_form_id: string;
  immediate_termination: boolean;
  notes: string;
};

type NewFormState = {
  teammate_id: string;
  manager_id: string;
  category: AccountabilityCategory;
  form_date: string;
  disciplinary_step: ProgramStep;
  linked_occurrence_id: string;
  supervisor_explanation: string;
  employee_response: string;
  action_plan: string;
  followup_meeting_date: string;
  employee_signature: string;
  manager_signature: string;
  attendance_tardy_with_notice: string;
  attendance_tardy_without_notice: string;
  attendance_call_in_without_note: string;
  attendance_no_call_no_show: string;
  safety_missing_ppe: boolean;
  safety_unsafe_operation: boolean;
  safety_failure_report_injury: boolean;
  safety_other: string;
  quality_customer_callback: boolean;
  quality_management_callback: boolean;
  quality_other: string;
  procedural_incomplete_checklists: boolean;
  procedural_improper_equipment_prep: boolean;
  procedural_wasting_time: boolean;
  procedural_forms_not_completed: boolean;
  procedural_failure_report_damage: boolean;
  procedural_failure_report_status_2pm: boolean;
  procedural_other: string;
  support_guidance: boolean;
  support_training: boolean;
  support_clarification: boolean;
  support_other: string;
};

const CATEGORY_OPTIONS: Array<{ value: AccountabilityCategory; label: string }> = [
  { value: "attendance", label: "Attendance" },
  { value: "quality", label: "Quality" },
  { value: "safety", label: "Safety" },
  { value: "procedural", label: "Procedural" },
];

const OCCURRENCE_TYPES: Record<AccountabilityCategory, string[]> = {
  attendance: ["Tardy", "Tardy without notice", "Call in sick", "No call-no show"],
  quality: ["Call back", "Supervisor notification"],
  safety: ["Missing PPE", "Traffic cones", "Driving infraction", "Other"],
  procedural: ["Incomplete inspection", "Forging of forms"],
};

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

function sectionStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 12,
    background: "rgba(255,255,255,0.02)",
  };
}

function buttonStyle(): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "inherit",
    fontWeight: 800,
    cursor: "pointer",
  };
}

function calcFalloffDate(occurrenceDate: string, step: ProgramStep) {
  if (!occurrenceDate) return "";
  const d = new Date(`${occurrenceDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const months = step === "Step 1" ? 3 : step === "Step 2" ? 2 : 1;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function defaultOccurrence(): NewOccurrenceState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    teammate_id: "",
    manager_id: "",
    category: "attendance",
    occurrence_type: "Tardy",
    occurrence_date: today,
    step_of_program: "Step 1",
    meeting_date: "",
    linked_form_id: "",
    immediate_termination: false,
    notes: "",
  };
}

function defaultForm(): NewFormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    teammate_id: "",
    manager_id: "",
    category: "attendance",
    form_date: today,
    disciplinary_step: "Step 1",
    linked_occurrence_id: "",
    supervisor_explanation: "",
    employee_response: "",
    action_plan: "",
    followup_meeting_date: "",
    employee_signature: "",
    manager_signature: "",
    attendance_tardy_with_notice: "0",
    attendance_tardy_without_notice: "0",
    attendance_call_in_without_note: "0",
    attendance_no_call_no_show: "0",
    safety_missing_ppe: false,
    safety_unsafe_operation: false,
    safety_failure_report_injury: false,
    safety_other: "",
    quality_customer_callback: false,
    quality_management_callback: false,
    quality_other: "",
    procedural_incomplete_checklists: false,
    procedural_improper_equipment_prep: false,
    procedural_wasting_time: false,
    procedural_forms_not_completed: false,
    procedural_failure_report_damage: false,
    procedural_failure_report_status_2pm: false,
    procedural_other: "",
    support_guidance: true,
    support_training: false,
    support_clarification: false,
    support_other: "",
  };
}

function profileLabel(profile: ProfileRow) {
  return profile.full_name?.trim() || profile.email?.trim() || profile.id;
}

export default function AccountabilityTrackerPanel({ profiles }: { profiles: ProfileRow[] }) {
  const supabase = createSupabaseBrowser();
  const [todayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [occurrences, setOccurrences] = useState<OccurrenceRow[]>([]);
  const [forms, setForms] = useState<AccountabilityFormRow[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<"all" | AccountabilityCategory>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "Active" | "Complete">("all");
  const [occurrenceForm, setOccurrenceForm] = useState<NewOccurrenceState>(defaultOccurrence());
  const [disciplineForm, setDisciplineForm] = useState<NewFormState>(defaultForm());
  const [savingOccurrence, setSavingOccurrence] = useState(false);
  const [savingDisciplineForm, setSavingDisciplineForm] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderMsg, setReminderMsg] = useState<string | null>(null);

  const byId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of profiles) m[p.id] = profileLabel(p);
    return m;
  }, [profiles]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [occRes, formRes] = await Promise.all([
      supabase
        .from("accountability_occurrences")
        .select("id,created_at,teammate_id,manager_id,category,occurrence_type,occurrence_date,falloff_date,status,step_of_program,meeting_date,linked_form_id,immediate_termination,notes")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("accountability_forms")
        .select("id,created_at,teammate_id,manager_id,category,form_date,disciplinary_step,linked_occurrence_id")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    if (occRes.error || formRes.error) {
      setError(occRes.error?.message || formRes.error?.message || "Failed to load tracker.");
      setLoading(false);
      return;
    }
    setOccurrences((occRes.data ?? []) as OccurrenceRow[]);
    setForms((formRes.data ?? []) as AccountabilityFormRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function createOccurrence() {
    setError(null);
    if (!occurrenceForm.teammate_id || !occurrenceForm.manager_id || !occurrenceForm.occurrence_date || !occurrenceForm.occurrence_type) {
      setError("Teammate, manager, occurrence type, and occurrence date are required.");
      return;
    }
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setError("Not authenticated.");
      return;
    }
    setSavingOccurrence(true);
    const payload = {
      created_by: authData.user.id,
      teammate_id: occurrenceForm.teammate_id,
      manager_id: occurrenceForm.manager_id,
      category: occurrenceForm.category,
      occurrence_type: occurrenceForm.occurrence_type,
      occurrence_date: occurrenceForm.occurrence_date,
      step_of_program: occurrenceForm.step_of_program,
      meeting_date: occurrenceForm.meeting_date || null,
      linked_form_id: occurrenceForm.linked_form_id ? Number(occurrenceForm.linked_form_id) : null,
      immediate_termination: occurrenceForm.immediate_termination,
      notes: occurrenceForm.notes.trim() || null,
    };
    const { error: insertError } = await supabase.from("accountability_occurrences").insert(payload);
    setSavingOccurrence(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setOccurrenceForm(defaultOccurrence());
    await refresh();
  }

  async function createDisciplinaryForm() {
    setError(null);
    if (
      !disciplineForm.teammate_id ||
      !disciplineForm.manager_id ||
      !disciplineForm.form_date ||
      !disciplineForm.supervisor_explanation.trim() ||
      !disciplineForm.action_plan.trim()
    ) {
      setError("Teammate, manager, form date, supervisor explanation, and action plan are required.");
      return;
    }
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setError("Not authenticated.");
      return;
    }
    setSavingDisciplineForm(true);
    const reasonDetails = {
      attendance: {
        tardy_with_notice: Number(disciplineForm.attendance_tardy_with_notice || "0"),
        tardy_without_notice: Number(disciplineForm.attendance_tardy_without_notice || "0"),
        call_in_without_note: Number(disciplineForm.attendance_call_in_without_note || "0"),
        no_call_no_show: Number(disciplineForm.attendance_no_call_no_show || "0"),
      },
      safety: {
        missing_ppe: disciplineForm.safety_missing_ppe,
        unsafe_operation: disciplineForm.safety_unsafe_operation,
        failure_report_injury: disciplineForm.safety_failure_report_injury,
        other: disciplineForm.safety_other.trim(),
      },
      quality: {
        customer_callback: disciplineForm.quality_customer_callback,
        management_callback: disciplineForm.quality_management_callback,
        other: disciplineForm.quality_other.trim(),
      },
      procedural: {
        incomplete_checklists: disciplineForm.procedural_incomplete_checklists,
        improper_equipment_prep: disciplineForm.procedural_improper_equipment_prep,
        wasting_time: disciplineForm.procedural_wasting_time,
        forms_not_completed: disciplineForm.procedural_forms_not_completed,
        failure_report_damage: disciplineForm.procedural_failure_report_damage,
        failure_report_status_2pm: disciplineForm.procedural_failure_report_status_2pm,
        other: disciplineForm.procedural_other.trim(),
      },
    };
    const supportFlags = {
      guidance: disciplineForm.support_guidance,
      training: disciplineForm.support_training,
      clarification: disciplineForm.support_clarification,
      other: disciplineForm.support_other.trim(),
    };

    const payload = {
      created_by: authData.user.id,
      teammate_id: disciplineForm.teammate_id,
      manager_id: disciplineForm.manager_id,
      category: disciplineForm.category,
      form_date: disciplineForm.form_date,
      disciplinary_step: disciplineForm.disciplinary_step,
      linked_occurrence_id: disciplineForm.linked_occurrence_id ? Number(disciplineForm.linked_occurrence_id) : null,
      reason_details: reasonDetails,
      supervisor_explanation: disciplineForm.supervisor_explanation.trim(),
      employee_response: disciplineForm.employee_response.trim(),
      action_plan: disciplineForm.action_plan.trim(),
      support_flags: supportFlags,
      support_other: disciplineForm.support_other.trim() || null,
      followup_meeting_date: disciplineForm.followup_meeting_date || null,
      employee_signature: disciplineForm.employee_signature.trim() || null,
      manager_signature: disciplineForm.manager_signature.trim() || null,
    };

    const { data, error: insertError } = await supabase
      .from("accountability_forms")
      .insert(payload)
      .select("id")
      .single();
    setSavingDisciplineForm(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    if (disciplineForm.linked_occurrence_id && data?.id) {
      await supabase
        .from("accountability_occurrences")
        .update({ linked_form_id: data.id })
        .eq("id", Number(disciplineForm.linked_occurrence_id));
    }

    setDisciplineForm(defaultForm());
    await refresh();
  }

  async function markOccurrenceComplete(id: number) {
    setError(null);
    const { error: updateError } = await supabase
      .from("accountability_occurrences")
      .update({ status: "Complete" })
      .eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await refresh();
  }

  async function runReminderCheck() {
    setReminderBusy(true);
    setReminderMsg(null);
    const response = await fetch("/api/accountability/reminders", { method: "POST" });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    setReminderBusy(false);
    if (!response.ok) {
      setReminderMsg(String(payload.error || "Reminder scan failed."));
      return;
    }
    setReminderMsg(
      `Reminder check complete. Occurrences: ${String(payload.reminders ?? 0)} · Notifications: ${String(payload.notificationsCreated ?? 0)}`
    );
  }

  const filteredOccurrences = useMemo(() => {
    return occurrences.filter((row) => {
      if (categoryFilter !== "all" && row.category !== categoryFilter) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      return true;
    });
  }, [categoryFilter, occurrences, statusFilter]);

  const falloffPreview = calcFalloffDate(occurrenceForm.occurrence_date, occurrenceForm.step_of_program);
  const statusPreview =
    falloffPreview && new Date(`${falloffPreview}T00:00:00`).getTime() < new Date(`${todayDate}T00:00:00`).getTime()
      ? "Complete"
      : "Active";

  return (
    <section style={{ marginTop: 16, ...sectionStyle() }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Accountability Tracker</div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>
            Track attendance, quality, safety, and procedural occurrences with linked accountability forms.
          </div>
        </div>
        <button type="button" onClick={() => void runReminderCheck()} style={buttonStyle()} disabled={reminderBusy}>
          {reminderBusy ? "Running..." : "Run reminder check"}
        </button>
      </div>
      {reminderMsg ? <div style={{ marginTop: 8, opacity: 0.85 }}>{reminderMsg}</div> : null}
      {error ? <div style={{ marginTop: 8, color: "#ff9d9d" }}>{error}</div> : null}

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={sectionStyle()}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>New Occurrence</div>
          <div style={{ display: "grid", gap: 8 }}>
            <select
              value={occurrenceForm.teammate_id}
              onChange={(e) => setOccurrenceForm((p) => ({ ...p, teammate_id: e.target.value }))}
              style={inputStyle()}
            >
              <option value="">Teammate Name *</option>
              {profiles.map((p) => (
                <option key={`tm-${p.id}`} value={p.id}>{profileLabel(p)}</option>
              ))}
            </select>
            <select
              value={occurrenceForm.manager_id}
              onChange={(e) => setOccurrenceForm((p) => ({ ...p, manager_id: e.target.value }))}
              style={inputStyle()}
            >
              <option value="">Manager / Lead *</option>
              {profiles.map((p) => (
                <option key={`mgr-${p.id}`} value={p.id}>{profileLabel(p)}</option>
              ))}
            </select>
            <select
              value={occurrenceForm.category}
              onChange={(e) =>
                setOccurrenceForm((p) => ({
                  ...p,
                  category: e.target.value as AccountabilityCategory,
                  occurrence_type: OCCURRENCE_TYPES[e.target.value as AccountabilityCategory][0] || "",
                }))
              }
              style={inputStyle()}
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <select
              value={occurrenceForm.occurrence_type}
              onChange={(e) => setOccurrenceForm((p) => ({ ...p, occurrence_type: e.target.value }))}
              style={inputStyle()}
            >
              {OCCURRENCE_TYPES[occurrenceForm.category].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <input
              type="date"
              value={occurrenceForm.occurrence_date}
              onChange={(e) => setOccurrenceForm((p) => ({ ...p, occurrence_date: e.target.value }))}
              style={inputStyle()}
            />
            <select
              value={occurrenceForm.step_of_program}
              onChange={(e) => setOccurrenceForm((p) => ({ ...p, step_of_program: e.target.value as ProgramStep }))}
              style={inputStyle()}
            >
              <option value="Step 1">Step 1</option>
              <option value="Step 2">Step 2</option>
              <option value="Step 3">Step 3</option>
              <option value="Step 4">Step 4</option>
            </select>
            <input
              type="date"
              value={occurrenceForm.meeting_date}
              onChange={(e) => setOccurrenceForm((p) => ({ ...p, meeting_date: e.target.value }))}
              style={inputStyle()}
              placeholder="Date of meeting (if applicable)"
            />
            <select
              value={occurrenceForm.linked_form_id}
              onChange={(e) => setOccurrenceForm((p) => ({ ...p, linked_form_id: e.target.value }))}
              style={inputStyle()}
            >
              <option value="">Linked accountability form (optional)</option>
              {forms.map((f) => (
                <option key={`form-${f.id}`} value={String(f.id)}>
                  Form #{f.id} · {byId[f.teammate_id] || f.teammate_id} · {f.form_date}
                </option>
              ))}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={occurrenceForm.immediate_termination}
                onChange={(e) => setOccurrenceForm((p) => ({ ...p, immediate_termination: e.target.checked }))}
              />
              Immediate-termination violation
            </label>
            <textarea
              value={occurrenceForm.notes}
              onChange={(e) => setOccurrenceForm((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
              placeholder="Notes"
              style={{ ...inputStyle(), resize: "vertical" }}
            />
            <div style={{ opacity: 0.78, fontSize: 13 }}>
              Fall-off date: <strong>{falloffPreview || "—"}</strong> · Status: <strong>{statusPreview}</strong>
            </div>
            <button type="button" onClick={() => void createOccurrence()} style={buttonStyle()} disabled={savingOccurrence}>
              {savingOccurrence ? "Saving..." : "Add occurrence"}
            </button>
          </div>
        </div>

        <div style={sectionStyle()}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Accountability Form</div>
          <div style={{ display: "grid", gap: 8 }}>
            <select
              value={disciplineForm.teammate_id}
              onChange={(e) => setDisciplineForm((p) => ({ ...p, teammate_id: e.target.value }))}
              style={inputStyle()}
            >
              <option value="">Employee Name *</option>
              {profiles.map((p) => (
                <option key={`form-tm-${p.id}`} value={p.id}>{profileLabel(p)}</option>
              ))}
            </select>
            <input type="date" value={disciplineForm.form_date} onChange={(e) => setDisciplineForm((p) => ({ ...p, form_date: e.target.value }))} style={inputStyle()} />
            <select
              value={disciplineForm.manager_id}
              onChange={(e) => setDisciplineForm((p) => ({ ...p, manager_id: e.target.value }))}
              style={inputStyle()}
            >
              <option value="">Supervisor / Manager *</option>
              {profiles.map((p) => (
                <option key={`form-mgr-${p.id}`} value={p.id}>{profileLabel(p)}</option>
              ))}
            </select>
            <select value={disciplineForm.category} onChange={(e) => setDisciplineForm((p) => ({ ...p, category: e.target.value as AccountabilityCategory }))} style={inputStyle()}>
              {CATEGORY_OPTIONS.map((c) => <option key={`form-cat-${c.value}`} value={c.value}>{c.label}</option>)}
            </select>
            <select value={disciplineForm.disciplinary_step} onChange={(e) => setDisciplineForm((p) => ({ ...p, disciplinary_step: e.target.value as ProgramStep }))} style={inputStyle()}>
              <option value="Step 1">Step 1: Verbal Warning (Documented)</option>
              <option value="Step 2">Step 2: Written Warning</option>
              <option value="Step 3">Step 3: Final Written Warning</option>
              <option value="Step 4">Step 4: Termination</option>
            </select>
            <select
              value={disciplineForm.linked_occurrence_id}
              onChange={(e) => setDisciplineForm((p) => ({ ...p, linked_occurrence_id: e.target.value }))}
              style={inputStyle()}
            >
              <option value="">Linked occurrence (optional)</option>
              {occurrences.map((o) => (
                <option key={`occ-${o.id}`} value={String(o.id)}>
                  Occurrence #{o.id} · {o.category} · {o.occurrence_type}
                </option>
              ))}
            </select>

            <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Reason Details</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(120px, 1fr))", gap: 8 }}>
                <input value={disciplineForm.attendance_tardy_with_notice} onChange={(e) => setDisciplineForm((p) => ({ ...p, attendance_tardy_with_notice: e.target.value }))} style={inputStyle()} placeholder="Tardy with notice" />
                <input value={disciplineForm.attendance_tardy_without_notice} onChange={(e) => setDisciplineForm((p) => ({ ...p, attendance_tardy_without_notice: e.target.value }))} style={inputStyle()} placeholder="Tardy without notice" />
                <input value={disciplineForm.attendance_call_in_without_note} onChange={(e) => setDisciplineForm((p) => ({ ...p, attendance_call_in_without_note: e.target.value }))} style={inputStyle()} placeholder="Call-in no note" />
                <input value={disciplineForm.attendance_no_call_no_show} onChange={(e) => setDisciplineForm((p) => ({ ...p, attendance_no_call_no_show: e.target.value }))} style={inputStyle()} placeholder="No-call/no-show" />
              </div>
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                <label><input type="checkbox" checked={disciplineForm.safety_missing_ppe} onChange={(e) => setDisciplineForm((p) => ({ ...p, safety_missing_ppe: e.target.checked }))} /> Missing PPE</label>
                <label><input type="checkbox" checked={disciplineForm.safety_unsafe_operation} onChange={(e) => setDisciplineForm((p) => ({ ...p, safety_unsafe_operation: e.target.checked }))} /> Unsafe operation of equipment</label>
                <label><input type="checkbox" checked={disciplineForm.safety_failure_report_injury} onChange={(e) => setDisciplineForm((p) => ({ ...p, safety_failure_report_injury: e.target.checked }))} /> Failure to report injury/damage</label>
                <input value={disciplineForm.safety_other} onChange={(e) => setDisciplineForm((p) => ({ ...p, safety_other: e.target.value }))} style={inputStyle()} placeholder="Safety other" />
                <label><input type="checkbox" checked={disciplineForm.quality_customer_callback} onChange={(e) => setDisciplineForm((p) => ({ ...p, quality_customer_callback: e.target.checked }))} /> Customer call-back</label>
                <label><input type="checkbox" checked={disciplineForm.quality_management_callback} onChange={(e) => setDisciplineForm((p) => ({ ...p, quality_management_callback: e.target.checked }))} /> Management call-back</label>
                <input value={disciplineForm.quality_other} onChange={(e) => setDisciplineForm((p) => ({ ...p, quality_other: e.target.value }))} style={inputStyle()} placeholder="Quality other" />
                <label><input type="checkbox" checked={disciplineForm.procedural_incomplete_checklists} onChange={(e) => setDisciplineForm((p) => ({ ...p, procedural_incomplete_checklists: e.target.checked }))} /> Incomplete pre/post shift checklists</label>
                <label><input type="checkbox" checked={disciplineForm.procedural_improper_equipment_prep} onChange={(e) => setDisciplineForm((p) => ({ ...p, procedural_improper_equipment_prep: e.target.checked }))} /> Improper equipment prep</label>
                <label><input type="checkbox" checked={disciplineForm.procedural_wasting_time} onChange={(e) => setDisciplineForm((p) => ({ ...p, procedural_wasting_time: e.target.checked }))} /> Wasting company time</label>
                <label><input type="checkbox" checked={disciplineForm.procedural_forms_not_completed} onChange={(e) => setDisciplineForm((p) => ({ ...p, procedural_forms_not_completed: e.target.checked }))} /> Required forms not completed</label>
                <label><input type="checkbox" checked={disciplineForm.procedural_failure_report_damage} onChange={(e) => setDisciplineForm((p) => ({ ...p, procedural_failure_report_damage: e.target.checked }))} /> Failure to report damage</label>
                <label><input type="checkbox" checked={disciplineForm.procedural_failure_report_status_2pm} onChange={(e) => setDisciplineForm((p) => ({ ...p, procedural_failure_report_status_2pm: e.target.checked }))} /> Failure to report crew status by 2:00 PM</label>
                <input value={disciplineForm.procedural_other} onChange={(e) => setDisciplineForm((p) => ({ ...p, procedural_other: e.target.value }))} style={inputStyle()} placeholder="Procedural other" />
              </div>
            </div>

            <textarea value={disciplineForm.supervisor_explanation} onChange={(e) => setDisciplineForm((p) => ({ ...p, supervisor_explanation: e.target.value }))} rows={3} placeholder="Supervisor explanation *" style={{ ...inputStyle(), resize: "vertical" }} />
            <textarea value={disciplineForm.employee_response} onChange={(e) => setDisciplineForm((p) => ({ ...p, employee_response: e.target.value }))} rows={3} placeholder="Employee response" style={{ ...inputStyle(), resize: "vertical" }} />
            <textarea value={disciplineForm.action_plan} onChange={(e) => setDisciplineForm((p) => ({ ...p, action_plan: e.target.value }))} rows={3} placeholder="Action plan *" style={{ ...inputStyle(), resize: "vertical" }} />
            <div style={{ display: "grid", gap: 6 }}>
              <label><input type="checkbox" checked={disciplineForm.support_guidance} onChange={(e) => setDisciplineForm((p) => ({ ...p, support_guidance: e.target.checked }))} /> Continued guidance and monitoring</label>
              <label><input type="checkbox" checked={disciplineForm.support_training} onChange={(e) => setDisciplineForm((p) => ({ ...p, support_training: e.target.checked }))} /> Additional training</label>
              <label><input type="checkbox" checked={disciplineForm.support_clarification} onChange={(e) => setDisciplineForm((p) => ({ ...p, support_clarification: e.target.checked }))} /> Clarification of expectations</label>
              <input value={disciplineForm.support_other} onChange={(e) => setDisciplineForm((p) => ({ ...p, support_other: e.target.value }))} style={inputStyle()} placeholder="Support other" />
            </div>
            <input type="date" value={disciplineForm.followup_meeting_date} onChange={(e) => setDisciplineForm((p) => ({ ...p, followup_meeting_date: e.target.value }))} style={inputStyle()} />
            <input value={disciplineForm.employee_signature} onChange={(e) => setDisciplineForm((p) => ({ ...p, employee_signature: e.target.value }))} style={inputStyle()} placeholder="Employee signature (name)" />
            <input value={disciplineForm.manager_signature} onChange={(e) => setDisciplineForm((p) => ({ ...p, manager_signature: e.target.value }))} style={inputStyle()} placeholder="Manager signature (name)" />
            <button type="button" onClick={() => void createDisciplinaryForm()} style={buttonStyle()} disabled={savingDisciplineForm}>
              {savingDisciplineForm ? "Saving..." : "Create accountability form"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, ...sectionStyle() }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ fontWeight: 800 }}>Occurrence Tracker</div>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as "all" | AccountabilityCategory)} style={{ ...inputStyle(), width: 180 }}>
              <option value="all">All categories</option>
              {CATEGORY_OPTIONS.map((c) => <option key={`filter-${c.value}`} value={c.value}>{c.label}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | "Active" | "Complete")} style={{ ...inputStyle(), width: 160 }}>
              <option value="all">All statuses</option>
              <option value="Active">Active</option>
              <option value="Complete">Complete</option>
            </select>
          </div>
        </div>
        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading tracker...</div>
        ) : filteredOccurrences.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No occurrences found.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {filteredOccurrences.map((row) => (
              <div key={`occ-row-${row.id}`} style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 800 }}>
                    #{row.id} · {row.category} · {row.occurrence_type}
                  </div>
                  <div style={{ opacity: 0.72, fontSize: 12 }}>
                    {row.status} · Step {row.step_of_program.replace("Step ", "")}
                  </div>
                </div>
                <div style={{ marginTop: 6, fontSize: 13, opacity: 0.88 }}>
                  Teammate: {byId[row.teammate_id] || row.teammate_id} · Manager: {byId[row.manager_id] || row.manager_id}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, opacity: 0.82 }}>
                  Occurred: {row.occurrence_date} · Falls off: {row.falloff_date} · Meeting: {row.meeting_date || "—"}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, opacity: 0.82 }}>
                  Linked form: {row.linked_form_id ? `#${row.linked_form_id}` : "None"}{row.immediate_termination ? " · Immediate termination flag" : ""}
                </div>
                {row.notes ? <div style={{ marginTop: 6, opacity: 0.78 }}>{row.notes}</div> : null}
                {row.status === "Active" ? (
                  <div style={{ marginTop: 8 }}>
                    <button type="button" onClick={() => void markOccurrenceComplete(row.id)} style={buttonStyle()}>
                      Mark complete
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
