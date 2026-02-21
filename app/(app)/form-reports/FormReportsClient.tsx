"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

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
  accountability_flag: boolean;
  accountability_reason: string | null;
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

type AccountabilityActionRow = {
  id: number;
  created_at: string;
  created_by: string;
  target_user_id: string | null;
  role_scope: "teammate" | "mechanic" | "all";
  action_type: "coaching" | "warning" | "critical" | "recognition";
  status: "open" | "resolved" | "dismissed";
  note: string;
  due_date: string | null;
  resolved_at: string | null;
};

type NewActionForm = {
  target_user_id: string;
  role_scope: "teammate" | "mechanic" | "all";
  action_type: "coaching" | "warning" | "critical" | "recognition";
  note: string;
  due_date: string;
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

function maintenanceLogQualityScore(log: MaintenanceLogScoreRow) {
  let objectiveScore = 100;
  if (!log.request_id) objectiveScore -= 6;
  if ((log.status_update ?? "").trim() === "In Progress") objectiveScore -= 8;
  if (!(log.status_update ?? "").trim()) objectiveScore -= 10;
  const notesLength = (log.notes ?? "").trim().length;
  if (notesLength < 20) objectiveScore -= 8;
  if (notesLength === 0) objectiveScore -= 8;
  const objective = clampPercent(objectiveScore);
  return combineMechanicScore(objective, log.mechanic_self_score);
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
  const [actions, setActions] = useState<AccountabilityActionRow[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSaving, setActionSaving] = useState(false);

  const [newAction, setNewAction] = useState<NewActionForm>({
    target_user_id: "",
    role_scope: "teammate",
    action_type: "coaching",
    note: "",
    due_date: "",
  });

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
        actionsRes,
      ] = await Promise.all([
        supabase
          .from("form_submission_grades")
          .select("id,form_type,form_id,submitted_at,submitted_by,vehicle_id,equipment_id,score,is_complete,has_na,accountability_flag,accountability_reason")
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
          .from("accountability_actions")
          .select("id,created_at,created_by,target_user_id,role_scope,action_type,status,note,due_date,resolved_at")
          .order("created_at", { ascending: false })
          .limit(300),
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
      if (!actionsRes.error) {
        setActions((actionsRes.data ?? []) as AccountabilityActionRow[]);
      }
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

  const periodGrades = useMemo(
    () => grades.filter((row) => inPeriod(row.submitted_at, period)),
    [grades, period]
  );

  const periodInspections = useMemo(
    () => inspections.filter((row) => inPeriod(row.created_at, period)),
    [inspections, period]
  );

  const teammateScoreboard = useMemo(() => {
    const map = new Map<
      string,
      {
        forms: number;
        totalScore: number;
        flags: number;
        incomplete: number;
        onTime: number;
        inspections: number;
        failCount: number;
        linkedFailCount: number;
      }
    >();

    for (const row of periodGrades) {
      const name = (row.submitted_by || "Unknown").trim() || "Unknown";
      const current = map.get(name) ?? {
        forms: 0,
        totalScore: 0,
        flags: 0,
        incomplete: 0,
        onTime: 0,
        inspections: 0,
        failCount: 0,
        linkedFailCount: 0,
      };
      current.forms += 1;
      current.totalScore += Number(row.score ?? 0);
      if (row.accountability_flag) current.flags += 1;
      if (!row.is_complete) current.incomplete += 1;
      map.set(name, current);
    }

    for (const row of periodInspections) {
      const meta = parseInspectionMeta(row.checklist);
      const name = meta.employee || "Unknown";
      const current = map.get(name) ?? {
        forms: 0,
        totalScore: 0,
        flags: 0,
        incomplete: 0,
        onTime: 0,
        inspections: 0,
        failCount: 0,
        linkedFailCount: 0,
      };
      current.inspections += 1;
      if (meta.inspectionDate && row.created_at.slice(0, 10) === meta.inspectionDate) {
        current.onTime += 1;
      }
      current.failCount += meta.failCount;
      current.linkedFailCount += Math.min(meta.linkedFailCount, meta.failCount);
      map.set(name, current);
    }

    return Array.from(map.entries())
      .map(([name, row]) => {
        const avgScore = row.forms ? Math.round(row.totalScore / row.forms) : 0;
        const onTimeRate = row.inspections ? Math.round((row.onTime / row.inspections) * 100) : 100;
        const failLinkRate = row.failCount ? Math.round((row.linkedFailCount / row.failCount) * 100) : 100;
        const accountabilityScore = clampPercent(
          avgScore * 0.5 +
            onTimeRate * 0.25 +
            failLinkRate * 0.25 -
            row.flags * 8 -
            row.incomplete * 4
        );
        return {
          name,
          forms: row.forms,
          avgScore,
          onTimeRate,
          failLinkRate,
          flags: row.flags,
          accountabilityScore,
        };
      })
      .sort((a, b) => b.accountabilityScore - a.accountabilityScore || b.forms - a.forms);
  }, [periodGrades, periodInspections]);

  const mechanicScoreboard = useMemo(() => {
    const relevantLogs = maintenanceLogs.filter((row) => inPeriod(row.created_at, period));
    const grouped = new Map<string, { logs: number; totalScore: number; withRequest: number; closed: number }>();
    for (const row of relevantLogs) {
      const key = row.created_by || "unknown";
      const existing = grouped.get(key) ?? { logs: 0, totalScore: 0, withRequest: 0, closed: 0 };
      existing.logs += 1;
      existing.totalScore += maintenanceLogQualityScore(row);
      if (row.request_id) existing.withRequest += 1;
      if ((row.status_update ?? "").trim() === "Closed") existing.closed += 1;
      grouped.set(key, existing);
    }
    return Array.from(grouped.entries())
      .map(([userId, row]) => {
        const avgScore = row.logs ? Math.round(row.totalScore / row.logs) : 0;
        const linkageRate = row.logs ? Math.round((row.withRequest / row.logs) * 100) : 100;
        const closureRate = row.logs ? Math.round((row.closed / row.logs) * 100) : 100;
        const accountabilityScore = clampPercent(avgScore * 0.6 + linkageRate * 0.2 + closureRate * 0.2);
        return {
          userId,
          name: userId === "unknown" ? "Unknown" : nameById[userId] || userId,
          logs: row.logs,
          avgScore,
          linkageRate,
          closureRate,
          accountabilityScore,
        };
      })
      .sort((a, b) => b.accountabilityScore - a.accountabilityScore || b.logs - a.logs);
  }, [maintenanceLogs, period, nameById]);

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

  async function createAction() {
    setActionError(null);
    if (!newAction.note.trim()) {
      setActionError("Action note is required.");
      return;
    }
    const supabase = createSupabaseBrowser();
    setActionSaving(true);
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setActionSaving(false);
      setActionError("Unable to resolve current user.");
      return;
    }
    const payload = {
      created_by: authData.user.id,
      target_user_id: newAction.target_user_id || null,
      role_scope: newAction.role_scope,
      action_type: newAction.action_type,
      note: newAction.note.trim(),
      status: "open" as const,
      due_date: newAction.due_date || null,
    };
    const { data, error } = await supabase
      .from("accountability_actions")
      .insert(payload)
      .select("id,created_at,created_by,target_user_id,role_scope,action_type,status,note,due_date,resolved_at")
      .single();
    setActionSaving(false);
    if (error || !data) {
      setActionError(error?.message || "Failed to create accountability action.");
      return;
    }
    setActions((prev) => [data as AccountabilityActionRow, ...prev]);
    setNewAction((prev) => ({ ...prev, note: "", due_date: "" }));
  }

  async function markActionStatus(actionId: number, status: "resolved" | "dismissed") {
    const supabase = createSupabaseBrowser();
    const patch =
      status === "resolved"
        ? { status, resolved_at: new Date().toISOString() }
        : { status, resolved_at: null };
    const { error } = await supabase
      .from("accountability_actions")
      .update(patch)
      .eq("id", actionId);
    if (error) {
      setActionError(error.message);
      return;
    }
    setActions((prev) =>
      prev.map((row) => (row.id === actionId ? { ...row, ...patch } : row))
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

      <section style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Team Member Accountability Scoreboard</div>
        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading...</div>
        ) : errorMessage ? (
          <div style={{ color: "#ff9d9d" }}>{errorMessage}</div>
        ) : !teammateScoreboard.length ? (
          <div style={{ opacity: 0.75 }}>No teammate data in this period.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {teammateScoreboard.map((row) => (
              <div
                key={row.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(180px, 1.5fr) repeat(6, minmax(90px, 1fr))",
                  gap: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 10,
                  padding: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 800 }}>{row.name}</div>
                <MiniStat label="Accountability" value={`${row.accountabilityScore}%`} />
                <MiniStat label="Forms" value={String(row.forms)} />
                <MiniStat label="Avg" value={`${row.avgScore}%`} />
                <MiniStat label="On-Time" value={`${row.onTimeRate}%`} />
                <MiniStat label="Fail→Req" value={`${row.failLinkRate}%`} />
                <MiniStat label="Flags" value={String(row.flags)} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Mechanic Accountability Scoreboard</div>
        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading...</div>
        ) : !mechanicScoreboard.length ? (
          <div style={{ opacity: 0.75 }}>No mechanic log data in this period.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {mechanicScoreboard.map((row) => (
              <div
                key={row.userId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(180px, 1.5fr) repeat(5, minmax(90px, 1fr))",
                  gap: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 10,
                  padding: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 800 }}>{row.name}</div>
                <MiniStat label="Accountability" value={`${row.accountabilityScore}%`} />
                <MiniStat label="Logs" value={String(row.logs)} />
                <MiniStat label="Quality" value={`${row.avgScore}%`} />
                <MiniStat label="Request Link" value={`${row.linkageRate}%`} />
                <MiniStat label="Closed" value={`${row.closureRate}%`} />
                <MiniStat label="Band" value={mechanicScoreBand(row.accountabilityScore)} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Accountability Actions</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <select
            value={newAction.target_user_id}
            onChange={(e) => setNewAction((prev) => ({ ...prev, target_user_id: e.target.value }))}
            style={inputStyle()}
          >
            <option value="">Target user (optional)</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.full_name || p.email || p.id) + (p.role ? ` (${p.role})` : "")}
              </option>
            ))}
          </select>
          <select
            value={newAction.role_scope}
            onChange={(e) => setNewAction((prev) => ({ ...prev, role_scope: e.target.value as NewActionForm["role_scope"] }))}
            style={inputStyle()}
          >
            <option value="teammate">Teammate</option>
            <option value="mechanic">Mechanic</option>
            <option value="all">All</option>
          </select>
          <select
            value={newAction.action_type}
            onChange={(e) => setNewAction((prev) => ({ ...prev, action_type: e.target.value as NewActionForm["action_type"] }))}
            style={inputStyle()}
          >
            <option value="coaching">Coaching</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
            <option value="recognition">Recognition</option>
          </select>
          <input
            type="date"
            value={newAction.due_date}
            onChange={(e) => setNewAction((prev) => ({ ...prev, due_date: e.target.value }))}
            style={inputStyle()}
          />
        </div>
        <div style={{ marginTop: 10 }}>
          <textarea
            value={newAction.note}
            onChange={(e) => setNewAction((prev) => ({ ...prev, note: e.target.value }))}
            rows={3}
            placeholder="Action note (coaching detail, warning reason, required retraining, etc.)"
            style={{ ...inputStyle(), resize: "vertical" }}
          />
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={() => void createAction()} style={buttonStyle()} disabled={actionSaving}>
            {actionSaving ? "Saving..." : "Add Accountability Action"}
          </button>
          {actionError ? <span style={{ color: "#ff9d9d" }}>{actionError}</span> : null}
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          {actions.length === 0 ? (
            <div style={{ opacity: 0.75 }}>No actions recorded yet.</div>
          ) : (
            actions.map((row) => (
              <div
                key={row.id}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 10,
                  padding: 10,
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 800 }}>
                    {row.action_type.toUpperCase()} · {row.role_scope.toUpperCase()} · {row.status.toUpperCase()}
                  </div>
                  <div style={{ opacity: 0.72, fontSize: 12 }}>
                    {new Date(row.created_at).toLocaleString()}
                    {row.due_date ? ` · due ${row.due_date}` : ""}
                  </div>
                </div>
                <div style={{ marginTop: 6, opacity: 0.88 }}>{row.note}</div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>
                  Target: {row.target_user_id ? nameById[row.target_user_id] || row.target_user_id : "General"}
                </div>
                {row.status === "open" ? (
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" style={secondaryButtonStyle()} onClick={() => void markActionStatus(row.id, "resolved")}>
                      Mark Resolved
                    </button>
                    <button type="button" style={secondaryButtonStyle()} onClick={() => void markActionStatus(row.id, "dismissed")}>
                      Dismiss
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
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

function secondaryButtonStyle(): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "transparent",
    color: "inherit",
    fontWeight: 700,
    cursor: "pointer",
  };
}
