import { forwardPurchaseStagePatch } from "@/app/api/purchases/_lib/forwardStagePatch";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const payload: Record<string, unknown> = {
    ...body,
    id: decodeURIComponent(id),
    stage: "complete",
  };
  return forwardPurchaseStagePatch(req, payload);
}

