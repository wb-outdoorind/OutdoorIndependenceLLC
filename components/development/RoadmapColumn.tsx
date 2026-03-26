"use client";

import {
  FUTURE_PLATFORM_PRIORITY_LABELS,
  FUTURE_PLATFORM_PRIORITIES,
  FUTURE_PLATFORM_ROADMAP_PHASE_LABELS,
  type FuturePlatformModule,
  type FuturePlatformRoadmapPhase,
} from "@/lib/futurePlatformLab";
import {
  labButtonStyle,
  labInputStyle,
  labMutedTextStyle,
  labSubtleCardStyle,
  labTextareaStyle,
} from "@/components/development/styles";
import StatusBadge from "@/components/development/StatusBadge";

type RoadmapColumnProps = {
  phase: FuturePlatformRoadmapPhase;
  modules: FuturePlatformModule[];
  onPhaseChange: (moduleId: string, phase: FuturePlatformRoadmapPhase) => void;
  onUpdate: (moduleId: string, patch: Partial<FuturePlatformModule>) => void;
};

const ROADMAP_PHASE_ORDER: FuturePlatformRoadmapPhase[] = ["now", "next", "later"];

export default function RoadmapColumn({
  phase,
  modules,
  onPhaseChange,
  onUpdate,
}: RoadmapColumnProps) {
  const currentIndex = ROADMAP_PHASE_ORDER.indexOf(phase);

  return (
    <section style={{ ...labSubtleCardStyle, display: "grid", gap: 14, minHeight: 420 }}>
      <div>
        <h2 style={{ margin: 0 }}>{FUTURE_PLATFORM_ROADMAP_PHASE_LABELS[phase]}</h2>
        <div style={{ ...labMutedTextStyle, marginTop: 6, fontSize: 13 }}>
          {modules.length} module{modules.length === 1 ? "" : "s"} in this planning lane.
        </div>
      </div>

      {modules.length === 0 ? (
        <div style={{ ...labMutedTextStyle, fontSize: 14 }}>No modules assigned yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {modules.map((module) => (
            <article key={module.id} style={{ ...labSubtleCardStyle, padding: 14, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{module.name}</div>
                  <div style={{ ...labMutedTextStyle, marginTop: 4, fontSize: 12 }}>{module.category}</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
                  <StatusBadge value={module.priority} label={FUTURE_PLATFORM_PRIORITY_LABELS[module.priority]} />
                  <StatusBadge value={module.status} />
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {currentIndex > 0 ? (
                  <button
                    type="button"
                    style={labButtonStyle}
                    onClick={() => onPhaseChange(module.id, ROADMAP_PHASE_ORDER[currentIndex - 1])}
                  >
                    Move Left
                  </button>
                ) : null}
                {currentIndex < ROADMAP_PHASE_ORDER.length - 1 ? (
                  <button
                    type="button"
                    style={labButtonStyle}
                    onClick={() => onPhaseChange(module.id, ROADMAP_PHASE_ORDER[currentIndex + 1])}
                  >
                    Move Right
                  </button>
                ) : null}
              </div>

              <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                <span style={{ opacity: 0.76 }}>Priority</span>
                <select
                  value={module.priority}
                  style={labInputStyle}
                  onChange={(event) =>
                    onUpdate(module.id, {
                      priority: event.target.value as FuturePlatformModule["priority"],
                    })
                  }
                >
                  {FUTURE_PLATFORM_PRIORITIES.map((priority) => (
                    <option key={`${module.id}-roadmap-${priority}`} value={priority}>
                      {FUTURE_PLATFORM_PRIORITY_LABELS[priority]}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                <span style={{ opacity: 0.76 }}>Notes</span>
                <textarea
                  value={module.notes}
                  style={labTextareaStyle}
                  onChange={(event) => onUpdate(module.id, { notes: event.target.value })}
                />
              </label>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
