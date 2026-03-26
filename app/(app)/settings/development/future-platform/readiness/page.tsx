"use client";

import ReadinessBar from "@/components/development/ReadinessBar";
import StatusBadge from "@/components/development/StatusBadge";
import { useFuturePlatformLab } from "@/components/development/FuturePlatformLabProvider";
import {
  FUTURE_PLATFORM_RISK_LABELS,
  FUTURE_PLATFORM_SAAS_READINESS_LABELS,
  FUTURE_PLATFORM_STATUS_LABELS,
  type FuturePlatformModule,
} from "@/lib/futurePlatformLab";
import { labCardStyle, labMutedTextStyle, labSubtleCardStyle } from "@/components/development/styles";

const PRIORITY_RANK: Record<FuturePlatformModule["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export default function FuturePlatformReadinessPage() {
  const { modules, summary } = useFuturePlatformLab();

  const sortedModules = modules.slice().sort((left, right) => {
    if (PRIORITY_RANK[left.priority] !== PRIORITY_RANK[right.priority]) {
      return PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    }
    return right.completenessScore - left.completenessScore;
  });

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        }}
      >
        <div style={labCardStyle}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.68 }}>
            Percent SaaS-Ready
          </div>
          <div style={{ marginTop: 10, fontSize: 28, fontWeight: 900 }}>{summary.saasReadyPercent}%</div>
          <div style={{ ...labMutedTextStyle, marginTop: 8, fontSize: 13 }}>
            Modules currently marked reusable or close with configuration.
          </div>
        </div>

        <div style={labCardStyle}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.68 }}>
            Critical Gaps
          </div>
          <div style={{ marginTop: 10, fontSize: 28, fontWeight: 900 }}>{summary.criticalGapCount}</div>
          <div style={{ ...labMutedTextStyle, marginTop: 8, fontSize: 13 }}>
            Missing or high-pressure systems blocking a cleaner SaaS evolution path.
          </div>
        </div>

        <div style={labCardStyle}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.68 }}>
            Strongest Foundations
          </div>
          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            {summary.strongestFoundations.slice(0, 3).map((module) => (
              <div key={`readiness-foundation-${module.id}`} style={{ fontWeight: 700 }}>
                {module.name}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ ...labCardStyle, display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0 }}>SaaS Readiness Scoreboard</h2>
        <div style={labMutedTextStyle}>
          Completeness, platform readiness, and technical risk are shown side by side so you can
          separate strong operational foundations from the systems that still need architectural work.
        </div>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        {sortedModules.map((module) => (
          <article
            key={module.id}
            style={{
              ...labSubtleCardStyle,
              display: "grid",
              gap: 12,
              gridTemplateColumns: "minmax(0, 1.2fr) minmax(220px, 1fr)",
            }}
          >
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18 }}>{module.name}</h3>
                  <div style={{ ...labMutedTextStyle, marginTop: 4, fontSize: 13 }}>{module.notes}</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
                  <StatusBadge
                    value={module.saasReadiness}
                    label={FUTURE_PLATFORM_SAAS_READINESS_LABELS[module.saasReadiness]}
                  />
                  <StatusBadge
                    value={module.technicalRisk}
                    label={FUTURE_PLATFORM_RISK_LABELS[module.technicalRisk]}
                  />
                  <StatusBadge value={module.status} label={FUTURE_PLATFORM_STATUS_LABELS[module.status]} />
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
              <ReadinessBar value={module.completenessScore} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <StatusBadge value={module.priority} />
                <StatusBadge value={module.roadmapPhase} />
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
