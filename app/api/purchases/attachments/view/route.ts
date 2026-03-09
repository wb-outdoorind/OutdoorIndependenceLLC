import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { canAccessPurchases } from "@/lib/purchases";

export const runtime = "nodejs";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = evaluateRateLimit({
    key: `purchases-attachments:view:ip:${ip}`,
    limit: 160,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id ?? null;
  const role = session?.effectiveRole ?? "employee";
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessPurchases(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const actorLimit = evaluateRateLimit({
    key: `purchases-attachments:view:user:${userId}`,
    limit: 240,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const url = new URL(req.url);
  const id = asString(url.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: row, error: rowError } = await admin
    .from("purchase_request_attachments")
    .select("storage_bucket,storage_path")
    .eq("id", id)
    .maybeSingle();
  if (rowError) return NextResponse.json({ error: rowError.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });

  const { data: signed, error: signedError } = await admin.storage
    .from(row.storage_bucket)
    .createSignedUrl(row.storage_path, 60 * 10);
  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: signedError?.message || "Failed to open attachment." }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
