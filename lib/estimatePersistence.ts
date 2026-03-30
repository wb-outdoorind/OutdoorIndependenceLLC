export const ESTIMATE_SERVICE_LINES = [
  "maintenance",
  "fertilizing",
  "snow",
  "landscape",
] as const;

export const ESTIMATE_DRAFT_STAGES = [
  "scope_pricing",
  "review_ready",
  "sent",
] as const;

export const ESTIMATE_VISIT_INTENTS = [
  "recurring",
  "seasonal",
  "event_based",
  "one_time",
] as const;

export type EstimateServiceLine = (typeof ESTIMATE_SERVICE_LINES)[number];
export type EstimateDraftStage = (typeof ESTIMATE_DRAFT_STAGES)[number];
export type EstimateVisitIntent = (typeof ESTIMATE_VISIT_INTENTS)[number];

export type EstimateDraft = {
  id: string;
  clientId: string;
  propertyId: string;
  title: string;
  serviceLine: EstimateServiceLine;
  targetStart: string | null;
  internalNotes: string | null;
  packageName: string | null;
  visitIntent: EstimateVisitIntent | null;
  scopeSummary: string | null;
  scopeDetails: Record<string, string>;
  operationsNotes: string | null;
  stage: EstimateDraftStage;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EstimateDraftRow = {
  id: string;
  client_id: string;
  property_id: string;
  title: string;
  service_line: EstimateServiceLine;
  target_start: string | null;
  internal_notes: string | null;
  package_name: string | null;
  visit_intent: EstimateVisitIntent | null;
  scope_summary: string | null;
  scope_details: Record<string, string> | null;
  operations_notes: string | null;
  stage: EstimateDraftStage;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type QueryError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
} | null;

export type EstimateSupabaseReader = {
  from(table: "estimate_drafts"): {
    select(columns: string): {
      order(
        column: string,
        options: { ascending: boolean }
      ): Promise<{ data: EstimateDraftRow[] | null; error: QueryError }>;
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: EstimateDraftRow | null; error: QueryError }>;
      };
    };
  };
};

export const ESTIMATE_SERVICE_LINE_LABELS: Record<EstimateServiceLine, string> = {
  maintenance: "Maintenance",
  fertilizing: "Fertilizing",
  snow: "Snow",
  landscape: "Landscape",
};

export const ESTIMATE_SERVICE_LINE_OPTIONS = ESTIMATE_SERVICE_LINES.map((value) => ({
  value,
  label: ESTIMATE_SERVICE_LINE_LABELS[value],
}));

export const ESTIMATE_DRAFT_STAGE_LABELS: Record<EstimateDraftStage, string> = {
  scope_pricing: "Scope & Pricing",
  review_ready: "Ready for Review",
  sent: "Sent",
};

export const ESTIMATE_DRAFT_SELECT = [
  "id",
  "client_id",
  "property_id",
  "title",
  "service_line",
  "target_start",
  "internal_notes",
  "package_name",
  "visit_intent",
  "scope_summary",
  "scope_details",
  "operations_notes",
  "stage",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
].join(", ");

function nullableString(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asDateOrNull(value: string | null | undefined) {
  const trimmed = nullableString(value);
  if (!trimmed) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function asScopeDetails(value: Record<string, string> | null | undefined) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key.trim(), typeof entry === "string" ? entry.trim() : ""])
      .filter(([key, entry]) => key.length > 0 && entry.length > 0)
  );
}

export function estimatePersistenceErrorDetails(error: QueryError) {
  if (!error) return null;
  return {
    code: error.code ?? "unknown",
    message: error.message ?? "Unknown Supabase error",
    details: error.details ?? null,
    hint: error.hint ?? null,
  };
}

export function logEstimatePersistenceError(
  context: string,
  error: QueryError,
  extra?: Record<string, unknown>
) {
  console.error(`[ESTIMATES] ${context}`, {
    ...estimatePersistenceErrorDetails(error),
    ...(extra ?? {}),
  });
}

