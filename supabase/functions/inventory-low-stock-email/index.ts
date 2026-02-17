// @ts-expect-error Edge runtime import (Deno)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (req: Request) => Promise<Response> | Response) => void;
};

type RecipientRow = {
  profile_id: string;
  profiles: {
    email: string | null;
    full_name: string | null;
  } | Array<{ email: string | null; full_name: string | null }> | null;
};

type LowItemRow = {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  minimum_quantity: number;
  location_id: string | null;
  inventory_locations: { name: string | null } | Array<{ name: string | null }> | null;
};

type StateRow = {
  item_id: string;
  is_low: boolean;
  first_low_at: string | null;
  last_threshold_email_at: string | null;
  last_daily_digest_local_date: string | null;
};

type Summary = {
  recipientsCount: number;
  lowCount: number;
  newlyLowCount: number;
  sentThreshold: boolean;
  sentDaily: boolean;
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const ALERT_FROM_EMAIL = Deno.env.get("ALERT_FROM_EMAIL") ?? "";
const PROJECT_URL = Deno.env.get("PROJECT_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? "";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asObject<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function chicagoLocalNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(map.hour ?? "0");
  const minute = Number(map.minute ?? "0");
  const localDate = `${map.year}-${map.month}-${map.day}`;

  return { hour, minute, localDate };
}

function buildItemsTable(items: LowItemRow[]): string {
  const rows = items
    .map((item) => {
      const location = asObject(item.inventory_locations)?.name ?? "-";
      return `<tr>
        <td style="padding:8px;border:1px solid #ddd">${escapeHtml(item.name)}</td>
        <td style="padding:8px;border:1px solid #ddd">${escapeHtml(item.category ?? "-")}</td>
        <td style="padding:8px;border:1px solid #ddd">${item.quantity}</td>
        <td style="padding:8px;border:1px solid #ddd">${item.minimum_quantity}</td>
        <td style="padding:8px;border:1px solid #ddd">${escapeHtml(location)}</td>
      </tr>`;
    })
    .join("\n");

  return `<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:14px">
    <thead>
      <tr>
        <th style="text-align:left;padding:8px;border:1px solid #ddd">Item</th>
        <th style="text-align:left;padding:8px;border:1px solid #ddd">Category</th>
        <th style="text-align:left;padding:8px;border:1px solid #ddd">Qty</th>
        <th style="text-align:left;padding:8px;border:1px solid #ddd">Min</th>
        <th style="text-align:left;padding:8px;border:1px solid #ddd">Location</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

async function sendEmail(params: {
  to: string[];
  subject: string;
  html: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ALERT_FROM_EMAIL,
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend error ${response.status}: ${body}`);
  }
}

