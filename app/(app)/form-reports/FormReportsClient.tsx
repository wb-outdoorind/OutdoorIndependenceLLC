"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

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
  missing_fields: string[] | null;
  accountability_flag: boolean;
  accountability_reason: string | null;
};

type FormFilter = "all" | "inspection" | "vehicle_maintenance_request" | "equipment_maintenance_request";
type ScorePeriod = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
type MaintenanceLogScoreRow = {
  id: string;
  created_at: string;
  created_by: string | null;
  request_id: string | null;
  notes: string | null;
  status_update: string | null;
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

function formatFormType(type: string) {
  if (type === "inspection") return "Pre/Post Trip";
  if (type === "vehicle_maintenance_request") return "Vehicle Maintenance Request";
  if (type === "equipment_maintenance_request") return "Equipment Maintenance Request";
  return type;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
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
    const quarterStartMonth = Math.floor(month / 3) * 3;
    start.setMonth(quarterStartMonth, 1);
    return start;
  }
  start.setMonth(0, 1);
  return start;
}

function inPeriod(iso: string, period: ScorePeriod) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const start = getPeriodStart(period);
  return date >= start;
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

function maintenanceLogQualityScore(log: MaintenanceLogScoreRow) {
  let score = 100;
  if (!log.request_id) score -= 6;
  if ((log.status_update ?? "").trim() === "In Progress") score -= 8;
  if (!(log.status_update ?? "").trim()) score -= 10;

  const notesLength = (log.notes ?? "").trim().length;
  if (notesLength < 20) score -= 8;
  if (notesLength === 0) score -= 8;
  return clampPercent(score);
}

