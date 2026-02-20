import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type TrendActionRow = {
  id: string;
  asset_type: "vehicle" | "equipment";
  asset_id: string;
  action_type: "asset_health_decline" | "mechanic_decline";
  status: "Open" | "In Review" | "Resolved";
  created_at: string;
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

  const admin = createSupabaseAdmin();
  const dateKey = chicagoDateKey();

  const [{ data: recipients, error: recipientsError }, { data: actions, error: actionsError }] = await Promise.all([
    admin
      .from("profiles")
      .select("id,role")
      .in("role", ["owner", "mechanic"]),
    admin
      .from("trend_actions")
      .select("id,asset_type,asset_id,action_type,status,created_at")
      .in("status", ["Open", "In Review"])
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (recipientsError || actionsError) {
    return NextResponse.json(
      { error: recipientsError?.message || actionsError?.message || "Failed to load digest data." },
      { status: 500 }
    );
  }

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

  const recipientRows = (recipients ?? []) as Array<{ id: string; role: string | null }>;
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
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    sentTo: inserts.length,
    openCount,
    inReviewCount,
    topAssets,
    dateKey,
  });
}
