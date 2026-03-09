"use client";

import Link from "next/link";
import { useState } from "react";

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

type ActiveFieldAssignment = {
  key: string;
  employeeNames: string;
  vehicleId: string;
  truckLabel: string;
  trailerLabel: string;
  equipmentLabel: string;
  preTripAt: string;
};

function formatActiveStartTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function HomeDashboardCard({
  dashboard,
  teammateOpsStats,
  canExpandDashboard,
  slaObservability,
  slaDailySummary,
  activeFieldAssignments = [],
}: {
  dashboard: DashboardData;
  teammateOpsStats: TeammateOpsStats | null;
  canExpandDashboard: boolean;
  slaObservability: SlaObservabilityStats | null;
  slaDailySummary: SlaDailySummary | null;
  activeFieldAssignments?: ActiveFieldAssignment[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section style={{ ...dashboardCardStyle, marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>{dashboard.title}</div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>{dashboard.subtitle}</div>
        </div>
        {canExpandDashboard ? (
          <button type="button" onClick={() => setExpanded((prev) => !prev)} style={expandButtonStyle}>
            Expand dashboard
          </button>
        ) : null}
      </div>

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
        }}
      >
        {dashboard.stats.map((stat) => (
          <div key={stat.label} style={statCardStyle}>
            <div style={{ opacity: 0.72, fontSize: 12 }}>{stat.label}</div>
            <div style={{ fontWeight: 900, fontSize: 22, marginTop: 2 }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {canExpandDashboard && expanded && teammateOpsStats ? (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--surface-border)", paddingTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Teammate Operations Dashboard</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
            }}
          >
            <div style={statCardStyle}>
              <div style={{ opacity: 0.72, fontSize: 12 }}>Today Avg Score</div>
              <div style={{ fontWeight: 900, fontSize: 22, marginTop: 2 }}>{teammateOpsStats.daily}%</div>
            </div>
            <div style={statCardStyle}>
              <div style={{ opacity: 0.72, fontSize: 12 }}>Week Avg Score</div>
              <div style={{ fontWeight: 900, fontSize: 22, marginTop: 2 }}>{teammateOpsStats.weekly}%</div>
            </div>
            <div style={statCardStyle}>
              <div style={{ opacity: 0.72, fontSize: 12 }}>Month Avg Score</div>
              <div style={{ fontWeight: 900, fontSize: 22, marginTop: 2 }}>{teammateOpsStats.monthly}%</div>
            </div>
            <div style={statCardStyle}>
              <div style={{ opacity: 0.72, fontSize: 12 }}>YTD Avg Score</div>
              <div style={{ fontWeight: 900, fontSize: 22, marginTop: 2 }}>{teammateOpsStats.ytd}%</div>
            </div>
            <div style={statCardStyle}>
              <div style={{ opacity: 0.72, fontSize: 12 }}>Tracked Forms</div>
              <div style={{ fontWeight: 900, fontSize: 22, marginTop: 2 }}>{teammateOpsStats.formCount}</div>
            </div>
          </div>

          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
            <div style={detailCardStyle}>
              <div style={detailTitleStyle}>Form Volume</div>
              <div style={detailLineStyle}>Daily: {teammateOpsStats.formVolume.daily}</div>
              <div style={detailLineStyle}>Weekly: {teammateOpsStats.formVolume.weekly}</div>
              <div style={detailLineStyle}>Monthly: {teammateOpsStats.formVolume.monthly}</div>
              <div style={detailLineStyle}>YTD: {teammateOpsStats.formVolume.ytd}</div>
              <div style={{ ...detailLineStyle, marginTop: 8 }}>By Role:</div>
              {teammateOpsStats.formVolume.byRole.length === 0 ? (
                <div style={detailMutedStyle}>No role volume data.</div>
              ) : (
                teammateOpsStats.formVolume.byRole.map((row) => (
                  <div key={`role-${row.role}`} style={detailMutedStyle}>
                    {row.role}: {row.count}
                  </div>
                ))
              )}
            </div>

            <div style={detailCardStyle}>
              <div style={detailTitleStyle}>Completion Quality</div>
              <div style={detailLineStyle}>Complete forms: {teammateOpsStats.completionQuality.completeRate}%</div>
              <div style={detailLineStyle}>Flagged forms: {teammateOpsStats.completionQuality.flaggedRate}%</div>
              <div style={detailLineStyle}>Late forms: {teammateOpsStats.completionQuality.lateRate}%</div>
              <div style={{ ...detailLineStyle, marginTop: 10 }}>
                Fail-to-request link rate: {teammateOpsStats.failToRequestLinkRate}%
              </div>
            </div>

            <div style={detailCardStyle}>
              <div style={detailTitleStyle}>Top Missed Sections</div>
              {teammateOpsStats.topMissedSections.length === 0 ? (
                <div style={detailMutedStyle}>No missed-section data in range.</div>
              ) : (
                teammateOpsStats.topMissedSections.map((row) => (
                  <div key={`missed-${row.label}`} style={detailLineStyle}>
                    {row.label}: {row.count}
                  </div>
                ))
              )}
            </div>

            <div style={detailCardStyle}>
              <div style={detailTitleStyle}>Team Heatmap</div>
              {teammateOpsStats.teamHeatmap.length === 0 ? (
                <div style={detailMutedStyle}>No teammate score rows yet.</div>
              ) : (
                teammateOpsStats.teamHeatmap.map((row) => (
                  <div key={`heat-${row.name}`} style={detailLineStyle}>
                    {row.name} ({row.role}) {row.avgScore}% {row.trend === "up" ? "↑" : row.trend === "down" ? "↓" : "→"}
                  </div>
                ))
              )}
            </div>

            <div style={detailCardStyle}>
              <div style={detailTitleStyle}>At-Risk Queue</div>
              {teammateOpsStats.atRiskQueue.length === 0 ? (
                <div style={detailMutedStyle}>No teammates currently at risk.</div>
              ) : (
                teammateOpsStats.atRiskQueue.map((row) => (
                  <div key={`risk-${row.name}`} style={detailLineStyle}>
                    {row.name} ({row.role}) score {row.overallScore}% · flags {row.flags}
                  </div>
                ))
              )}
            </div>

            {slaObservability ? (
              <div style={detailCardStyle}>
                <div style={detailTitleStyle}>SLA Alert Health</div>
                <div style={detailLineStyle}>Runs (24h): {slaObservability.runs24h}</div>
                <div style={detailLineStyle}>7d Success Rate: {slaObservability.successRate7d}%</div>
                <div style={detailLineStyle}>
                  Avg Notifications Attempted (7d): {slaObservability.avgNotificationsAttempted7d}
                </div>
                <div style={detailLineStyle}>
                  Last Run: {slaObservability.lastRunAt ? new Date(slaObservability.lastRunAt).toLocaleString() : "None"}
                </div>
                <div style={detailLineStyle}>
                  Last Success:{" "}
                  {slaObservability.lastSuccessAt ? new Date(slaObservability.lastSuccessAt).toLocaleString() : "None"}
                </div>
                <div style={detailLineStyle}>
                  Last Status:{" "}
                  {slaObservability.lastRunStatus === "none"
                    ? "No runs"
                    : slaObservability.lastRunStatus === "success"
                    ? "Success"
                    : "Failed"}
                </div>
              </div>
            ) : null}

            {slaDailySummary ? (
              <div style={detailCardStyle}>
                <div style={detailTitleStyle}>SLA Daily Summary</div>
                <div style={detailLineStyle}>Lead approvals overdue: {slaDailySummary.approvalOverdue}</div>
                <div style={detailLineStyle}>Maintenance overdue: {slaDailySummary.maintenanceOverdue}</div>
                <div style={detailLineStyle}>Flagged queue overdue: {slaDailySummary.flaggedOverdue}</div>
                <div style={detailLineStyle}>Unresolved alerts (today): {slaDailySummary.unresolvedTotal}</div>
              </div>
            ) : null}
          </div>

          <div
            style={{
              marginTop: 14,
              border: "1px solid var(--surface-border)",
              borderRadius: 14,
              padding: 12,
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontWeight: 900, fontSize: 15 }}>Current Field Activity</div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  borderRadius: 999,
                  border: "1px solid rgba(126,255,167,0.45)",
                  background: "rgba(126,255,167,0.12)",
                  padding: "4px 10px",
                }}
              >
                {activeFieldAssignments.length} Active
              </div>
            </div>
            <div style={{ opacity: 0.75, marginTop: 6, fontSize: 13, lineHeight: 1.35 }}>
              Live view of trucks in use after completed pre-trip. Entries are removed when post-trip is started or submitted.
            </div>

            {activeFieldAssignments.length === 0 ? (
              <div style={{ marginTop: 10, opacity: 0.74, fontSize: 13 }}>
                No active truck assignments right now.
              </div>
            ) : (
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {activeFieldAssignments.map((assignment) => (
                  <div
                    key={assignment.key}
                    style={{
                      border: "1px solid var(--surface-border)",
                      borderRadius: 12,
                      padding: 12,
                      background: "rgba(255,255,255,0.02)",
                      fontSize: 14,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                        marginBottom: 10,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: 0.2,
                          textTransform: "uppercase",
                          opacity: 0.72,
                        }}
                      >
                        Assignment Active
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.74 }}>
                        Pre-trip completed {formatActiveStartTime(assignment.preTripAt)}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.2, opacity: 0.68 }}>
                          Teammate(s)
                        </div>
                        <div style={{ marginTop: 4, fontWeight: 800 }}>{assignment.employeeNames}</div>
                      </div>

                      <div>
                        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.2, opacity: 0.68 }}>
                          Truck
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <Link
                            href={`/vehicles/${encodeURIComponent(assignment.vehicleId)}`}
                            style={{ color: "inherit", fontWeight: 800, textDecoration: "underline" }}
                          >
                            {assignment.truckLabel}
                          </Link>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.2, opacity: 0.68 }}>
                          Trailer
                        </div>
                        <div style={{ marginTop: 4, fontWeight: 700, opacity: 0.9 }}>{assignment.trailerLabel}</div>
                      </div>

                      <div>
                        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.2, opacity: 0.68 }}>
                          Equipment
                        </div>
                        <div style={{ marginTop: 4, fontWeight: 700, opacity: 0.9 }}>{assignment.equipmentLabel}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {dashboard.actions.map((action) => (
          <Link key={action.href} href={action.href} style={dashboardActionStyle}>
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

const dashboardCardStyle: React.CSSProperties = {
  border: "1px solid var(--surface-border)",
  borderRadius: 16,
  padding: 16,
  background: "var(--surface)",
};

const statCardStyle: React.CSSProperties = {
  border: "1px solid var(--surface-border)",
  borderRadius: 12,
  padding: 10,
  background: "rgba(255,255,255,0.02)",
};

const dashboardActionStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid var(--surface-border)",
  background: "rgba(255,255,255,0.05)",
  color: "inherit",
  textDecoration: "none",
  fontWeight: 800,
  fontSize: 13,
};

const expandButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid var(--surface-border)",
  background: "rgba(255,255,255,0.05)",
  color: "inherit",
  fontWeight: 800,
  cursor: "pointer",
};

const detailCardStyle: React.CSSProperties = {
  border: "1px solid var(--surface-border)",
  borderRadius: 12,
  padding: 10,
  background: "rgba(255,255,255,0.02)",
};

const detailTitleStyle: React.CSSProperties = {
  fontWeight: 900,
  marginBottom: 6,
};

const detailLineStyle: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.9,
  marginTop: 3,
};

const detailMutedStyle: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.72,
  marginTop: 3,
};
