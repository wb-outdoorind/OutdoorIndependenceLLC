"use client";

import { createContext, useContext, useState } from "react";
import {
  cloneFuturePlatformModules,
  cloneFuturePlatformWorkflows,
  getFuturePlatformSummary,
  type FuturePlatformModule,
  type FuturePlatformRoadmapPhase,
  type FuturePlatformSummary,
  type FuturePlatformWorkflow,
  type FuturePlatformWorkflowStep,
} from "@/lib/futurePlatformLab";

type FuturePlatformLabContextValue = {
  modules: FuturePlatformModule[];
  workflows: FuturePlatformWorkflow[];
  summary: FuturePlatformSummary;
  updateModule: (moduleId: string, patch: Partial<FuturePlatformModule>) => void;
  setModuleRoadmapPhase: (moduleId: string, phase: FuturePlatformRoadmapPhase) => void;
  updateWorkflowStep: (
    workflowId: string,
    stepId: string,
    patch: Partial<FuturePlatformWorkflowStep>
  ) => void;
  addWorkflowStep: (workflowId: string) => void;
  removeWorkflowStep: (workflowId: string, stepId: string) => void;
};

const FuturePlatformLabContext = createContext<FuturePlatformLabContextValue | null>(null);

export function FuturePlatformLabProvider({ children }: { children: React.ReactNode }) {
  const [modules, setModules] = useState<FuturePlatformModule[]>(() => cloneFuturePlatformModules());
  const [workflows, setWorkflows] = useState<FuturePlatformWorkflow[]>(() => cloneFuturePlatformWorkflows());

  function updateModule(moduleId: string, patch: Partial<FuturePlatformModule>) {
    setModules((current) =>
      current.map((module) => (module.id === moduleId ? { ...module, ...patch } : module))
    );
  }

  function setModuleRoadmapPhase(moduleId: string, phase: FuturePlatformRoadmapPhase) {
    updateModule(moduleId, { roadmapPhase: phase });
  }

  function updateWorkflowStep(
    workflowId: string,
    stepId: string,
    patch: Partial<FuturePlatformWorkflowStep>
  ) {
    setWorkflows((current) =>
      current.map((workflow) =>
        workflow.id !== workflowId
          ? workflow
          : {
              ...workflow,
              steps: workflow.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
            }
      )
    );
  }

  function addWorkflowStep(workflowId: string) {
    setWorkflows((current) =>
      current.map((workflow) =>
        workflow.id !== workflowId
          ? workflow
          : {
              ...workflow,
              steps: [
                ...workflow.steps,
                {
                  id: `${workflow.id}-${Date.now()}`,
                  name: "New Step",
                  inputs: [],
                  outputs: [],
                  systemsInvolved: [],
                  notes: "Define the handoff, ownership, and platform dependency for this step.",
                },
              ],
            }
      )
    );
  }

  function removeWorkflowStep(workflowId: string, stepId: string) {
    setWorkflows((current) =>
      current.map((workflow) =>
        workflow.id !== workflowId
          ? workflow
          : {
              ...workflow,
              steps: workflow.steps.filter((step) => step.id !== stepId),
            }
      )
    );
  }

  const summary = getFuturePlatformSummary(modules, workflows);

  return (
    <FuturePlatformLabContext.Provider
      value={{
        modules,
        workflows,
        summary,
        updateModule,
        setModuleRoadmapPhase,
        updateWorkflowStep,
        addWorkflowStep,
        removeWorkflowStep,
      }}
    >
      {children}
    </FuturePlatformLabContext.Provider>
  );
}

export function useFuturePlatformLab() {
  const value = useContext(FuturePlatformLabContext);
  if (!value) {
    throw new Error("useFuturePlatformLab must be used within FuturePlatformLabProvider.");
  }
  return value;
}