export function mapEstimateDraftRow(row: EstimateDraftRow): EstimateDraft {
  return {
    id: row.id,
    clientId: row.client_id,
    propertyId: row.property_id,
    title: row.title,
    serviceLine: row.service_line,
    targetStart: row.target_start,
    internalNotes: row.internal_notes,
    packageName: row.package_name,
    visitIntent: row.visit_intent,
    scopeSummary: row.scope_summary,
    scopeDetails: asScopeDetails(row.scope_details),
    operationsNotes: row.operations_notes,
    stage: row.stage,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildEstimateDraftRecord(params: {
  draftId: string;
  clientId: string;
  propertyId: string;
  title: string;
  serviceLine: EstimateServiceLine;
  targetStart?: string | null;
  internalNotes?: string | null;
  packageName?: string | null;
  visitIntent?: EstimateVisitIntent | null;
  scopeSummary?: string | null;
  scopeDetails?: Record<string, string> | null;
  operationsNotes?: string | null;
  actorId?: string | null;
  stage?: EstimateDraftStage;
  existingDraft?: EstimateDraft | null;
  now?: string;
}) {
  const {
    draftId,
    clientId,
    propertyId,
    title,
    serviceLine,
    targetStart = null,
    internalNotes = null,
    packageName = null,
    visitIntent = null,
    scopeSummary = null,
    scopeDetails = null,
    operationsNotes = null,
    actorId = null,
    stage = "scope_pricing",
    existingDraft = null,
    now = new Date().toISOString(),
  } = params;

  const trimmedTitle = title.trim();

  const draft: EstimateDraft = {
    id: draftId,
    clientId,
    propertyId,
    title: trimmedTitle,
    serviceLine,
    targetStart: asDateOrNull(targetStart),
    internalNotes: nullableString(internalNotes),
    packageName: nullableString(packageName) ?? existingDraft?.packageName ?? null,
    visitIntent: visitIntent ?? existingDraft?.visitIntent ?? null,
    scopeSummary: nullableString(scopeSummary) ?? existingDraft?.scopeSummary ?? null,
    scopeDetails: asScopeDetails(scopeDetails ?? existingDraft?.scopeDetails ?? null),
    operationsNotes: nullableString(operationsNotes) ?? existingDraft?.operationsNotes ?? null,
    stage,
    createdBy: existingDraft?.createdBy ?? actorId,
    updatedBy: actorId,
    createdAt: existingDraft?.createdAt ?? now,
    updatedAt: now,
  };

  return draft;
}

export function estimateDraftToRow(draft: EstimateDraft): EstimateDraftRow {
  return {
    id: draft.id,
    client_id: draft.clientId,
    property_id: draft.propertyId,
    title: draft.title,
    service_line: draft.serviceLine,
    target_start: draft.targetStart,
    internal_notes: draft.internalNotes,
    package_name: draft.packageName,
    visit_intent: draft.visitIntent,
    scope_summary: draft.scopeSummary,
    scope_details: asScopeDetails(draft.scopeDetails),
    operations_notes: draft.operationsNotes,
    stage: draft.stage,
    created_by: draft.createdBy,
    updated_by: draft.updatedBy,
    created_at: draft.createdAt,
    updated_at: draft.updatedAt,
  };
}

export async function loadEstimateDrafts(supabase: EstimateSupabaseReader) {
  const { data, error } = await supabase
    .from("estimate_drafts")
    .select(ESTIMATE_DRAFT_SELECT)
    .order("updated_at", { ascending: false });

  if (error) {
    return { drafts: [] as EstimateDraft[], error };
  }

  return {
    drafts: (data ?? []).map(mapEstimateDraftRow),
    error: null as QueryError,
  };
}

export async function loadEstimateDraftById(
  supabase: EstimateSupabaseReader,
  draftId: string
) {
  const { data, error } = await supabase
    .from("estimate_drafts")
    .select(ESTIMATE_DRAFT_SELECT)
    .eq("id", draftId)
    .maybeSingle();

  if (error) {
    return { draft: null as EstimateDraft | null, error };
  }

  return {
    draft: data ? mapEstimateDraftRow(data) : null,
    error: null as QueryError,
  };
}
