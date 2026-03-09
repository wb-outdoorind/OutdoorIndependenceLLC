import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PROFILE_PHOTO_BUCKET = "profile_photos";
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

function sanitizeFilename(name: string) {
  const cleaned = name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");
  return cleaned || "profile-photo.jpg";
}

function isAllowedImage(file: File) {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/")) {
    return (
      mime === "image/png" ||
      mime === "image/jpeg" ||
      mime === "image/webp" ||
      mime === "image/heic" ||
      mime === "image/heif"
    );
  }
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".heic") ||
    lower.endsWith(".heif")
  );
}

async function createSignedPhotoUrl(admin: ReturnType<typeof createSupabaseAdmin>, path: string | null) {
  if (!path) return null;
  const { data, error } = await admin.storage
    .from(PROFILE_PHOTO_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function readCurrentPhotoPath(admin: ReturnType<typeof createSupabaseAdmin>, userId: string) {
  const { data, error } = await admin
    .from("user_ui_preferences")
    .select("profile_photo_path")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { path: null as string | null, error: error.message };
  return {
    path:
      typeof data?.profile_photo_path === "string" && data.profile_photo_path.trim()
        ? data.profile_photo_path.trim()
        : null,
    error: null as string | null,
  };
}

export async function GET(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = evaluateRateLimit({
    key: `account-profile-photo:get:ip:${ip}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id ?? null;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const actorLimit = evaluateRateLimit({
    key: `account-profile-photo:get:user:${userId}`,
    limit: 240,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const admin = createSupabaseAdmin();
  const { path, error } = await readCurrentPhotoPath(admin, userId);
  if (error) return NextResponse.json({ error }, { status: 500 });
  const url = await createSignedPhotoUrl(admin, path);
  return NextResponse.json({ url });
}

export async function POST(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = evaluateRateLimit({
    key: `account-profile-photo:post:ip:${ip}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id ?? null;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const actorLimit = evaluateRateLimit({
    key: `account-profile-photo:post:user:${userId}`,
    limit: 40,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!isAllowedImage(file)) {
    return NextResponse.json({ error: "Only PNG/JPG/WEBP/HEIC images are allowed." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Image exceeds 6MB limit." }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const current = await readCurrentPhotoPath(admin, userId);
  if (current.error) return NextResponse.json({ error: current.error }, { status: 500 });

  const safeName = sanitizeFilename(file.name);
  const storagePath = `${userId}/avatar-${Date.now()}-${safeName}`;

  const uploadRes = await admin.storage.from(PROFILE_PHOTO_BUCKET).upload(storagePath, file, {
    upsert: false,
    contentType: file.type || undefined,
    cacheControl: "3600",
  });
  if (uploadRes.error) {
    return NextResponse.json({ error: uploadRes.error.message }, { status: 500 });
  }

  const { error: prefsError } = await admin.from("user_ui_preferences").upsert(
    {
      user_id: userId,
      profile_photo_path: uploadRes.data.path,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (prefsError) {
    await admin.storage.from(PROFILE_PHOTO_BUCKET).remove([uploadRes.data.path]);
    return NextResponse.json({ error: prefsError.message }, { status: 500 });
  }

  if (current.path && current.path !== uploadRes.data.path) {
    await admin.storage.from(PROFILE_PHOTO_BUCKET).remove([current.path]);
  }

  const url = await createSignedPhotoUrl(admin, uploadRes.data.path);
  return NextResponse.json({ url });
}

export async function DELETE(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = evaluateRateLimit({
    key: `account-profile-photo:delete:ip:${ip}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id ?? null;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const actorLimit = evaluateRateLimit({
    key: `account-profile-photo:delete:user:${userId}`,
    limit: 40,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const admin = createSupabaseAdmin();
  const current = await readCurrentPhotoPath(admin, userId);
  if (current.error) return NextResponse.json({ error: current.error }, { status: 500 });

  const { error: prefsError } = await admin.from("user_ui_preferences").upsert(
    {
      user_id: userId,
      profile_photo_path: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (prefsError) return NextResponse.json({ error: prefsError.message }, { status: 500 });

  if (current.path) {
    await admin.storage.from(PROFILE_PHOTO_BUCKET).remove([current.path]);
  }

  return NextResponse.json({ ok: true });
}
