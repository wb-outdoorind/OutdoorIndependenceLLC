export const FUTURE_PLATFORM_CATEGORIES = ["operations", "business", "finance", "system"] as const;
export const FUTURE_PLATFORM_STATUSES = ["mature", "partial", "early", "missing"] as const;
export const FUTURE_PLATFORM_SAAS_READINESS = [
  "reusable",
  "needs_config",
  "hardcoded",
  "internal_only",
] as const;
export const FUTURE_PLATFORM_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const FUTURE_PLATFORM_ROADMAP_PHASES = ["now", "next", "later"] as const;
export const FUTURE_PLATFORM_RISK_LEVELS = ["low", "medium", "high", "critical"] as const;

export type FuturePlatformCategory = (typeof FUTURE_PLATFORM_CATEGORIES)[number];
export type FuturePlatformModuleStatus = (typeof FUTURE_PLATFORM_STATUSES)[number];
export type FuturePlatformSaasReadiness = (typeof FUTURE_PLATFORM_SAAS_READINESS)[number];
export type FuturePlatformPriority = (typeof FUTURE_PLATFORM_PRIORITIES)[number];
export type FuturePlatformRoadmapPhase = (typeof FUTURE_PLATFORM_ROADMAP_PHASES)[number];
export type FuturePlatformRiskLevel = (typeof FUTURE_PLATFORM_RISK_LEVELS)[number];

export type FuturePlatformModule = {
  id: string;
  name: string;
  category: FuturePlatformCategory;
  status: FuturePlatformModuleStatus;
  saasReadiness: FuturePlatformSaasReadiness;
  priority: FuturePlatformPriority;
  roadmapPhase: FuturePlatformRoadmapPhase;
  completenessScore: number;
  technicalRisk: FuturePlatformRiskLevel;
  notes: string;
};

export type FuturePlatformWorkflowStep = {
  id: string;
  name: string;
  inputs: string[];
  outputs: string[];
  systemsInvolved: string[];
  notes: string;
};

export type FuturePlatformWorkflow = {
  id: string;
  name: string;
  description: string;
  steps: FuturePlatformWorkflowStep[];
};

export type FuturePlatformSummary = {
  totalModules: number;
  workflowCount: number;
  saasReadyPercent: number;
  criticalGapCount: number;
  criticalGaps: FuturePlatformModule[];
  strongestFoundations: FuturePlatformModule[];
  categoryBreakdown: Array<{
    category: FuturePlatformCategory;
    total: number;
    ready: number;
    missing: number;
  }>;
};

export const FUTURE_PLATFORM_CATEGORY_LABELS: Record<FuturePlatformCategory, string> = {
  operations: "Operations",
  business: "Business",
  finance: "Finance",
  system: "System",
};

export const FUTURE_PLATFORM_STATUS_LABELS: Record<FuturePlatformModuleStatus, string> = {
  mature: "Mature",
  partial: "Partial",
  early: "Early",
  missing: "Missing",
};

export const FUTURE_PLATFORM_SAAS_READINESS_LABELS: Record<FuturePlatformSaasReadiness, string> = {
  reusable: "Reusable",
  needs_config: "Needs Config",
  hardcoded: "Hardcoded",
  internal_only: "Internal Only",
};

export const FUTURE_PLATFORM_PRIORITY_LABELS: Record<FuturePlatformPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const FUTURE_PLATFORM_ROADMAP_PHASE_LABELS: Record<FuturePlatformRoadmapPhase, string> = {
  now: "Now",
  next: "Next",
  later: "Later",
};

export const FUTURE_PLATFORM_RISK_LABELS: Record<FuturePlatformRiskLevel, string> = {
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
  critical: "Critical Risk",
};

