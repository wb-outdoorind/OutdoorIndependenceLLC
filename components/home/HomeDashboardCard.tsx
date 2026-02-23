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
};

export default function HomeDashboardCard({
  dashboard,
  teammateOpsStats,
  canExpandDashboard,
}: {
  dashboard: DashboardData;
  teammateOpsStats: TeammateOpsStats | null;
  canExpandDashboard: boolean;
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
