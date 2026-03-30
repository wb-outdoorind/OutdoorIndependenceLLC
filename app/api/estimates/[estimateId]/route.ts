import { NextResponse } from "next/server";
import { canAccessRoute } from "@/lib/routeAccess";
import {
  ESTIMATE_DRAFT_SELECT,
  ESTIMATE_VISIT_INTENTS,
  mapEstimateDraftRow,
  type EstimateDraftRow,
  type EstimateVisitIntent,
} from "@/lib/estimatePersistence";
import { createServerSupabase, getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { isWilliamPlanningUser } from "@/lib/williamPlanningAccess";

export const runtime = "nodejs";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown) {
  const next = asString(value);
  return next ? next : null;
}

function asScopeDetails(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key.trim(), typeof entry === "string" ? entry.trim() : ""])
      .filter(([key, entry]) => key.length > 0 && entry.length > 0)
  );
}

function isEstimateVisitIntent(value: string | null): value is EstimateVisitIntent {
  if (!value) return false;
  return ESTIMATE_VISIT_INTENTS.includes(value as EstimateVisitIntent);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ estimateId: string }> }
) {
  const session = await getCurrentUserProfileStrict();

  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const role = session.effectiveRole ?? "employee";
  if (!canAccessRoute(role, "estimates") || !isWilliamPlanningUser(session.profile, session.user)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { estimateId } = await context.params;
  if (!estimateId) {
    return NextResponse.json({ error: "Estimate id is required." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const packageName = asNullableString(body?.packageName);
  const visitIntentRaw = asNullableString(body?.visitIntent);
  const scopeSummary = asNullableString(body?.scopeSummary);
  const operationsNotes = asNullableString(body?.operationsNotes);
  const scopeDetails = asScopeDetails(body?.scopeDetails);

  if (visitIntentRaw && !isEstimateVisitIntent(visitIntentRaw)) {
    return NextResponse.json({ error: "Visit intent is invalid." }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  const { data: existingRow, error: existingError } = await supabase
    .from("estimate_drafts")
    .select(ESTIMATE_DRAFT_SELECT)
    .eq("id", estimateId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (!existingRow) {
    return NextResponse.json({ error: "Estimate draft not found." }, { status: 404 });
  }

  const { data: savedRow, error: updateError } = await supabase
    .from("estimate_drafts")
    .update({
      package_name: packageName,
      visit_intent: visitIntentRaw ?? null,
      scope_summary: scopeSummary,
      scope_details: scopeDetails,
      operations_notes: operationsNotes,
      updated_by: session.user.id,
    })
    .eq("id", estimateId)
    .select(ESTIMATE_DRAFT_SELECT)
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ draft: mapEstimateDraftRow(savedRow as unknown as EstimateDraftRow) });
}
