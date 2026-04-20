import { forwardPurchaseStagePatch } from "@/app/api/purchases/_lib/forwardStagePatch";

function asDecisionRows(value: unknown, forcedDecision: "approved" | "denied") {
  if (!Array.isArray(value)) return value;
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
  const payload: Record<string, unknown> = {
    ...body,
    id: decodeURIComponent(id),
    stage: "manager",
    managerDecisions: asDecisionRows(body.managerDecisions, "denied"),
  };
  return forwardPurchaseStagePatch(req, payload);
}