export default function FormReportsClient() {
  const [rows, setRows] = useState<GradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<FormFilter>("all");
  const [search, setSearch] = useState("");
  const [scorePeriod, setScorePeriod] = useState<ScorePeriod>("daily");
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLogScoreRow[]>([]);
  const [mechanicNameById, setMechanicNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      setErrorMessage(null);
      const supabase = createSupabaseBrowser();
      const [gradesRes, vehicleLogsRes, equipmentLogsRes] = await Promise.all([
        supabase
          .from("form_submission_grades")
          .select(
            "id,form_type,form_id,submitted_at,submitted_by,vehicle_id,equipment_id,score,is_complete,has_na,missing_count,missing_fields,accountability_flag,accountability_reason"
          )
          .order("submitted_at", { ascending: false })
          .limit(1000),
        supabase
          .from("maintenance_logs")
          .select("id,created_at,created_by,request_id,notes,status_update")
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("equipment_maintenance_logs")
          .select("id,created_at,created_by,request_id,notes,status_update")
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);

      if (!alive) return;
      if (gradesRes.error || !gradesRes.data || vehicleLogsRes.error || equipmentLogsRes.error) {
        setErrorMessage(
          gradesRes.error?.message ||
          vehicleLogsRes.error?.message ||
          equipmentLogsRes.error?.message ||
          "Failed to load form reports."
        );
        setRows([]);
        setMaintenanceLogs([]);
      } else {
        setRows(gradesRes.data as GradeRow[]);
        const combinedLogs = [
          ...((vehicleLogsRes.data ?? []) as MaintenanceLogScoreRow[]),
          ...((equipmentLogsRes.data ?? []) as MaintenanceLogScoreRow[]),
        ];
        setMaintenanceLogs(combinedLogs);

        const creatorIds = Array.from(
          new Set(
            combinedLogs
              .map((row) => row.created_by)
              .filter((id): id is string => typeof id === "string" && id.length > 0)
          )
        );
        if (creatorIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id,full_name,email")
            .in("id", creatorIds);
          if (alive && profiles) {
            const next: Record<string, string> = {};
            for (const profile of profiles as Array<{ id: string; full_name: string | null; email: string | null }>) {
              next[profile.id] = profile.full_name?.trim() || profile.email?.trim() || profile.id;
            }
            setMechanicNameById(next);
          }
        } else {
          setMechanicNameById({});
        }
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== "all" && row.form_type !== filter) return false;
      if (!q) return true;
      const hay = [
        row.submitted_by ?? "",
        row.form_type,
        row.form_id,
        row.vehicle_id ?? "",
        row.equipment_id ?? "",
        row.accountability_reason ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, filter, search]);

  const summary = useMemo(() => {
    if (!filtered.length) {
      return {
        submissions: 0,
        avgScore: 0,
        incomplete: 0,
        naForms: 0,
        accountabilityFlags: 0,
      };
    }
    const totalScore = filtered.reduce((sum, row) => sum + (row.score ?? 0), 0);
    return {
      submissions: filtered.length,
      avgScore: Math.round(totalScore / filtered.length),
      incomplete: filtered.filter((row) => !row.is_complete).length,
      naForms: filtered.filter((row) => row.has_na).length,
      accountabilityFlags: filtered.filter((row) => row.accountability_flag).length,
    };
  }, [filtered]);

  const teammateStats = useMemo(() => {
    const periodFiltered = filtered.filter((row) => inPeriod(row.submitted_at, scorePeriod));
    const stats: Record<
      string,
      { submissions: number; totalScore: number; incomplete: number; naForms: number; accountabilityFlags: number }
    > = {};
    for (const row of periodFiltered) {
      const name = (row.submitted_by || "Unknown").trim() || "Unknown";
      if (!stats[name]) {
        stats[name] = { submissions: 0, totalScore: 0, incomplete: 0, naForms: 0, accountabilityFlags: 0 };
      }
      stats[name].submissions += 1;
      stats[name].totalScore += row.score ?? 0;
      if (!row.is_complete) stats[name].incomplete += 1;
      if (row.has_na) stats[name].naForms += 1;
      if (row.accountability_flag) stats[name].accountabilityFlags += 1;
    }
    return Object.entries(stats)
      .map(([name, stat]) => ({
        name,
        submissions: stat.submissions,
        avgScore: Math.round(stat.totalScore / Math.max(1, stat.submissions)),
        incomplete: stat.incomplete,
        naForms: stat.naForms,
        accountabilityFlags: stat.accountabilityFlags,
      }))
      .sort((a, b) => {
        if (b.accountabilityFlags !== a.accountabilityFlags) return b.accountabilityFlags - a.accountabilityFlags;
        if (a.avgScore !== b.avgScore) return a.avgScore - b.avgScore;
        return b.submissions - a.submissions;
      });
  }, [filtered, scorePeriod]);

  const scorePeriodSummary = useMemo(() => {
    const periods: ScorePeriod[] = ["daily", "weekly", "monthly", "quarterly", "yearly"];
    return periods.map((period) => {
      const subset = filtered.filter((row) => inPeriod(row.submitted_at, period));
      const totalScore = subset.reduce((sum, row) => sum + (row.score ?? 0), 0);
      return {
        period,
        submissions: subset.length,
        avgScore: subset.length ? Math.round(totalScore / subset.length) : 0,
      };
    });
  }, [filtered]);

  const mechanicScoreboard = useMemo(() => {
    const relevantLogs = maintenanceLogs.filter((row) => inPeriod(row.created_at, scorePeriod));
    const grouped = new Map<string, { mechanic: string; logs: number; totalScore: number }>();

    for (const row of relevantLogs) {
      const createdBy = row.created_by || "unknown";
      const displayName = createdBy === "unknown" ? "Unknown" : mechanicNameById[createdBy] || createdBy;
      const score = maintenanceLogQualityScore(row);
      const existing = grouped.get(createdBy);
      if (existing) {
        existing.logs += 1;
        existing.totalScore += score;
      } else {
        grouped.set(createdBy, { mechanic: displayName, logs: 1, totalScore: score });
      }
    }

    return Array.from(grouped.values())
      .map((row) => ({
        mechanic: row.mechanic,
        logs: row.logs,
        avgScore: row.logs ? Math.round(row.totalScore / row.logs) : 0,
      }))
      .sort((a, b) => b.avgScore - a.avgScore || b.logs - a.logs || a.mechanic.localeCompare(b.mechanic));
  }, [maintenanceLogs, mechanicNameById, scorePeriod]);

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", paddingBottom: 40 }}>
      <h1 style={{ marginBottom: 6 }}>Form Accountability Reports</h1>
      <div style={{ opacity: 0.75 }}>
        Auto-grades submitted forms, blocks N/A quality drift, and flags potential missed pre-trip issues.
      </div>

      <div style={{ marginTop: 14, ...cardStyle() }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <Stat label="Submissions" value={String(summary.submissions)} />
          <Stat label="Average Score" value={`${summary.avgScore}%`} />
          <Stat label="Incomplete" value={String(summary.incomplete)} />
          <Stat label="Has N/A" value={String(summary.naForms)} />
          <Stat label="Accountability Flags" value={String(summary.accountabilityFlags)} />
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value as FormFilter)} style={{ ...inputStyle(), width: 280 }}>
          <option value="all">All form types</option>
          <option value="inspection">Pre/Post Trip</option>
          <option value="vehicle_maintenance_request">Vehicle Maintenance Request</option>
          <option value="equipment_maintenance_request">Equipment Maintenance Request</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle(), minWidth: 260, flex: "1 1 260px" }}
          placeholder="Search teammate, form id, vehicle, equipment..."
        />
      </div>

      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Score Periods</div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          {scorePeriodSummary.map((row) => (
            <div
              key={row.period}
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 10,
                padding: 10,
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ opacity: 0.72, fontSize: 12 }}>{row.period[0].toUpperCase() + row.period.slice(1)}</div>
              <div style={{ fontWeight: 900, marginTop: 4 }}>{row.avgScore}%</div>
              <div style={{ opacity: 0.72, fontSize: 12, marginTop: 2 }}>{row.submissions} submissions</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Teammate Scoreboard</div>
        <div style={{ marginBottom: 10, maxWidth: 260 }}>
          <select
            value={scorePeriod}
            onChange={(e) => setScorePeriod(e.target.value as ScorePeriod)}
            style={inputStyle()}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading...</div>
        ) : errorMessage ? (
          <div style={{ color: "#ff9d9d" }}>{errorMessage}</div>
        ) : !teammateStats.length ? (
          <div style={{ opacity: 0.75 }}>No graded forms found for this period.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {teammateStats.map((row) => (
              <div
                key={row.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(160px, 1.4fr) repeat(5, minmax(90px, 1fr))",
                  gap: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 10,
                  padding: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 800 }}>{row.name}</div>
                <MiniStat label="Forms" value={String(row.submissions)} />
                <MiniStat label="Avg" value={`${row.avgScore}%`} />
                <MiniStat label="Incomplete" value={String(row.incomplete)} />
                <MiniStat label="N/A" value={String(row.naForms)} />
                <MiniStat label="Flags" value={String(row.accountabilityFlags)} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Mechanic Scoreboard</div>
        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading...</div>
        ) : !mechanicScoreboard.length ? (
          <div style={{ opacity: 0.75 }}>No maintenance logs found for this period.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {mechanicScoreboard.map((row) => (
              <div
                key={row.mechanic}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(160px, 1.4fr) repeat(2, minmax(90px, 1fr))",
                  gap: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 10,
                  padding: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 800 }}>{row.mechanic}</div>
                <MiniStat label="Logs" value={String(row.logs)} />
                <MiniStat label="Score" value={`${row.avgScore}%`} />
                <MiniStat label="Band" value={mechanicScoreBand(row.avgScore)} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Recent Form Grades</div>
        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading...</div>
        ) : errorMessage ? (
          <div style={{ color: "#ff9d9d" }}>{errorMessage}</div>
        ) : !filtered.length ? (
          <div style={{ opacity: 0.75 }}>No forms match the current filters.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.slice(0, 200).map((row) => (
              <div
                key={`${row.form_type}:${row.form_id}`}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  padding: 12,
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>
                      {formatFormType(row.form_type)} • {row.submitted_by || "Unknown"}
                    </div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>
                      Form ID: {row.form_id}
                      {row.vehicle_id ? ` • Vehicle: ${row.vehicle_id}` : ""}
                      {row.equipment_id ? ` • Equipment: ${row.equipment_id}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 900 }}>{row.score}%</div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>{formatDateTime(row.submitted_at)}</div>
                  </div>
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                  <Badge label={row.is_complete ? "Complete" : "Incomplete"} danger={!row.is_complete} />
                  <Badge label={row.has_na ? "Contains N/A" : "No N/A"} danger={row.has_na} />
                  <Badge label={row.accountability_flag ? "Flagged" : "No Flag"} danger={row.accountability_flag} />
                </div>
                {!!row.missing_count ? (
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.82 }}>
                    Missing: {(row.missing_fields ?? []).join(", ") || row.missing_count}
                  </div>
                ) : null}
                {row.accountability_reason ? (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#ffbcbc" }}>
                    {row.accountability_reason}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
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

function Badge({ label, danger }: { label: string; danger?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        borderRadius: 999,
        border: danger
          ? "1px solid rgba(255,120,120,0.55)"
          : "1px solid rgba(255,255,255,0.2)",
        background: danger ? "rgba(255,120,120,0.16)" : "rgba(255,255,255,0.07)",
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}
