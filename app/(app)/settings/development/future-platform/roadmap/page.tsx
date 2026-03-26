"use client";

import RoadmapColumn from "@/components/development/RoadmapColumn";
import { useFuturePlatformLab } from "@/components/development/FuturePlatformLabProvider";
import {
  FUTURE_PLATFORM_ROADMAP_PHASES,
  type FuturePlatformModule,
  type FuturePlatformRoadmapPhase,
} from "@/lib/futurePlatformLab";
import { labCardStyle, labMutedTextStyle } from "@/components/development/styles";

const PRIORITY_RANK: Record<FuturePlatformModule["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export default function FuturePlatformRoadmapPage() {
  const { modules, setModuleRoadmapPhase, updateModule } = useFuturePlatformLab();

  function modulesForPhase(phase: FuturePlatformRoadmapPhase) {
    return modules
      .filter((module) => module.roadmapPhase === phase)
      .slice()
      .sort((left, right) => {
        if (PRIORITY_RANK[left.priority] !== PRIORITY_RANK[right.priority]) {
          return PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
        }
        return left.name.localeCompare(right.name);
      });
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section style={{ ...labCardStyle, display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0 }}>Future Roadmap Tracker</h2>
        <div style={labMutedTextStyle}>
          Move modules across Now, Next, and Later to pressure-test sequencing. Priority and notes
          remain editable so this can act as a lightweight planning board during strategy sessions.
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          alignItems: "start",
        }}
      >
        {FUTURE_PLATFORM_ROADMAP_PHASES.map((phase) => (
          <RoadmapColumn
            key={phase}
            phase={phase}
            modules={modulesForPhase(phase)}
            onPhaseChange={setModuleRoadmapPhase}
            onUpdate={updateModule}
          />
        ))}
      </section>
    </div>
  );
}
