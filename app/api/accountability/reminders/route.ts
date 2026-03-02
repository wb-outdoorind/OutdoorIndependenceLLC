import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";

export const runtime = "nodejs";

type OccurrenceRow = {
  id: number;
  category: "attendance" | "quality" | "safety" | "procedural";
  occurrence_type: string;
  step_of_program: "Step 1" | "Step 2" | "Step 3" | "Step 4";
  falloff_date: string;
  teammate_id: string;
  manager_id: string;
  created_by: string;
};

function formatCategory(label: string) {
  return label.slice(0, 1).toUpperCase() + label.slice(1);
}

function dateKeyForToday() {
  return new Date().toISOString().slice(0, 10);
}

async function maybeSendReminderEmails(params: {
  admin: ReturnType<typeof createSupabaseAdmin>;
  rows: Array<{ recipientId: string; title: string; body: string }>;
}) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";
  if (!resendApiKey) return { attempted: 0, sent: 0, failed: 0, configured: false };

  const recipientIds = Array.from(new Set(params.rows.map((row) => row.recipientId)));
  if (!recipientIds.length) return { attempted: 0, sent: 0, failed: 0, configured: true };

  const [{ data: profiles }, { data: prefs }] = await Promise.all([
    params.admin
      .from("profiles")
      .select("id,email")
      .in("id", recipientIds),
    params.admin
      .from("user_notification_prefs")
      .select("user_id,email_enabled")
      .in("user_id", recipientIds),
  ]);

  const emailByUser = new Map<string, string>();
  for (const row of (profiles ?? []) as Array<{ id: string; email: string | null }>) {
    const email = (row.email ?? "").trim();
    if (email) emailByUser.set(row.id, email);
  }
  const emailEnabledByUser = new Map<string, boolean>();
  for (const row of (prefs ?? []) as Array<{ user_id: string; email_enabled: boolean | null }>) {
    emailEnabledByUser.set(row.user_id, row.email_enabled !== false);
  }

  const fromEmail =
    process.env.ALERT_FROM_EMAIL?.trim() ||
    process.env.TREND_DIGEST_FROM_EMAIL?.trim() ||
    "onboarding@resend.dev";
  const appUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "https://outdoor-independence-llc-app.vercel.app";

  const emailRows = params.rows.filter((row) => {
    if (!emailByUser.has(row.recipientId)) return false;
    return emailEnabledByUser.get(row.recipientId) !== false;
  });
  if (!emailRows.length) return { attempted: 0, sent: 0, failed: 0, configured: true };

  const results = await Promise.allSettled(
    emailRows.map(async (row) => {
      const recipientEmail = emailByUser.get(row.recipientId) as string;
      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;">
          <h2 style="margin:0 0 12px 0;">${row.title}</h2>
          <p style="margin:0 0 12px 0;">${row.body}</p>
          <p style="margin:0 0 16px 0;">Open the app to review or update this accountability item.</p>
          <a href="${appUrl}/form-reports" style="display:inline-block;padding:10px 14px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;">Open Accountability Center</a>
        </div>
      `;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [recipientEmail],
          subject: row.title,
          html,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Resend ${response.status}: ${text}`);
      }
    })
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;
  return { attempted: results.length, sent, failed, configured: true };
}

async function runReminderScan() {
  const admin = createSupabaseAdmin();
  const today = dateKeyForToday();
  const sevenDays = new Date();
  sevenDays.setDate(sevenDays.getDate() + 7);
  const sevenDaysKey = sevenDays.toISOString().slice(0, 10);

  const { data, error } = await admin
    .from("accountability_occurrences")
    .select("id,category,occurrence_type,step_of_program,falloff_date,teammate_id,manager_id,created_by")
    .eq("status", "Active")
    .gte("falloff_date", today)
    .lte("falloff_date", sevenDaysKey)
    .order("falloff_date", { ascending: true })
    .limit(500);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as OccurrenceRow[];

  const notificationRows: Array<{
    recipient_id: string;
    title: string;
    body: string;
    severity: "info" | "warning" | "high" | "critical";
    kind: string;
    entity_type: string;
    entity_id: string;
    dedupe_key: string;
  }> = [];
  const emailRows: Array<{ recipientId: string; title: string; body: string }> = [];

  for (const row of rows) {
    const dedupeSuffix = `${row.id}:${row.falloff_date}`;
    const title = `Accountability fall-off reminder (${row.falloff_date})`;
    const body = `${formatCategory(row.category)} · ${row.occurrence_type} · ${row.step_of_program} falls off on ${row.falloff_date}.`;
    const recipients = Array.from(new Set([row.teammate_id, row.manager_id, row.created_by]));
    for (const recipientId of recipients) {
      notificationRows.push({
        recipient_id: recipientId,
        title,
        body,
        severity: "warning",
        kind: "accountability_falloff_reminder",
        entity_type: "accountability_occurrence",
        entity_id: String(row.id),
        dedupe_key: `accountability-falloff:${dedupeSuffix}`,
      });
      emailRows.push({ recipientId, title, body });
    }
  }

  if (notificationRows.length) {
    const { error: upsertError } = await admin
      .from("user_notifications")
      .upsert(notificationRows, { onConflict: "recipient_id,dedupe_key" });
    if (upsertError) throw new Error(upsertError.message);
  }

  const emailResult = await maybeSendReminderEmails({ admin, rows: emailRows });
  return {
    ok: true,
    reminders: rows.length,
    notificationsCreated: notificationRows.length,
    email: emailResult,
  };
}

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const payload = await runReminderScan();
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run reminder scan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  const session = await getCurrentUserProfileStrict();
  const role = session?.profile?.role ?? null;
  if (
    role !== "owner" &&
    role !== "operations_manager" &&
    role !== "office_admin" &&
    role !== "mechanic"
  ) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  try {
    const payload = await runReminderScan();
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run reminder scan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
