"use client";

import WorkflowStepCard from "@/components/development/WorkflowStepCard";
import { useFuturePlatformLab } from "@/components/development/FuturePlatformLabProvider";
import { labButtonStyle, labCardStyle, labMutedTextStyle, labSubtleCardStyle } from "@/components/development/styles";

export default function FuturePlatformWorkflowsPage() {
  const { workflows, updateWorkflowStep, addWorkflowStep, removeWorkflowStep } = useFuturePlatformLab();

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section style={{ ...labCardStyle, display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0 }}>Workflow Mapper</h2>
        <div style={labMutedTextStyle}>
          Model the end-to-end business flows the platform needs to support. Each step is editable so
          you can refine inputs, outputs, system dependencies, and transition notes without touching
          production logic.
        </div>
      </section>

      <div style={{ display: "grid", gap: 18 }}>
        {workflows.map((workflow) => (
          <section key={workflow.id} style={{ ...labCardStyle, display: "grid", gap: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
              <div>
                <h3 style={{ margin: 0 }}>{workflow.name}</h3>
                <div style={{ ...labMutedTextStyle, marginTop: 6 }}>{workflow.description}</div>
              </div>

              <div>
                <button
                  type="button"
                  style={labButtonStyle}
                  onClick={() => addWorkflowStep(workflow.id)}
                >
                  Add Step
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: 14,
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                alignItems: "start",
              }}
            >
              {workflow.steps.map((step, index) => (
                <div key={step.id} style={{ display: "grid", gap: 10 }}>
                  <WorkflowStepCard
                    step={step}
                    index={index}
                    onChange={(stepId, patch) => updateWorkflowStep(workflow.id, stepId, patch)}
                    onRemove={workflow.steps.length > 1 ? (stepId) => removeWorkflowStep(workflow.id, stepId) : undefined}
                  />
                  {index < workflow.steps.length - 1 ? (
                    <div
                      aria-hidden="true"
                      style={{
                        justifySelf: "center",
                        width: 38,
                        height: 38,
                        borderRadius: 999,
                        border: "1px solid var(--surface-border)",
                        background: "rgba(255,255,255,0.03)",
                        display: "grid",
                        placeItems: "center",
                        opacity: 0.7,
                        fontWeight: 800,
                      }}
                    >
                      →
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section style={{ ...labSubtleCardStyle, display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Planning Mode</h3>
        <div style={labMutedTextStyle}>
          These workflow edits are isolated to this private lab session. They are intended for system
          design and handoff planning, not live operational execution.
        </div>
      </section>
    </div>
  );
}
