"use client";

import { useEffect, useState } from "react";
import OpsClient from "@/app/(app)/ops/OpsClient";
import { readRoleViewOverride, resolveEffectiveRole, type AppRole } from "@/lib/roleView";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { isMechanicOrHigher } from "@/lib/roles";

type Role = AppRole;

type GradeRow = {
  score: number | null;
  submitted_at: string;
  submitted_by: string | null;
};

type ProfileRoleRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type TeammateOpsMetrics = {
  daily: number;
  weekly: number;
  monthly: number;
  ytd: number;
  formCount: number;
};

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

function averageScoreFromRows(rows: GradeRow[]) {
  if (!rows.length) return 0;
  const total = rows.reduce((sum, row) => sum + Number(row.score ?? 0), 0);
  return Math.round(total / rows.length);
}

function normalizedName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export default function MaintenanceOperationsPage() {
  const [canViewOperations, setCanViewOperations] = useState(false);
  const [userRole, setUserRole] = useState<Role>("employee");
  const [roleResolved, setRoleResolved] = useState(false);
  const [teammateMetrics, setTeammateMetrics] = useState<TeammateOpsMetrics>({
    daily: 0,
    weekly: 0,
    monthly: 0,
    ytd: 0,
    formCount: 0,
  });
  const [teammateMetricsLoading, setTeammateMetricsLoading] = useState(true);
  const [teammateMetricsError, setTeammateMetricsError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const supabase = createSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      if (!alive) return;

      if (!authData.user) {
        setCanViewOperations(false);
        setUserRole("employee");
        setRoleResolved(true);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (!alive) return;
      const role = resolveEffectiveRole(
        (profile?.role as Role | undefined) ?? "employee",
        readRoleViewOverride()
      ) as Role;
      setUserRole(role);
      setCanViewOperations(isMechanicOrHigher(role));
      setRoleResolved(true);
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    void (async () => {
      setTeammateMetricsLoading(true);
      setTeammateMetricsError(null);

      const supabase = createSupabaseBrowser();
      const [gradesRes, profilesRes] = await Promise.all([
        supabase
          .from("form_submission_grades")
          .select("score,submitted_at,submitted_by")
          .order("submitted_at", { ascending: false })
          .limit(4000),
        supabase
          .from("profiles")
          .select("id,full_name,email,role")
          .in("role", ["apprentice", "team_member_1", "team_member_2", "team_lead_1", "team_lead_2"])
          .eq("status", "Active"),
      ]);

      if (!alive) return;
      if (gradesRes.error || profilesRes.error) {
        setTeammateMetricsError(
          gradesRes.error?.message || profilesRes.error?.message || "Failed to load teammate dashboard metrics."
        );
        setTeammateMetricsLoading(false);
        return;
      }

      const grades = (gradesRes.data ?? []) as GradeRow[];
      const teammateProfiles = (profilesRes.data ?? []) as ProfileRoleRow[];

      const allowedNames = new Set<string>();
      for (const profile of teammateProfiles) {
        allowedNames.add(normalizedName(profile.full_name));
        allowedNames.add(normalizedName(profile.email));
        allowedNames.add(normalizedName(profile.id));
      }

      const filtered = grades.filter((row) => allowedNames.has(normalizedName(row.submitted_by)));

      const todayStart = startOfToday();
      const weekStart = startOfWeek();
      const monthStart = startOfMonth();
      const yearStart = startOfYear();

      const dailyRows = filtered.filter((row) => new Date(row.submitted_at) >= todayStart);
      const weeklyRows = filtered.filter((row) => new Date(row.submitted_at) >= weekStart);
      const monthlyRows = filtered.filter((row) => new Date(row.submitted_at) >= monthStart);
      const ytdRows = filtered.filter((row) => new Date(row.submitted_at) >= yearStart);

      setTeammateMetrics({
        daily: averageScoreFromRows(dailyRows),
        weekly: averageScoreFromRows(weeklyRows),
        monthly: averageScoreFromRows(monthlyRows),
        ytd: averageScoreFromRows(ytdRows),
        formCount: filtered.length,
      });
      setTeammateMetricsLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const canViewTeammateOperations =
    userRole === "apprentice" ||
    userRole === "team_member_1" ||
    userRole === "team_member_2" ||
    userRole === "team_lead_1" ||
    userRole === "team_lead_2";

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 40 }}>
      {!roleResolved ? (
        <div style={cardStyle}>Loading maintenance access...</div>
      ) : canViewOperations ? (
        <>
          <OpsClient
            embedded
            title="Maintenance Operations Dashboard"
            description="Queue, analytics, PM planning, downtime, failure trends, and service performance in one place."
            currentRole={userRole}
          />
          <div style={{ marginTop: 12 }}>
            <TeammateOperationsDashboard
              loading={teammateMetricsLoading}
              error={teammateMetricsError}
              metrics={teammateMetrics}
            />
          </div>
        </>
      ) : canViewTeammateOperations ? (
        <TeammateOperationsDashboard
          loading={teammateMetricsLoading}
          error={teammateMetricsError}
          metrics={teammateMetrics}
        />
      ) : (
        <div style={cardStyle}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Maintenance Operations Dashboard Access Required</div>
          <div style={{ opacity: 0.8 }}>
            This section is available to owner, operations manager, office admin, and mechanic roles.
          </div>
        </div>
      )}
    </main>
  );
}

function TeammateOperationsDashboard({
  loading,
  error,
  metrics,
}: {
  loading: boolean;
  error: string | null;
  metrics: TeammateOpsMetrics;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 900, fontSize: 18 }}>Teammate Operations Dashboard</div>
      <div style={{ opacity: 0.78, marginTop: 6 }}>
        Average form scores for apprentice through team lead 2.
      </div>
      {loading ? (
        <div style={{ marginTop: 12, opacity: 0.75 }}>Loading teammate score metrics...</div>
      ) : error ? (
        <div style={{ marginTop: 12, color: "#ff9d9d" }}>{error}</div>
      ) : (
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          <div style={teammateStatCardStyle}>
            <div style={{ opacity: 0.72, fontSize: 12 }}>Today Avg Score</div>
            <div style={{ fontWeight: 900, marginTop: 4, fontSize: 24 }}>{metrics.daily}%</div>
          </div>
          <div style={teammateStatCardStyle}>
            <div style={{ opacity: 0.72, fontSize: 12 }}>Week Avg Score</div>
            <div style={{ fontWeight: 900, marginTop: 4, fontSize: 24 }}>{metrics.weekly}%</div>
          </div>
          <div style={teammateStatCardStyle}>
            <div style={{ opacity: 0.72, fontSize: 12 }}>Month Avg Score</div>
            <div style={{ fontWeight: 900, marginTop: 4, fontSize: 24 }}>{metrics.monthly}%</div>
          </div>
          <div style={teammateStatCardStyle}>
            <div style={{ opacity: 0.72, fontSize: 12 }}>Year To Date Avg Score</div>
            <div style={{ fontWeight: 900, marginTop: 4, fontSize: 24 }}>{metrics.ytd}%</div>
          </div>
          <div style={teammateStatCardStyle}>
            <div style={{ opacity: 0.72, fontSize: 12 }}>Tracked Forms</div>
            <div style={{ fontWeight: 900, marginTop: 4, fontSize: 24 }}>{metrics.formCount}</div>
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 16,
  padding: 16,
  background: "rgba(255,255,255,0.03)",
};

const teammateStatCardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  padding: 12,
  background: "rgba(255,255,255,0.02)",
};
