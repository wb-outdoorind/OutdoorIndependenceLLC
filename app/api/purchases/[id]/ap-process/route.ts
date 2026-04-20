import { forwardPurchaseStagePatch } from "@/app/api/purchases/_lib/forwardStagePatch";

function asDecisionRows(value: unknown, forcedDecision: "approved" | "denied" | null) {
  if (!Array.isArray(value) || !forcedDecision) return value;
  return value.map((row) => {
    if (!row || typeof row !== "object") return row;
    return { ...(row as Record<string, unknown>), decision: forcedDecision };
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const decisionRaw =
    typeof body.decision === "string" ? body.decision.trim().toLowerCase() : "";
  const forcedDecision =
    decisionRaw === "approved" || decisionRaw === "denied"
      ? decisionRaw
      : null;
  const payload: Record<string, unknown> = {
    ...body,
    id: decodeURIComponent(id),
    stage: "ap",
    apDecisions: asDecisionRows(body.apDecisions, forcedDecision),
  };
  return forwardPurchaseStagePatch(req, payload);
}

