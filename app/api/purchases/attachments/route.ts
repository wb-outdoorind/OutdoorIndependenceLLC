import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { canAccessPurchases, isPurchaseAttachmentType } from "@/lib/purchases";

export const runtime = "nodejs";

const PURCHASE_DOC_BUCKET = "purchase_docs";
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXT = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif"];
const ALLOWED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
];

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeFilename(name: string) {
  const cleaned = name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");
  return cleaned || "attachment";
}

function isAllowedUpload(file: File) {
  const lower = file.name.toLowerCase();
  const hasAllowedExt = ALLOWED_EXT.some((ext) => lower.endsWith(ext));
  const mime = (file.type || "").toLowerCase();
  const hasAllowedMime = !mime || ALLOWED_MIME.includes(mime);
  return hasAllowedExt && hasAllowedMime;
}

export async function POST(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = evaluateRateLimit({
    key: `purchases-attachments:post:ip:${ip}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id ?? null;
  const role = session?.effectiveRole ?? "employee";
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!canAccessPurchases(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const actorLimit = evaluateRateLimit({
    key: `purchases-attachments:post:user:${userId}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const form = await req.formData();
  const purchaseRequestId = asString(form.get("purchaseRequestId"));
  const itemId = asString(form.get("itemId")) || null;
  const attachmentTypeRaw = asString(form.get("attachmentType"));
  const file = form.get("file");

  if (!purchaseRequestId) {
    return NextResponse.json({ error: "purchaseRequestId is required." }, { status: 400 });
  }
  if (!isPurchaseAttachmentType(attachmentTypeRaw)) {
    return NextResponse.json({ error: "attachmentType must be quote or receipt." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File exceeds 15MB limit." }, { status: 400 });
  }
  if (!isAllowedUpload(file)) {
    return NextResponse.json({ error: "Only PDF or image uploads are allowed." }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data: requestRow, error: requestError } = await admin
    .from("purchase_requests")
    .select("id")
    .eq("id", purchaseRequestId)
    .maybeSingle();
  if (requestError) return NextResponse.json({ error: requestError.message }, { status: 500 });
  if (!requestRow) return NextResponse.json({ error: "Purchase request not found." }, { status: 404 });

  if (itemId) {
    const { data: itemRow, error: itemError } = await admin
      .from("purchase_request_items")
      .select("id")
      .eq("id", itemId)
      .eq("purchase_request_id", purchaseRequestId)
      .maybeSingle();
    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });
    if (!itemRow) {
      return NextResponse.json({ error: "Item not found for this purchase request." }, { status: 400 });
    }
  }

  const safeName = sanitizeFilename(file.name);
  const storagePath = `${purchaseRequestId}/${attachmentTypeRaw}/${Date.now()}-${safeName}`;

  const uploadRes = await admin.storage.from(PURCHASE_DOC_BUCKET).upload(storagePath, file, {
    upsert: false,
    contentType: file.type || undefined,
    cacheControl: "3600",
  });
  if (uploadRes.error) {
    return NextResponse.json({ error: uploadRes.error.message }, { status: 500 });
  }

  const { data: insertedRow, error: insertError } = await admin
    .from("purchase_request_attachments")
    .insert({
      purchase_request_id: purchaseRequestId,
      item_id: itemId,
      attachment_type: attachmentTypeRaw,
      file_name: safeName,
      storage_bucket: PURCHASE_DOC_BUCKET,
      storage_path: uploadRes.data.path,
      uploaded_by: userId,
    })
    .select("id,purchase_request_id,item_id,attachment_type,file_name,storage_bucket,storage_path,uploaded_by,created_at")
    .single();
  if (insertError) {
    await admin.storage.from(PURCHASE_DOC_BUCKET).remove([uploadRes.data.path]);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ attachment: insertedRow });
}
