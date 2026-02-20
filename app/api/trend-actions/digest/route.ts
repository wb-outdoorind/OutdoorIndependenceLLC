import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfile } from "@/lib/supabase/server";

export const runtime = "nodejs";

type TrendActionRow = {
  id: string;
  asset_type: "vehicle" | "equipment";
  asset_id: string;
  action_type: "asset_health_decline" | "mechanic_decline";
  status: "Open" | "In Review" | "Resolved";
  created_at: string;
};

type DigestRecipient = {
  id: string;
  role: string | null;
  email: string | null;
  full_name: string | null;
};

function todayInChicagoParts() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    year: parts.year ?? "",
    month: parts.month ?? "",
    day: parts.day ?? "",
    hour: Number(parts.hour ?? "0"),
    minute: Number(parts.minute ?? "0"),
  };
}

function isAllowedNowForDigest() {
  const t = todayInChicagoParts();
  // Hobby plan allows one daily cron in UTC; 21:00 UTC maps to 15:00 CST / 16:00 CDT.
  return (t.hour === 15 || t.hour === 16) && t.minute === 0;
}

function chicagoDateKey() {
  const t = todayInChicagoParts();
  return `${t.year}-${t.month}-${t.day}`;
}

function buildDigestEmailHtml(params: {
  title: string;
  body: string;
  appUrl: string;
}) {
  return [
    `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;">`,
    `<h2 style="margin:0 0 12px 0;">${params.title}</h2>`,
    `<p style="margin:0 0 16px 0;">${params.body}</p>`,
    `<p style="margin:0 0 16px 0;">Open the app to review trend actions and assign follow-ups.</p>`,
    `<a href="${params.appUrl}" style="display:inline-block;padding:10px 14px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;">Open Operations App</a>`,
    `</div>`,
  ].join("");
}

async function sendDigestEmail(params: {
  resendApiKey: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  html: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.fromEmail,
      to: [params.toEmail],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend ${response.status}: ${text}`);
  }
}

async function runDigest(params: { source: "cron" | "manual"; ignoreTimeGate: boolean }) {
  if (!params.ignoreTimeGate && !isAllowedNowForDigest()) {
    return { ok: true, skipped: "Not 3:00 PM America/Chicago." } as const;
  }

  const admin = createSupabaseAdmin();
  const dateKey = chicagoDateKey();

  const [{ data: recipients, error: recipientsError }, { data: actions, error: actionsError }] = await Promise.all([
    admin
      .from("profiles")
      .select("id,role,email,full_name")
      .in("role", ["owner", "mechanic"]),
    admin
      .from("trend_actions")
      .select("id,asset_type,asset_id,action_type,status,created_at")
      .in("status", ["Open", "In Review"])
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (recipientsError || actionsError) throw new Error(recipientsError?.message || actionsError?.message || "Failed to load digest data.");

  const rows = ((actions ?? []) as TrendActionRow[]);
  const openCount = rows.filter((r) => r.status === "Open").length;
  const inReviewCount = rows.filter((r) => r.status === "In Review").length;
  const byAsset = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.asset_type}:${row.asset_id}`;
    byAsset.set(key, (byAsset.get(key) ?? 0) + 1);
  }
  const topAssets = Array.from(byAsset.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, count]) => `${k} (${count})`);

  const title = `Trend Actions Digest (${dateKey})`;
  const body = [
    `Open: ${openCount}`,
    `In Review: ${inReviewCount}`,
    topAssets.length ? `Top assets: ${topAssets.join(", ")}` : "Top assets: none",
  ].join(" · ");

  const recipientRows = (recipients ?? []) as DigestRecipient[];
  const inserts = recipientRows.map((r) => ({
    recipient_id: r.id,
    title,
    body,
    severity: openCount > 5 ? "high" : "info",
    kind: "trend_actions_digest",
    entity_type: "trend_actions",
    entity_id: dateKey,
    dedupe_key: `trend-digest:${dateKey}`,
    is_read: false,
  }));

  if (inserts.length > 0) {
    const { error: insertError } = await admin
      .from("user_notifications")
      .upsert(inserts, { onConflict: "recipient_id,dedupe_key", ignoreDuplicates: true });
    if (insertError) throw new Error(insertError.message);
  }

  const prefsByUser = new Map<string, boolean>();
  if (recipientRows.length > 0) {
    const { data: prefsRows } = await admin
      .from("user_notification_prefs")
      .select("user_id,email_enabled")
      .in(
        "user_id",
        recipientRows.map((r) => r.id)
      );
    for (const row of (prefsRows ?? []) as Array<{ user_id: string; email_enabled: boolean | null }>) {
      prefsByUser.set(row.user_id, row.email_enabled !== false);
    }
  }

  const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";
  const fromEmail =
    process.env.TREND_DIGEST_FROM_EMAIL?.trim() ||
    process.env.ALERT_FROM_EMAIL?.trim() ||
    "onboarding@resend.dev";
  const appUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "https://outdoor-independence-llc-app.vercel.app";
  const emailSubject = title;
  const emailHtml = buildDigestEmailHtml({ title, body, appUrl });

  let emailAttempted = 0;
  let emailSent = 0;
  let emailFailed = 0;
  if (resendApiKey) {
    const emailRecipients = recipientRows.filter((r) => {
      const em = (r.email || "").trim();
      if (!em) return false;
      return prefsByUser.get(r.id) !== false;
    });
    emailAttempted = emailRecipients.length;
    const emailResults = await Promise.allSettled(
      emailRecipients.map((r) =>
        sendDigestEmail({
          resendApiKey,
          fromEmail,
          toEmail: (r.email || "").trim(),
          subject: emailSubject,
          html: emailHtml,
        })
      )
    );
    for (const result of emailResults) {
      if (result.status === "fulfilled") emailSent += 1;
      else emailFailed += 1;
    }
  }

  return {
    ok: true,
    source: params.source,
    sentTo: inserts.length,
    openCount,
    inReviewCount,
    topAssets,
    dateKey,
    email: {
      configured: Boolean(resendApiKey),
      from: fromEmail,
      attempted: emailAttempted,
      sent: emailSent,
      failed: emailFailed,
    },
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

  if (!isAllowedNowForDigest()) {
    return NextResponse.json({ ok: true, skipped: "Not 3:00 PM America/Chicago." });
  }

  try {
    const payload = await runDigest({ source: "cron", ignoreTimeGate: false });
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run digest.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  const session = await getCurrentUserProfile();
  const role = session?.profile?.role ?? null;
  if (role !== "owner") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  try {
    const payload = await runDigest({ source: "manual", ignoreTimeGate: true });
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run digest.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
