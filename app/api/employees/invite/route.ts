import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfile } from "@/lib/supabase/server";

export const runtime = "nodejs"; // ✅ ensure admin SDK runs in Node, not edge
const TEMP_PASSWORD = "Outdoor2026!";
const ALLOWED_ROLES = new Set([
  "owner",
  "operations_manager",
  "office_admin",
  "mechanic",
  "team_member_1",
  "team_member_2",
  "employee",
]);
const ALLOWED_DEPARTMENTS = new Set([
  "Mowing",
  "Administration",
  "Landscaping",
  "Fertilizing",
  "Maintenance",
]);

export async function POST(req: Request) {
  try {
    // ✅ hard checks so we don't crash silently
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL" }, { status: 500 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }

    const session = await getCurrentUserProfile();
    const requesterRole = session?.profile?.role ?? "employee";

    if (
      requesterRole !== "owner" &&
      requesterRole !== "operations_manager" &&
      requesterRole !== "office_admin"
    ) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await req.json();

    const email = String(body.email || "").trim().toLowerCase();
    const full_name = String(body.full_name || "").trim();
    const role = String(body.role || "").trim();
    const phone = String(body.phone || "").trim();
    const department = String(body.department || "").trim();

    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (!full_name) return NextResponse.json({ error: "Full name is required" }, { status: 400 });
    if (!role) return NextResponse.json({ error: "Role is required" }, { status: 400 });
    if (!phone) return NextResponse.json({ error: "Phone is required" }, { status: 400 });
    if (!department) return NextResponse.json({ error: "Department is required" }, { status: 400 });
    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (!ALLOWED_DEPARTMENTS.has(department)) {
      return NextResponse.json({ error: "Invalid department" }, { status: 400 });
    }

    // extra safety
    if (
      requesterRole === "office_admin" &&
      (role === "owner" || role === "operations_manager")
    ) {
      return NextResponse.json(
        { error: "Only owner or operations manager can invite owner-level roles" },
        { status: 403 }
      );
    }

    const admin = createSupabaseAdmin();

    let userId: string | null = null;

    const { data: createdUserData, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password: TEMP_PASSWORD,
        email_confirm: true,
      });

    if (createErr) {
      const createMessage = createErr.message.toLowerCase();
      const alreadyExists =
        createMessage.includes("already been registered") ||
        createMessage.includes("already registered") ||
        createMessage.includes("already exists");

      if (!alreadyExists) {
        return NextResponse.json({ error: createErr.message }, { status: 400 });
      }

      const { data: usersData, error: usersErr } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (usersErr) {
        return NextResponse.json({ error: usersErr.message }, { status: 500 });
      }

      const existingUser = usersData.users.find(
        (u) => (u.email || "").toLowerCase() === email
      );
      if (!existingUser?.id) {
        return NextResponse.json(
          { error: "Existing auth user not found for this email." },
          { status: 500 }
        );
      }

      userId = existingUser.id;
      const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
        password: TEMP_PASSWORD,
        email_confirm: true,
      });
      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
    } else {
      userId = createdUserData.user?.id ?? null;
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Failed to create or find auth user id" },
        { status: 500 }
      );
    }

    const { error: upsertErr } = await admin
      .from("profiles")
      .upsert(
        {
          id: userId,
          email,
          full_name,
          role,
          status: "Active",
          phone,
          department,
          must_change_password: true,
        },
        { onConflict: "id" }
      );

    if (upsertErr) {
      return NextResponse.json(
        { error: `Invited user, but failed to upsert profile: ${upsertErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, userId, temporaryPassword: TEMP_PASSWORD });
  } catch (err: unknown) {
    console.error("Invite route crashed:", err);
    const message = err instanceof Error ? err.message : "Invite route crashed (unknown error)";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
