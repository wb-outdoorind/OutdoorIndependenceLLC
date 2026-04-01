"use client";

import Link from "next/link";
import ModuleCard from "@/components/development/ModuleCard";
import { useFuturePlatformLab } from "@/components/development/FuturePlatformLabProvider";
import { labButtonStyle, labCardStyle, labMutedTextStyle, labSubtleCardStyle } from "@/components/development/styles";

export default function FuturePlatformOverviewPage() {
  const { workflows, summary } = useFuturePlatformLab();

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section style={{ ...labCardStyle, display: "grid", gap: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Platform Snapshot</h2>
          <div style={{ ...labMutedTextStyle, marginTop: 8 }}>
            Use this private control panel to decide what is already reusable, what still carries
            internal assumptions, and which new business systems should come next.
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Link href="/settings/development/future-platform/modules" style={labButtonStyle}>
            Audit Modules
          </Link>
          <Link href="/settings/development/future-platform/roadmap" style={labButtonStyle}>
            Open Roadmap
          </Link>
          <Link href="/settings/development/future-platform/workflows" style={labButtonStyle}>
            Map Workflows
          </Link>
          <Link href="/settings/development/future-platform/readiness" style={labButtonStyle}>
            View Readiness
          </Link>
        </div>
      </section>

      <section style={{ ...labCardStyle, display: "grid", gap: 14 }}>
        <div>
          <h2 style={{ margin: 0 }}>Platform Workbench</h2>
          <div style={{ ...labMutedTextStyle, marginTop: 8 }}>
            Open the live William-only platform modules here instead of surfacing them on the main
            home dashboard.
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          <Link
            href="/crm"
            style={{
              ...labSubtleCardStyle,
              textDecoration: "none",
              color: "inherit",
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800 }}>CRM</div>
            <div style={labMutedTextStyle}>
              Manage the shared client and property backbone that future estimates, jobs, and
              billing workflows depend on.
            </div>
          </Link>

          <Link
            href="/estimates"
            style={{
              ...labSubtleCardStyle,
              textDecoration: "none",
              color: "inherit",
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800 }}>Estimates</div>
            <div style={labMutedTextStyle}>
              Continue the William-only estimate foundation, scope, and pricing workflow without
              exposing it on the main dashboard.
            </div>
          </Link>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        }}
      >
        <div style={{ ...labSubtleCardStyle, display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Critical Gaps</h3>
          <div style={labMutedTextStyle}>
            These are the highest-pressure systems to define before the app can mature into a true
            business platform.
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {summary.criticalGaps.slice(0, 5).map((module) => (
              <div
                key={`critical-gap-${module.id}`}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255, 126, 126, 0.18)",
                  background: "rgba(126, 29, 29, 0.18)",
                }}
              >
                <div style={{ fontWeight: 800 }}>{module.name}</div>
                <div style={{ ...labMutedTextStyle, fontSize: 13, marginTop: 4 }}>{module.notes}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...labSubtleCardStyle, display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Strongest Foundations</h3>
          <div style={labMutedTextStyle}>
            These areas are closest to becoming configurable platform capabilities instead of
            single-company tools.
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {summary.strongestFoundations.map((module) => (
              <div
                key={`foundation-${module.id}`}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(126,255,167,0.2)",
                  background: "rgba(53, 156, 84, 0.14)",
                }}
              >
                <div style={{ fontWeight: 800 }}>{module.name}</div>
                <div style={{ ...labMutedTextStyle, fontSize: 13, marginTop: 4 }}>{module.notes}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...labSubtleCardStyle, display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Workflow Coverage</h3>
          <div style={labMutedTextStyle}>
            Strategy maps currently seeded in the lab. These are local planning models only.
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--surface-border)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ fontWeight: 800 }}>{workflow.name}</div>
                <div style={{ ...labMutedTextStyle, fontSize: 13, marginTop: 4 }}>
                  {workflow.steps.length} steps mapped. {workflow.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gap: 14 }}>
        <div>
          <h2 style={{ marginBottom: 8 }}>Priority Module Focus</h2>
          <div style={labMutedTextStyle}>
            Quick scan of the highest-priority modules to shape next-stage product planning.
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          }}
        >
          {summary.criticalGaps.slice(0, 4).map((module) => (
            <ModuleCard key={`focus-${module.id}`} module={module} />
          ))}
        </div>
      </section>

      <section style={{ ...labCardStyle, display: "grid", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Isolation Notes</h2>
        <div style={labMutedTextStyle}>
          This lab is intentionally disconnected from production data. It uses local TypeScript seed
          data and in-memory editing only, so planning changes here never affect inspections,
          maintenance, purchases, teammate access, or any live operating workflow.
        </div>
      </section>
    </div>
  );
}
