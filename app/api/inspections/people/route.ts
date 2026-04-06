import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { normalizeRole, type AppRole } from "@/lib/roleView";

export const runtime = "nodejs";

type ProfileRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  middle_initial: string | null;
  last_name: string | null;
  nickname: string | null;
  email: string | null;
  department: string | null;
  role: string | null;
  status: string | null;
};

type PersonOption = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  middle_initial: string | null;
  last_name: string | null;
  nickname: string | null;
  email: string | null;
  department: string | null;
  role: AppRole | null;
};

const LEAD_ROLES = new Set<AppRole>([
  "owner",
  "operations_manager",
  "sales_manager",
  "office_admin",
  "mechanic",
  "team_lead_1",
  "team_lead_2",
]);

const CREW_ELIGIBLE_ROLES = new Set<AppRole>([
  "employee",
  "apprentice",
  "team_member_1",
  "team_member_2",
  "team_lead_1",
  "team_lead_2",
  "mechanic",
]);

const ACTIVE_STATUSES = new Set(["active", "invited"]);

function normalizeStatus(value: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function asName(value: string | null) {
  return (value ?? "").trim();
}

function displayName(row: {
  full_name: string | null;
  first_name: string | null;
  middle_initial: string | null;
  last_name: string | null;
  nickname: string | null;
  email: string | null;
  id: string;
}) {
  const nickname = asName(row.nickname);
  const first = asName(row.first_name);
  const middle = asName(row.middle_initial);
  const last = asName(row.last_name);
  if (nickname && last) return `${nickname} ${last}`;
  if (nickname) return nickname;
  const fromParts = [first, middle, last].filter(Boolean).join(" ").trim();
  if (fromParts) return fromParts;
  const full = asName(row.full_name);
  if (full) return full;
  const email = asName(row.email);
  if (email) return email.split("@")[0] || email;
  return row.id;
}

export async function GET() {
  const session = await getCurrentUserProfileStrict();
  const user = session?.user ?? null;
  const profile = session?.profile ?? null;
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const actorRole = normalizeRole(typeof profile?.role === "string" ? profile.role : null) ?? "employee";
  const actorDisplayName = displayName({
    id: user.id,
    full_name: typeof profile?.full_name === "string" ? profile.full_name : null,
    first_name: typeof profile?.first_name === "string" ? profile.first_name : null,
    middle_initial: typeof profile?.middle_initial === "string" ? profile.middle_initial : null,
    last_name: typeof profile?.last_name === "string" ? profile.last_name : null,
    nickname: typeof profile?.nickname === "string" ? profile.nickname : null,
    email: typeof profile?.email === "string" ? profile.email : user.email ?? null,
  });

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .select("id,full_name,first_name,middle_initial,last_name,nickname,email,department,role,status")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = ((data ?? []) as ProfileRow[])
    .filter((row) => ACTIVE_STATUSES.has(normalizeStatus(row.status)))
    .map((row): PersonOption => ({
      id: row.id,
      full_name: row.full_name,
      first_name: row.first_name,
      middle_initial: row.middle_initial,
      last_name: row.last_name,
      nickname: row.nickname,
      email: row.email,
      department: row.department,
      role: normalizeRole(row.role),
    }));

  const crewOptions = rows.filter((row) => row.role && CREW_ELIGIBLE_ROLES.has(row.role));
  const leadOptions = rows.filter((row) => row.role && LEAD_ROLES.has(row.role));

  return NextResponse.json({
    actor: {
      id: user.id,
      role: actorRole,
      displayName: actorDisplayName,
    },
    crewOptions,
    leadOptions,
  });
}
