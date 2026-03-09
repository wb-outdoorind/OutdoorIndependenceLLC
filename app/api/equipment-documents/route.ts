import { NextResponse } from "next/server";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";

export const runtime = "nodejs";

const EQUIPMENT_DOC_BUCKET = "equipment_docs";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
type EquipmentDocType = "registration" | "insurance";

function canManageEquipmentDocuments(role: string | null | undefined) {
  const normalized = (role ?? "").trim().toLowerCase();
  return (
    normalized === "owner" ||
    normalized === "operations_manager" ||
    normalized === "office_admin" ||
    normalized === "mechanic"
  );
}

function sanitizeFilename(name: string) {
  const cleaned = name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");
  if (!cleaned) return "document.pdf";
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

function isPdfUpload(file: File) {
  const filename = file.name.toLowerCase();
  const mime = (file.type || "").toLowerCase();
  const mimeLooksPdf = !mime || mime === "application/pdf" || mime.includes("pdf");
  return filename.endsWith(".pdf") && mimeLooksPdf;
}

export async function GET(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = evaluateRateLimit({
    key: `equipment-documents:get:ip:${ip}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const actorLimit = evaluateRateLimit({
    key: `equipment-documents:get:user:${session.user.id}`,
    limit: 240,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const url = new URL(req.url);
  const equipmentId = (url.searchParams.get("equipmentId") || "").trim();
  if (!equipmentId) {
    return NextResponse.json({ error: "equipmentId is required" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("equipment_documents")
    .select("id,equipment_id,doc_type,file_name,created_at,updated_at")
    .eq("equipment_id", equipmentId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = evaluateRateLimit({
    key: `equipment-documents:post:ip:${ip}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const actorLimit = evaluateRateLimit({
    key: `equipment-documents:post:user:${session.user.id}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  if (!canManageEquipmentDocuments(session.effectiveRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const equipmentId = String(form.get("equipmentId") || "").trim();
  const docTypeRaw = String(form.get("docType") || "").trim().toLowerCase();
  const file = form.get("file");

  if (!equipmentId) {
    return NextResponse.json({ error: "equipmentId is required" }, { status: 400 });
  }
  if (docTypeRaw !== "registration" && docTypeRaw !== "insurance") {
    return NextResponse.json({ error: "docType must be registration or insurance" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!isPdfUpload(file)) {
    return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
  }

  const docType = docTypeRaw as EquipmentDocType;
  const admin = createSupabaseAdmin();

  const { data: equipmentRow, error: equipmentError } = await admin
    .from("equipment")
    .select("id")
    .eq("id", equipmentId)
    .maybeSingle();
  if (equipmentError) return NextResponse.json({ error: equipmentError.message }, { status: 500 });
  if (!equipmentRow) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

  const { data: existingDoc, error: existingDocError } = await admin
    .from("equipment_documents")
    .select("id,storage_bucket,storage_path")
    .eq("equipment_id", equipmentId)
    .eq("doc_type", docType)
    .maybeSingle();
  if (existingDocError) return NextResponse.json({ error: existingDocError.message }, { status: 500 });

  const safeName = sanitizeFilename(file.name);
  const storagePath = `${equipmentId}/${docType}/${Date.now()}-${safeName}`;

  const uploadRes = await admin.storage
    .from(EQUIPMENT_DOC_BUCKET)
    .upload(storagePath, file, {
      upsert: false,
      contentType: "application/pdf",
      cacheControl: "3600",
    });
  if (uploadRes.error) {
    return NextResponse.json({ error: uploadRes.error.message }, { status: 500 });
  }

  const nextDoc = {
    equipment_id: equipmentId,
    doc_type: docType,
    file_name: safeName,
    storage_bucket: EQUIPMENT_DOC_BUCKET,
    storage_path: uploadRes.data.path,
    uploaded_by: session.user.id,
  };

  let saved;
  if (existingDoc?.id) {
    const { data, error } = await admin
      .from("equipment_documents")
      .update(nextDoc)
      .eq("id", existingDoc.id)
      .select("id,equipment_id,doc_type,file_name,created_at,updated_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    saved = data;
  } else {
    const { data, error } = await admin
      .from("equipment_documents")
      .insert(nextDoc)
      .select("id,equipment_id,doc_type,file_name,created_at,updated_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    saved = data;
  }

  if (existingDoc?.storage_path && existingDoc.storage_path !== uploadRes.data.path) {
    await admin.storage
      .from(existingDoc.storage_bucket || EQUIPMENT_DOC_BUCKET)
      .remove([existingDoc.storage_path]);
  }

  return NextResponse.json({ item: saved });
}
