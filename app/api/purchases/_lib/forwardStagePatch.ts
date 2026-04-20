import { PATCH as patchPurchases } from "@/app/api/purchases/route";

export async function forwardPurchaseStagePatch(
  req: Request,
  payload: Record<string, unknown>
) {
  const headers = new Headers(req.headers);
  headers.set("content-type", "application/json");
  const patchRequest = new Request(req.url, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload),
  });
  return patchPurchases(patchRequest);
}

