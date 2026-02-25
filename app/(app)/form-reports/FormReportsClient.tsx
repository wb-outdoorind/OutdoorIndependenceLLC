"use client";

import { useEffect, useMemo, useState } from "react";
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
                <button
                  key={row.key}
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
