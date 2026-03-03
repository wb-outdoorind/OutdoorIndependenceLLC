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

export default function HomeDashboardCard({
  dashboard,
  teammateOpsStats,
  canExpandDashboard,
  slaObservability,
}: {
  dashboard: DashboardData;
  teammateOpsStats: TeammateOpsStats | null;
  canExpandDashboard: boolean;
  slaObservability: SlaObservabilityStats | null;
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
