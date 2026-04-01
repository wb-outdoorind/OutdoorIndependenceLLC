import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";
import { writeServerAudit } from "@/lib/auditServer";
import { generateTemporaryPassword, sendTeammateInviteEmail } from "@/lib/teammateInvites";

export const runtime = "nodejs"; // ✅ ensure admin SDK runs in Node, not edge
const ALLOWED_ROLES = new Set([
  "owner",
  "operations_manager",
  "sales_manager",
  "office_admin",
  "mechanic",
  "teammate",
  "apprentice",
  "team_lead_1",
  "team_lead_2",
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
  "Sales",
]);

function parseNamePartsFromFullName(fullName: string) {
  const normalized = fullName.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { first_name: "", middle_initial: "", last_name: "" };
  }
  const parts = normalized.split(" ").filter(Boolean);
  const first_name = parts[0] ?? "";
  const middle_initial = parts.length >= 3 ? (parts[1] ?? "").slice(0, 1).toUpperCase() : "";
  const last_name = parts.length >= 2 ? parts[parts.length - 1] ?? "" : "";
  return { first_name, middle_initial, last_name };
}

export async function POST(req: Request) {
  try {
    const ip = readClientIp(req);
    const routeLimit = await evaluateRateLimit({
      key: `invite:ip:${ip}`,
      limit: 10,
      windowMs: 60_000,
    });
    if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

    // ✅ hard checks so we don't crash silently
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL" }, { status: 500 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }

    const session = await getCurrentUserProfileStrict();
    const requesterId = session?.user?.id ?? "anonymous";
    const actorLimit = await evaluateRateLimit({
      key: `invite:user:${requesterId}`,
      limit: 20,
      windowMs: 60_000,
    });
    if (!actorLimit.ok) return rateLimitExceededResponse(actorLimit);
    const requesterRole = session?.profile?.role ?? "employee";

    if (
      requesterRole !== "owner" &&
      requesterRole !== "operations_manager" &&
      requesterRole !== "sales_manager" &&
      requesterRole !== "office_admin"
    ) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await req.json();

    const email = String(body.email || "").trim().toLowerCase();
    const legacyFullName = String(body.full_name || "").trim();
    let first_name = String(body.first_name || "").trim();
    let middle_initial = String(body.middle_initial || "").trim();
    let last_name = String(body.last_name || "").trim();
    const parsedName = parseNamePartsFromFullName(legacyFullName);
    if (!first_name) first_name = parsedName.first_name;
    if (!middle_initial) middle_initial = parsedName.middle_initial;
    if (!last_name) last_name = parsedName.last_name;
    middle_initial = middle_initial ? middle_initial.slice(0, 1).toUpperCase() : "";
    let nickname = String(body.nickname || "").trim();
    if (!nickname) nickname = first_name;
    const full_name = [first_name, middle_initial || null, last_name].filter(Boolean).join(" ");
    const rawRole = String(body.role || "").trim();
    const role = rawRole === "teammate" ? "team_member_1" : rawRole;
    const phone = String(body.phone || "").trim();
    const department = String(body.department || "").trim();

    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (!first_name) return NextResponse.json({ error: "First name is required" }, { status: 400 });
    if (!last_name) return NextResponse.json({ error: "Last name is required" }, { status: 400 });
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
      (requesterRole === "office_admin" || requesterRole === "sales_manager") &&
      (role === "owner" || role === "operations_manager")
    ) {
      return NextResponse.json(
        { error: "Only owner or operations manager can invite owner-level roles" },
        { status: 403 }
      );
    }

    const admin = createSupabaseAdmin();
    const temporaryPassword = generateTemporaryPassword(16);

    let userId: string | null = null;

    const { data: createdUserData, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
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
        password: temporaryPassword,
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
          first_name,
          middle_initial: middle_initial || null,
          last_name,
          nickname,
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

    await writeServerAudit(admin, {
      actorId: session?.user?.id ?? null,
      actorRole: requesterRole,
      action: "invite_teammate",
      tableName: "profiles",
      recordId: userId,
      eventType: "teammate_invited",
      entityType: "profile",
      entityId: userId,
      afterData: {
        role,
        department,
        email,
        full_name,
        first_name,
        middle_initial: middle_initial || null,
        last_name,
        nickname,
      },
      meta: { requesterRole },
    });

    const inviteEmail = await sendTeammateInviteEmail({
      toEmail: email,
      temporaryPassword,
      teammateName: full_name,
      invitedByName:
        session?.profile?.full_name?.trim() ||
        session?.profile?.email?.trim() ||
        session?.user?.email?.trim() ||
        null,
    });

    return NextResponse.json({
      ok: true,
      userId,
      temporaryPassword,
      inviteEmailSent: inviteEmail.sent,
      inviteEmailConfigured: inviteEmail.configured,
      inviteEmailError: inviteEmail.error,
    });
  } catch (err: unknown) {
    console.error("Invite route crashed:", err);
    const message = err instanceof Error ? err.message : "Invite route crashed (unknown error)";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
