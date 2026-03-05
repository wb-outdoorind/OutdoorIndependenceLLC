import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { canAccessCopilot } from "@/lib/copilotAccess";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PromptBody = {
  prompt?: unknown;
  context?: unknown;
};

type ContextRow = {
  event_type: string;
  route: string | null;
  page_title: string | null;
  asset_type: string | null;
  asset_id: string | null;
  form_type: string | null;
  payload: unknown;
  prompt: string | null;
  response: string | null;
  created_at: string;
};

function normalizeText(value: unknown, maxLen = 256) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function normalizePrompt(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.slice(0, 5_000);
}

function toPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    const json = JSON.stringify(value);
    if (json.length <= 10_000) return value;
    return { summary: "payload_truncated", size: json.length };
  } catch {
    return { summary: "payload_unserializable" };
  }
}

function toRecentContextSummary(rows: ContextRow[]) {
  const compact = rows.slice(0, 12).map((row) => ({
    type: row.event_type,
    route: row.route,
    pageTitle: row.page_title,
    assetType: row.asset_type,
    assetId: row.asset_id,
    formType: row.form_type,
    createdAt: row.created_at,
    prompt: row.prompt ? row.prompt.slice(0, 220) : null,
    response: row.response ? row.response.slice(0, 280) : null,
    payload: row.payload,
  }));
  return JSON.stringify(compact, null, 2);
}

function fallbackResponse(prompt: string, rows: ContextRow[]) {
  const latest = rows[0];
  const route = latest?.route ?? "unknown route";
  const asset = latest?.asset_id ? `${latest.asset_type ?? "asset"} ${latest.asset_id}` : "no asset selected";
  return [
    "Copilot context captured successfully.",
    `Current location: ${route}.`,
    `Current asset context: ${asset}.`,
    "OpenAI API is not configured on the server yet, so this is a fallback response.",
    `Prompt received: "${prompt.slice(0, 240)}"`,
  ].join(" ");
}

async function askOpenAI(params: {
  prompt: string;
  contextJson: string;
}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are the Outdoor Independence in-app edit copilot. Be concise, practical, and specific to the provided app context.",
        },
        {
          role: "user",
          content: [
            `Prompt:\n${params.prompt}`,
            "\nRecent shared app context timeline (newest first):",
            params.contextJson,
          ].join("\n"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const txt = await response.text().catch(() => "");
    throw new Error(`OpenAI request failed (${response.status}): ${txt.slice(0, 300)}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = json.choices?.[0]?.message?.content?.trim() || "";
  return content || null;
}

export async function POST(req: Request) {
  const ip = readClientIp(req);
  const routeLimit = evaluateRateLimit({
    key: `copilot-prompt:ip:${ip}`,
    limit: 24,
    windowMs: 60_000,
  });
  if (!routeLimit.ok) return rateLimitExceededResponse(routeLimit);

  const session = await getCurrentUserProfileStrict();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const userId = session.user.id;

  const allowed = canAccessCopilot({
    role: session.profile?.role ?? session.effectiveRole ?? null,
    profile: session.profile,
    user: session.user,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Not authorized for copilot" }, { status: 403 });
  }

  const userLimit = evaluateRateLimit({
    key: `copilot-prompt:user:${userId}`,
    limit: 24,
    windowMs: 60_000,
  });
  if (!userLimit.ok) return rateLimitExceededResponse(userLimit);

  const body = (await req.json().catch(() => ({}))) as PromptBody;
  const prompt = normalizePrompt(body.prompt);
  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  let contextEventId: number | null = null;
  if (body.context && typeof body.context === "object") {
    const contextObj = body.context as Record<string, unknown>;
    const { data: contextInsert, error: contextError } = await admin
      .from("copilot_context_events")
      .insert({
        user_id: userId,
        event_type: "context",
        route: normalizeText(contextObj.route, 512),
        page_title: normalizeText(contextObj.pageTitle, 180),
        asset_type: normalizeText(contextObj.assetType, 80),
        asset_id: normalizeText(contextObj.assetId, 180),
        form_type: normalizeText(contextObj.formType, 120),
        payload: toPayload(contextObj.payload),
      })
      .select("id")
      .single();
    if (!contextError) contextEventId = Number(contextInsert.id);
  }

  const { data: promptInsert, error: promptInsertError } = await admin
    .from("copilot_context_events")
    .insert({
      user_id: userId,
      event_type: "prompt",
      prompt,
      payload: {
        contextEventId,
      },
    })
    .select("id")
    .single();

  if (promptInsertError) {
    return NextResponse.json({ error: promptInsertError.message }, { status: 500 });
  }

  const { data: recentRows, error: recentError } = await admin
    .from("copilot_context_events")
    .select("event_type,route,page_title,asset_type,asset_id,form_type,payload,prompt,response,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(24);

  if (recentError) {
    return NextResponse.json({ error: recentError.message }, { status: 500 });
  }

  const recent = (recentRows ?? []) as ContextRow[];
  const contextJson = toRecentContextSummary(recent);

  let responseText: string | null = null;
  let model: string = "fallback";
  let modelError: string | null = null;

  try {
    const aiResponse = await askOpenAI({ prompt, contextJson });
    if (aiResponse) {
      responseText = aiResponse;
      model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    }
  } catch (error) {
    modelError = error instanceof Error ? error.message : "Unexpected AI error";
  }

  if (!responseText) {
    responseText = fallbackResponse(prompt, recent);
  }

  const { error: responseInsertError } = await admin.from("copilot_context_events").insert({
    user_id: userId,
    event_type: "response",
    response: responseText,
    payload: {
      promptEventId: Number(promptInsert.id),
      model,
      modelError,
    },
  });

  if (responseInsertError) {
    return NextResponse.json({ error: responseInsertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    response: responseText,
    model,
    modelError,
    sharedContextEventsUsed: recent.length,
  });
}
