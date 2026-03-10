import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  evaluateRateLimit,
  rateLimitExceededResponse,
  readClientIp,
} from "@/lib/apiRateLimit";
import { normalizeRole } from "@/lib/roleView";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PROFILE_PHOTO_BUCKET = "profile_photos";
const PRIVILEGED_ROLES = new Set(["owner", "operations_manager", "office_admin", "mechanic"]);

function parseIds(input: unknown) {
  if (!Array.isArray(input)) return [] as string[];
  return input
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .slice(0, 400);
}

type PreferenceRow = {
  user_id: string;
  profile_photo_path: string | null;
};

type ScopedProfileRow = {
  id: string;
  department: string | null;
  status: string | null;
};

function normalizeDepartment(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export async function POST(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = await evaluateRateLimit({
    key: `employees-avatar-urls:post:ip:${ip}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id ?? null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requesterRole = normalizeRole(session?.profile?.role ?? null) ?? "employee";
  const requesterDepartment = normalizeDepartment(
    typeof session?.profile?.department === "string" ? session.profile.department : null
  );

  const actorLimit = await evaluateRateLimit({
    key: `employees-avatar-urls:post:user:${userId}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = parseIds(body.ids);
  if (!ids.length) return NextResponse.json({ urls: {} });

  const admin = createSupabaseAdmin();
  const { data: scopeRows, error: scopeError } = await admin
    .from("profiles")
    .select("id,department,status")
    .in("id", ids);
  if (scopeError) return NextResponse.json({ error: scopeError.message }, { status: 500 });

  const canViewAll = PRIVILEGED_ROLES.has(requesterRole);
  const scopedIds = ((scopeRows ?? []) as ScopedProfileRow[])
    .filter((row) => {
      if (row.id === userId) return true;
      if (canViewAll) return true;
      if ((row.status ?? "").trim().toLowerCase() !== "active") return false;
      return Boolean(requesterDepartment) && normalizeDepartment(row.department) === requesterDepartment;
    })
    .map((row) => row.id);

  if (!scopedIds.length) return NextResponse.json({ urls: {} });

  const { data, error } = await admin
    .from("user_ui_preferences")
    .select("user_id,profile_photo_path")
    .in("user_id", scopedIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const urls: Record<string, string> = {};
  await Promise.all(
    ((data ?? []) as PreferenceRow[]).map(async (row) => {
      const path = (row.profile_photo_path ?? "").trim();
      if (!path) return;
      const signed = await admin.storage
        .from(PROFILE_PHOTO_BUCKET)
        .createSignedUrl(path, 60 * 60);
      if (signed.error || !signed.data?.signedUrl) return;
      urls[row.user_id] = signed.data.signedUrl;
    })
  );

  return NextResponse.json({ urls });
}