Deno.serve(async () => {
  const summary: Summary = {
    recipientsCount: 0,
    lowCount: 0,
    newlyLowCount: 0,
    sentThreshold: false,
    sentDaily: false,
  };

  try {
    if (!RESEND_API_KEY || !ALERT_FROM_EMAIL || !PROJECT_URL || !SERVICE_ROLE_KEY) {
      return json({ error: "Missing required env vars for inventory-low-stock-email." }, 500);
    }

    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const recipientsRes = await supabase
      .from("inventory_alert_recipients")
      .select("profile_id,profiles!inner(email,full_name)")
      .eq("is_enabled", true);

    if (recipientsRes.error) {
      console.error("[inventory-low-stock-email] recipients query failed", recipientsRes.error);
      return json({ error: recipientsRes.error.message }, 500);
    }

    const recipients = new Set<string>();
    for (const row of (recipientsRes.data ?? []) as RecipientRow[]) {
      const profile = asObject(row.profiles);
      const email = profile?.email?.trim();
      if (email) recipients.add(email);
    }

    const recipientEmails = [...recipients];
    summary.recipientsCount = recipientEmails.length;

    const itemsRes = await supabase
      .from("inventory_items")
      .select("id,name,category,quantity,minimum_quantity,location_id,inventory_locations(name)")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (itemsRes.error) {
      console.error("[inventory-low-stock-email] items query failed", itemsRes.error);
      return json({ error: itemsRes.error.message }, 500);
    }

    const lowItems = ((itemsRes.data ?? []) as LowItemRow[]).filter(
      (item) => Number(item.quantity) <= Number(item.minimum_quantity),
    );
    summary.lowCount = lowItems.length;

    const stateRes = await supabase
      .from("inventory_low_stock_state")
      .select("item_id,is_low,first_low_at,last_threshold_email_at,last_daily_digest_local_date");

    if (stateRes.error) {
      console.error("[inventory-low-stock-email] state query failed", stateRes.error);
      return json({ error: stateRes.error.message }, 500);
    }

    const nowIso = new Date().toISOString();
    const stateByItem = new Map<string, StateRow>();
    for (const row of (stateRes.data ?? []) as StateRow[]) {
      stateByItem.set(row.item_id, row);
    }

    const lowIdSet = new Set(lowItems.map((item) => item.id));
    const newlyLow = lowItems.filter((item) => {
      const existing = stateByItem.get(item.id);
      return !existing || existing.is_low === false;
    });
    summary.newlyLowCount = newlyLow.length;

    const lowStateUpserts = lowItems.map((item) => {
      const existing = stateByItem.get(item.id);
      return {
        item_id: item.id,
        is_low: true,
        first_low_at: existing?.is_low ? existing.first_low_at : nowIso,
        updated_at: nowIso,
      };
    });

    if (lowStateUpserts.length > 0) {
      const { error } = await supabase
        .from("inventory_low_stock_state")
        .upsert(lowStateUpserts, { onConflict: "item_id" });
      if (error) {
        console.error("[inventory-low-stock-email] low-state upsert failed", error);
        return json({ error: error.message }, 500);
      }
    }

    const recoveredUpdates = [...stateByItem.values()]
      .filter((row) => row.is_low && !lowIdSet.has(row.item_id))
      .map((row) => ({
        item_id: row.item_id,
        is_low: false,
        first_low_at: null,
        updated_at: nowIso,
      }));

    if (recoveredUpdates.length > 0) {
      const { error } = await supabase
        .from("inventory_low_stock_state")
        .upsert(recoveredUpdates, { onConflict: "item_id" });
      if (error) {
        console.error("[inventory-low-stock-email] recovered-state upsert failed", error);
        return json({ error: error.message }, 500);
      }
    }

    if (summary.recipientsCount > 0 && newlyLow.length > 0) {
      const html = `<p style="font-family:Arial,sans-serif">New inventory items are now below minimum quantity:</p>${buildItemsTable(newlyLow)}`;
      await sendEmail({
        to: recipientEmails,
        subject: "Threshold: Inventory low-stock alert (new) — Outdoor Independence",
        html,
      });
      summary.sentThreshold = true;

      const thresholdUpdates = newlyLow.map((item) => ({
        item_id: item.id,
        last_threshold_email_at: nowIso,
        updated_at: nowIso,
      }));
      const { error } = await supabase
        .from("inventory_low_stock_state")
        .upsert(thresholdUpdates, { onConflict: "item_id" });
      if (error) {
        console.error("[inventory-low-stock-email] threshold timestamp upsert failed", error);
      }
    }

    const local = chicagoLocalNow();
    const isDigestWindow = local.hour === 9 && local.minute >= 0 && local.minute <= 15;

    if (summary.recipientsCount > 0 && summary.lowCount > 0 && isDigestWindow) {
      const shouldSendDigest = lowItems.some((item) => {
        const existing = stateByItem.get(item.id);
        return existing?.last_daily_digest_local_date !== local.localDate;
      });

      if (shouldSendDigest) {
        const html = `<p style="font-family:Arial,sans-serif">Daily low-stock inventory digest.</p>${buildItemsTable(lowItems)}`;
        await sendEmail({
          to: recipientEmails,
          subject: "Daily inventory low-stock digest — Outdoor Independence",
          html,
        });
        summary.sentDaily = true;

        const dailyUpdates = lowItems.map((item) => ({
          item_id: item.id,
          last_daily_digest_local_date: local.localDate,
          updated_at: nowIso,
        }));
        const { error } = await supabase
          .from("inventory_low_stock_state")
          .upsert(dailyUpdates, { onConflict: "item_id" });
        if (error) {
          console.error("[inventory-low-stock-email] daily digest timestamp upsert failed", error);
        }
      }
    }

    return json(summary);
  } catch (error) {
    console.error("[inventory-low-stock-email] unexpected error", error);
    return json(
      {
        ...summary,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});
