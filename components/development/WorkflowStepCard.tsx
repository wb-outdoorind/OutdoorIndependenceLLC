"use client";

import type { FuturePlatformWorkflowStep } from "@/lib/futurePlatformLab";
import { labButtonStyle, labInputStyle, labSubtleCardStyle, labTextareaStyle } from "@/components/development/styles";

type WorkflowStepCardProps = {
  step: FuturePlatformWorkflowStep;
  index: number;
  onChange: (stepId: string, patch: Partial<FuturePlatformWorkflowStep>) => void;
  onRemove?: (stepId: string) => void;
};

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function WorkflowStepCard({ step, index, onChange, onRemove }: WorkflowStepCardProps) {
  return (
    <article style={{ ...labSubtleCardStyle, display: "grid", gap: 12, minWidth: 260 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.68 }}>Step {index + 1}</div>
          <div style={{ marginTop: 4, fontWeight: 800 }}>{step.name}</div>
        </div>

        {onRemove ? (
          <button type="button" style={labButtonStyle} onClick={() => onRemove(step.id)}>
            Remove
          </button>
        ) : null}
      </div>

      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
        <span style={{ opacity: 0.76 }}>Step Name</span>
        <input
          type="text"
          value={step.name}
          style={labInputStyle}
          onChange={(event) => onChange(step.id, { name: event.target.value })}
        />
      </label>

      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
        <span style={{ opacity: 0.76 }}>Inputs</span>
        <input
          type="text"
          value={step.inputs.join(", ")}
          style={labInputStyle}
          onChange={(event) => onChange(step.id, { inputs: splitList(event.target.value) })}
        />
      </label>

      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
        <span style={{ opacity: 0.76 }}>Outputs</span>
        <input
          type="text"
          value={step.outputs.join(", ")}
          style={labInputStyle}
          onChange={(event) => onChange(step.id, { outputs: splitList(event.target.value) })}
        />
      </label>

      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
        <span style={{ opacity: 0.76 }}>Systems Involved</span>
        <input
          type="text"
          value={step.systemsInvolved.join(", ")}
          style={labInputStyle}
          onChange={(event) => onChange(step.id, { systemsInvolved: splitList(event.target.value) })}
        />
      </label>

      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
        <span style={{ opacity: 0.76 }}>Notes</span>
        <textarea
          value={step.notes}
          style={labTextareaStyle}
          onChange={(event) => onChange(step.id, { notes: event.target.value })}
        />
      </label>
    </article>
  );
}
