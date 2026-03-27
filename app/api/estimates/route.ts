import { NextResponse } from "next/server";
import { canAccessRoute } from "@/lib/routeAccess";
import {
  buildEstimateDraftRecord,
  ESTIMATE_DRAFT_SELECT,
  ESTIMATE_SERVICE_LINE_LABELS,
  ESTIMATE_SERVICE_LINES,
  estimateDraftToRow,
  mapEstimateDraftRow,
  type EstimateDraftRow,
  type EstimateServiceLine,
} from "@/lib/estimatePersistence";
import { createServerSupabase, getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { isWilliamPlanningUser } from "@/lib/williamPlanningAccess";

export const runtime = "nodejs";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asDateOrNull(value: unknown) {
  const next = asString(value);
  if (!next) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null;
}

function isEstimateServiceLine(value: string): value is EstimateServiceLine {
  return ESTIMATE_SERVICE_LINES.includes(value as EstimateServiceLine);
}

export async function POST(request: Request) {
  const session = await getCurrentUserProfileStrict();

  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const role = session.effectiveRole ?? "employee";
  if (!canAccessRoute(role, "estimates") || !isWilliamPlanningUser(session.profile, session.user)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const clientId = asString(body?.clientId);
  const propertyId = asString(body?.propertyId);
  const title = asString(body?.title);
  const serviceLineRaw = asString(body?.serviceLine);
  const targetStart = asDateOrNull(body?.targetStart);
  const internalNotes = asString(body?.internalNotes);

  if (!clientId) {
    return NextResponse.json({ error: "Client is required." }, { status: 400 });
  }

  if (!propertyId) {
    return NextResponse.json({ error: "Property is required." }, { status: 400 });
  }

  if (!isEstimateServiceLine(serviceLineRaw)) {
    return NextResponse.json({ error: "Valid service line is required." }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  const { data: propertyRow, error: propertyError } = await supabase
    .from("crm_properties")
    .select("id, property_name, client_id")
    .eq("id", propertyId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (propertyError) {
    return NextResponse.json({ error: propertyError.message }, { status: 500 });
  }

  if (!propertyRow) {
    return NextResponse.json(
      { error: "The selected property is no longer linked to the selected client." },
      { status: 400 }
    );
  }

  const resolvedTitle =
    title || `${propertyRow.property_name} ${ESTIMATE_SERVICE_LINE_LABELS[serviceLineRaw]} Estimate`;

  const draftId = `estimate_${crypto.randomUUID()}`;
  const draft = buildEstimateDraftRecord({
    draftId,
    clientId,
    propertyId,
    title: resolvedTitle,
    serviceLine: serviceLineRaw,
    targetStart,
    internalNotes,
    actorId: session.user.id,
    stage: "scope_pricing",
  });

  const { data: savedRow, error: insertError } = await supabase
    .from("estimate_drafts")
    .insert(estimateDraftToRow(draft))
    .select(ESTIMATE_DRAFT_SELECT)
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ draft: mapEstimateDraftRow(savedRow as unknown as EstimateDraftRow) });
}
