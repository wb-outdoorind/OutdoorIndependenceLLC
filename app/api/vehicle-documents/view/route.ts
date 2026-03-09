import { NextResponse } from "next/server";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = evaluateRateLimit({
    key: `vehicle-documents:view:ip:${ip}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const actorLimit = evaluateRateLimit({
    key: `vehicle-documents:view:user:${session.user.id}`,
    limit: 240,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").trim();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data: row, error: rowError } = await admin
    .from("vehicle_documents")
    .select("storage_bucket,storage_path")
    .eq("id", id)
    .maybeSingle();

  if (rowError) return NextResponse.json({ error: rowError.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { data: signed, error: signedError } = await admin.storage
    .from(row.storage_bucket)
    .createSignedUrl(row.storage_path, 60 * 10);

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: signedError?.message || "Failed to open document" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
