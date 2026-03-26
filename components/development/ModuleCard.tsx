"use client";

import {
  FUTURE_PLATFORM_CATEGORY_LABELS,
  FUTURE_PLATFORM_PRIORITIES,
  FUTURE_PLATFORM_PRIORITY_LABELS,
  FUTURE_PLATFORM_RISK_LABELS,
  FUTURE_PLATFORM_SAAS_READINESS,
  FUTURE_PLATFORM_SAAS_READINESS_LABELS,
  FUTURE_PLATFORM_STATUSES,
  FUTURE_PLATFORM_STATUS_LABELS,
  type FuturePlatformModule,
} from "@/lib/futurePlatformLab";
import { labInputStyle, labMutedTextStyle, labSubtleCardStyle, labTextareaStyle } from "@/components/development/styles";
import ReadinessBar from "@/components/development/ReadinessBar";
import StatusBadge from "@/components/development/StatusBadge";

type ModuleCardProps = {
  module: FuturePlatformModule;
  editable?: boolean;
  onChange?: (moduleId: string, patch: Partial<FuturePlatformModule>) => void;
};

export default function ModuleCard({ module, editable = false, onChange }: ModuleCardProps) {
  return (
    <article style={{ ...labSubtleCardStyle, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18 }}>{module.name}</h3>
          <div style={{ ...labMutedTextStyle, marginTop: 6, fontSize: 13 }}>
            {FUTURE_PLATFORM_CATEGORY_LABELS[module.category]}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
          <StatusBadge value={module.status} label={FUTURE_PLATFORM_STATUS_LABELS[module.status]} />
          <StatusBadge
            value={module.saasReadiness}
            label={FUTURE_PLATFORM_SAAS_READINESS_LABELS[module.saasReadiness]}
          />
          <StatusBadge value={module.priority} label={FUTURE_PLATFORM_PRIORITY_LABELS[module.priority]} />
        </div>
      </div>

      <ReadinessBar value={module.completenessScore} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <StatusBadge value={module.technicalRisk} label={FUTURE_PLATFORM_RISK_LABELS[module.technicalRisk]} />
      </div>

      {editable && onChange ? (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
            <span style={{ opacity: 0.76 }}>Status</span>
            <select
              value={module.status}
              style={labInputStyle}
              onChange={(event) => onChange(module.id, { status: event.target.value as FuturePlatformModule["status"] })}
            >
              {FUTURE_PLATFORM_STATUSES.map((status) => (
                <option key={`${module.id}-${status}`} value={status}>
                  {FUTURE_PLATFORM_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
            <span style={{ opacity: 0.76 }}>SaaS Readiness</span>
            <select
              value={module.saasReadiness}
              style={labInputStyle}
              onChange={(event) =>
                onChange(module.id, {
                  saasReadiness: event.target.value as FuturePlatformModule["saasReadiness"],
                })
              }
            >
              {FUTURE_PLATFORM_SAAS_READINESS.map((readiness) => (
                <option key={`${module.id}-${readiness}`} value={readiness}>
                  {FUTURE_PLATFORM_SAAS_READINESS_LABELS[readiness]}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
            <span style={{ opacity: 0.76 }}>Priority</span>
            <select
              value={module.priority}
              style={labInputStyle}
              onChange={(event) =>
                onChange(module.id, {
                  priority: event.target.value as FuturePlatformModule["priority"],
                })
              }
            >
              {FUTURE_PLATFORM_PRIORITIES.map((priority) => (
                <option key={`${module.id}-${priority}`} value={priority}>
                  {FUTURE_PLATFORM_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
        <span style={{ opacity: 0.76 }}>Notes</span>
        {editable && onChange ? (
          <textarea
            value={module.notes}
            style={labTextareaStyle}
            onChange={(event) => onChange(module.id, { notes: event.target.value })}
          />
        ) : (
          <div style={{ ...labSubtleCardStyle, padding: 12, minHeight: 90, ...labMutedTextStyle }}>{module.notes}</div>
        )}
      </label>
    </article>
  );
}