export const FUTURE_PLATFORM_MODULES: FuturePlatformModule[] = [
  {
    id: "maintenance",
    name: "Maintenance",
    category: "operations",
    status: "mature",
    saasReadiness: "needs_config",
    priority: "high",
    roadmapPhase: "now",
    completenessScore: 88,
    technicalRisk: "medium",
    notes: "Strong operational foundation. Needs company-level templates, scheduling hooks, and configuration controls.",
  },
  {
    id: "inspections_forms",
    name: "Inspections / Forms",
    category: "operations",
    status: "mature",
    saasReadiness: "needs_config",
    priority: "high",
    roadmapPhase: "now",
    completenessScore: 84,
    technicalRisk: "medium",
    notes: "Core inspection workflows exist. Form schemas and outputs still assume one internal operating model.",
  },
  {
    id: "inventory",
    name: "Inventory",
    category: "operations",
    status: "partial",
    saasReadiness: "needs_config",
    priority: "high",
    roadmapPhase: "now",
    completenessScore: 72,
    technicalRisk: "medium",
    notes: "Useful inventory base, but vendor setup, company settings, and customer-facing job linkage are still missing.",
  },
  {
    id: "purchases",
    name: "Purchases",
    category: "operations",
    status: "partial",
    saasReadiness: "hardcoded",
    priority: "medium",
    roadmapPhase: "next",
    completenessScore: 64,
    technicalRisk: "medium",
    notes: "Approval flow is promising, but the process is still tuned to Outdoor Independence operational rules.",
  },
  {
    id: "accountability",
    name: "Accountability",
    category: "operations",
    status: "partial",
    saasReadiness: "internal_only",
    priority: "medium",
    roadmapPhase: "next",
    completenessScore: 58,
    technicalRisk: "high",
    notes: "Helpful internal oversight tool. Needs configurable scoring logic before it becomes productized.",
  },
  {
    id: "training",
    name: "Training (OI Academy)",
    category: "operations",
    status: "partial",
    saasReadiness: "needs_config",
    priority: "medium",
    roadmapPhase: "later",
    completenessScore: 61,
    technicalRisk: "low",
    notes: "Solid knowledge-delivery base. Needs tenant content libraries, progress settings, and permission scoping.",
  },
  {
    id: "crm",
    name: "CRM",
    category: "business",
    status: "missing",
    saasReadiness: "internal_only",
    priority: "critical",
    roadmapPhase: "now",
    completenessScore: 12,
    technicalRisk: "high",
    notes: "No customer relationship layer yet. This is a core gap for SaaS expansion.",
  },
  {
    id: "properties",
    name: "Properties",
    category: "business",
    status: "early",
    saasReadiness: "hardcoded",
    priority: "high",
    roadmapPhase: "next",
    completenessScore: 28,
    technicalRisk: "high",
    notes: "Property-aware workflows are implied, but there is no reusable property model connected to customer accounts.",
  },
  {
    id: "jobs",
    name: "Jobs",
    category: "business",
    status: "missing",
    saasReadiness: "internal_only",
    priority: "critical",
    roadmapPhase: "now",
    completenessScore: 8,
    technicalRisk: "high",
    notes: "A job layer is required to bridge estimates, scheduling, execution, and invoicing.",
  },
  {
    id: "scheduling",
    name: "Scheduling",
    category: "business",
    status: "missing",
    saasReadiness: "internal_only",
    priority: "critical",
    roadmapPhase: "now",
    completenessScore: 10,
    technicalRisk: "high",
    notes: "Operational scheduling is still manual or implied. A shared scheduling engine is essential for platform growth.",
  },
  {
    id: "estimating",
    name: "Estimating",
    category: "business",
    status: "missing",
    saasReadiness: "internal_only",
    priority: "high",
    roadmapPhase: "next",
    completenessScore: 5,
    technicalRisk: "medium",
    notes: "No estimate builder exists yet. This is a key future sales-to-operations handoff point.",
  },
  {
    id: "production_rates",
    name: "Production Rates",
    category: "business",
    status: "early",
    saasReadiness: "hardcoded",
    priority: "medium",
    roadmapPhase: "later",
    completenessScore: 24,
    technicalRisk: "medium",
    notes: "Useful for estimating and profitability later, but today it is not modeled as a reusable system.",
  },
  {
    id: "invoicing",
    name: "Invoicing",
    category: "finance",
    status: "missing",
    saasReadiness: "internal_only",
    priority: "critical",
    roadmapPhase: "now",
    completenessScore: 8,
    technicalRisk: "high",
    notes: "No native invoice engine exists yet. Needed to close the loop after work completion.",
  },
  {
    id: "payments",
    name: "Payments",
    category: "finance",
    status: "missing",
    saasReadiness: "internal_only",
    priority: "high",
    roadmapPhase: "later",
    completenessScore: 6,
    technicalRisk: "high",
    notes: "Payment collection should follow after invoicing and customer account structures are in place.",
  },
  {
    id: "quickbooks_integration",
    name: "QuickBooks Integration",
    category: "finance",
    status: "missing",
    saasReadiness: "internal_only",
    priority: "high",
    roadmapPhase: "later",
    completenessScore: 0,
    technicalRisk: "medium",
    notes: "Accounting sync is downstream of invoicing, payments, and a stable customer/property model.",
  },
  {
    id: "multi_tenant_architecture",
    name: "Multi-tenant Architecture",
    category: "system",
    status: "missing",
    saasReadiness: "internal_only",
    priority: "critical",
    roadmapPhase: "next",
    completenessScore: 4,
    technicalRisk: "critical",
    notes: "Do not build this yet, but track it as a core prerequisite for turning the app into a platform.",
  },
  {
    id: "roles_permissions_per_company",
    name: "Roles/Permissions per Company",
    category: "system",
    status: "early",
    saasReadiness: "hardcoded",
    priority: "critical",
    roadmapPhase: "next",
    completenessScore: 26,
    technicalRisk: "high",
    notes: "Current RBAC is valuable, but it is scoped to one organization rather than company-aware tenant boundaries.",
  },
  {
    id: "configuration_system",
    name: "Configuration System",
    category: "system",
    status: "early",
    saasReadiness: "hardcoded",
    priority: "high",
    roadmapPhase: "now",
    completenessScore: 34,
    technicalRisk: "high",
    notes: "Feature behavior is mostly encoded in the app today. A structured configuration layer would unlock reuse safely.",
  },
];

export const FUTURE_PLATFORM_WORKFLOWS: FuturePlatformWorkflow[] = [
  {
    id: "client_property_estimate_job",
    name: "Client -> Property -> Estimate -> Job -> Schedule -> Complete -> Invoice",
    description: "Primary future revenue workflow that connects sales, field execution, and billing.",
    steps: [
      {
        id: "client_intake",
        name: "Client Intake",
        inputs: ["Lead source", "Company/contact details"],
        outputs: ["Customer record", "Sales context"],
        systemsInvolved: ["CRM"],
        notes: "Establish a reusable customer account before any property or estimate work begins.",
      },
      {
        id: "property_setup",
        name: "Property Setup",
        inputs: ["Customer record", "Property details", "Site notes"],
        outputs: ["Property record", "Service context"],
        systemsInvolved: ["Properties", "CRM"],
        notes: "Properties should support multiple service types, assets, and recurring plans.",
      },
      {
        id: "estimate_build",
        name: "Estimate Build",
        inputs: ["Property scope", "Production rates", "Service packages"],
        outputs: ["Estimate", "Proposed pricing"],
        systemsInvolved: ["Estimating", "Production Rates"],
        notes: "This is where configurable services and pricing logic will matter most.",
      },
      {
        id: "job_creation",
        name: "Job Creation",
        inputs: ["Approved estimate", "Service selections"],
        outputs: ["Job record", "Execution requirements"],
        systemsInvolved: ["Jobs", "CRM", "Properties"],
        notes: "Jobs become the operational object that scheduling, field teams, and invoicing all reference.",
      },
      {
        id: "schedule_dispatch",
        name: "Schedule / Dispatch",
        inputs: ["Job record", "Crew availability", "Route constraints"],
        outputs: ["Scheduled work", "Crew assignments"],
        systemsInvolved: ["Scheduling", "Jobs"],
        notes: "Scheduling should balance recurring work, crew capacity, and operational routing.",
      },
      {
        id: "work_completion",
        name: "Complete Work",
        inputs: ["Scheduled job", "Field completion data", "Photos/forms"],
        outputs: ["Completed job", "QA record"],
        systemsInvolved: ["Jobs", "Inspections / Forms", "Maintenance"],
        notes: "Existing field tools can become strong execution foundations here.",
      },
      {
        id: "invoice_customer",
        name: "Invoice Customer",
        inputs: ["Completed job", "Billable items", "Customer terms"],
        outputs: ["Invoice", "A/R event"],
        systemsInvolved: ["Invoicing", "Payments", "QuickBooks Integration"],
        notes: "Finance systems should be connected only after job completion data is trusted.",
      },
    ],
  },
  {
    id: "recurring_maintenance",
    name: "Recurring Maintenance Workflow",
    description: "Ongoing contract work that should move from agreement setup through repeat service execution.",
    steps: [
      {
        id: "plan_setup",
        name: "Service Plan Setup",
        inputs: ["Customer", "Property", "Contract terms"],
        outputs: ["Recurring plan", "Service cadence"],
        systemsInvolved: ["CRM", "Properties", "Configuration System"],
        notes: "Recurring plans should be configuration-driven instead of custom-coded per service.",
      },
      {
        id: "work_queue",
        name: "Generate Work Queue",
        inputs: ["Recurring plan", "Calendar window"],
        outputs: ["Upcoming service instances"],
        systemsInvolved: ["Jobs", "Scheduling"],
        notes: "A queue generator will keep crews ahead of seasonal demand without manual spreadsheet work.",
      },
      {
        id: "crew_dispatch",
        name: "Dispatch Crew",
        inputs: ["Service instances", "Crew capacity", "Route logic"],
        outputs: ["Assigned work"],
        systemsInvolved: ["Scheduling"],
        notes: "This is where recurring work and one-off jobs need to coexist cleanly.",
      },
      {
        id: "service_execution",
        name: "Service Execution",
        inputs: ["Assigned work", "Service checklist"],
        outputs: ["Completion record", "Exceptions"],
        systemsInvolved: ["Inspections / Forms", "Inventory"],
        notes: "Completion should feed both client reporting and internal quality oversight.",
      },
      {
        id: "billing_follow_up",
        name: "Billing / Follow-up",
        inputs: ["Completion record", "Contract billing rules"],
        outputs: ["Invoice event", "Account note"],
        systemsInvolved: ["Invoicing", "CRM"],
        notes: "Different billing models can be layered in later once the service plan engine is stable.",
      },
    ],
  },
  {
    id: "fertilizing_route",
    name: "Fertilizing Route Workflow",
    description: "Seasonal service flow that combines route planning, materials, completion tracking, and customer follow-up.",
    steps: [
      {
        id: "route_targeting",
        name: "Route Targeting",
        inputs: ["Active customer list", "Seasonal window", "Property requirements"],
        outputs: ["Eligible route set"],
        systemsInvolved: ["CRM", "Properties", "Scheduling"],
        notes: "Future routing should know which clients, properties, and products belong in each cycle.",
      },
      {
        id: "material_prep",
        name: "Material Prep",
        inputs: ["Route set", "Material requirements", "Inventory levels"],
        outputs: ["Loadout plan", "Restock signals"],
        systemsInvolved: ["Inventory", "Purchases"],
        notes: "This can build on the current operational inventory work already in the app.",
      },
      {
        id: "field_application",
        name: "Field Application",
        inputs: ["Assigned route", "Crew details", "Application checklist"],
        outputs: ["Service completion", "Issue notes"],
        systemsInvolved: ["Inspections / Forms", "Scheduling"],
        notes: "Capture should be simple for the crew and structured enough for later customer reporting.",
      },
      {
        id: "route_closeout",
        name: "Route Closeout",
        inputs: ["Completion data", "Exceptions", "Material usage"],
        outputs: ["Closed route", "Usage summary"],
        systemsInvolved: ["Inventory", "Accountability"],
        notes: "Closeout can become a strong performance and cost-control surface.",
      },
      {
        id: "customer_billing",
        name: "Customer Billing",
        inputs: ["Closed route", "Pricing rules"],
        outputs: ["Invoice", "Customer communication"],
        systemsInvolved: ["Invoicing", "CRM"],
        notes: "This step connects the current ops strength to future revenue automation.",
      },
    ],
  },
  {
    id: "snow_event",
    name: "Snow Event Workflow",
    description: "Event-driven service flow for weather-triggered demand, dispatch, proof of work, and post-event billing.",
    steps: [
      {
        id: "weather_trigger",
        name: "Weather Trigger",
        inputs: ["Forecasts", "Customer contracts", "Service thresholds"],
        outputs: ["Event trigger", "Priority queue"],
        systemsInvolved: ["CRM", "Configuration System", "Scheduling"],
        notes: "Threshold logic should eventually be tenant-configurable and contract-aware.",
      },
      {
        id: "dispatch_plan",
        name: "Dispatch Plan",
        inputs: ["Priority queue", "Crew/vehicle availability", "Route logic"],
        outputs: ["Dispatch plan", "Assigned crews"],
        systemsInvolved: ["Scheduling", "Jobs"],
        notes: "This is a high-leverage future workflow because it demands real-time operational control.",
      },
      {
        id: "event_execution",
        name: "Event Execution",
        inputs: ["Dispatch plan", "Service verification"],
        outputs: ["Completion proof", "Exceptions"],
        systemsInvolved: ["Inspections / Forms", "Jobs"],
        notes: "Proof of service and timestamps will matter heavily for customer trust and billing.",
      },
      {
        id: "event_review",
        name: "Post-Event Review",
        inputs: ["Completion proof", "Materials/labor used"],
        outputs: ["Event summary", "Margin insights"],
        systemsInvolved: ["Accountability", "Production Rates"],
        notes: "Review data can later feed cost analytics and contract optimization.",
      },
      {
        id: "event_billing",
        name: "Billing / Sync",
        inputs: ["Event summary", "Contract billing rules"],
        outputs: ["Invoice", "Accounting export"],
        systemsInvolved: ["Invoicing", "QuickBooks Integration"],
        notes: "Billing should support per-event, seasonal, and threshold-driven contract structures.",
      },
    ],
  },
];

export function labelFuturePlatformValue(value: string) {
  return value
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isSaasReadyModule(module: FuturePlatformModule) {
  return module.saasReadiness === "reusable" || module.saasReadiness === "needs_config";
}

export function cloneFuturePlatformModules(modules: FuturePlatformModule[] = FUTURE_PLATFORM_MODULES) {
  return modules.map((module) => ({ ...module }));
}

export function cloneFuturePlatformWorkflows(
  workflows: FuturePlatformWorkflow[] = FUTURE_PLATFORM_WORKFLOWS
) {
  return workflows.map((workflow) => ({
    ...workflow,
    steps: workflow.steps.map((step) => ({
      ...step,
      inputs: [...step.inputs],
      outputs: [...step.outputs],
      systemsInvolved: [...step.systemsInvolved],
    })),
  }));
}

export function getFuturePlatformSummary(
  modules: FuturePlatformModule[],
  workflows: FuturePlatformWorkflow[]
): FuturePlatformSummary {
  const readyCount = modules.filter((module) => isSaasReadyModule(module)).length;
  const criticalGaps = modules
    .filter((module) => module.priority === "critical" || module.status === "missing")
    .sort((left, right) => left.completenessScore - right.completenessScore)
    .slice(0, 6);
  const strongestFoundations = modules
    .filter((module) => module.status !== "missing")
    .sort((left, right) => right.completenessScore - left.completenessScore)
    .slice(0, 4);

  return {
    totalModules: modules.length,
    workflowCount: workflows.length,
    saasReadyPercent: modules.length ? Math.round((readyCount / modules.length) * 100) : 0,
    criticalGapCount: criticalGaps.length,
    criticalGaps,
    strongestFoundations,
    categoryBreakdown: FUTURE_PLATFORM_CATEGORIES.map((category) => {
      const categoryModules = modules.filter((module) => module.category === category);
      return {
        category,
        total: categoryModules.length,
        ready: categoryModules.filter((module) => isSaasReadyModule(module)).length,
        missing: categoryModules.filter((module) => module.status === "missing").length,
      };
    }),
  };
}
