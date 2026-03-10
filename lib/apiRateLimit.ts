import { NextResponse } from "next/server";

type BucketEntry = {
  count: number;
  resetAt: number;
};

type RateLimitDecision = {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type GlobalWithBucket = typeof globalThis & {
  __oiRateLimitBuckets?: Map<string, BucketEntry>;
  __oiRateLimitStoreWarned?: boolean;
};

function getBucketStore() {
  const g = globalThis as GlobalWithBucket;
  if (!g.__oiRateLimitBuckets) g.__oiRateLimitBuckets = new Map<string, BucketEntry>();
  return g.__oiRateLimitBuckets;
}

function cleanupExpired(now: number, store: Map<string, BucketEntry>) {
  for (const [key, value] of store.entries()) {
    if (value.resetAt <= now) store.delete(key);
  }
}

export function readClientIp(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for") ?? "";
  const first = forwardedFor.split(",")[0]?.trim();
  if (first) return first;
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

function buildDecision(options: RateLimitOptions, count: number, retryAfterSeconds: number): RateLimitDecision {
  return {
    ok: count <= options.limit,
    limit: options.limit,
    remaining: Math.max(0, options.limit - count),
    retryAfterSeconds: Math.max(1, retryAfterSeconds),
  };
}

function getUpstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

async function evaluateRateLimitDurable(options: RateLimitOptions): Promise<RateLimitDecision | null> {
  const cfg = getUpstashConfig();
  if (!cfg) return null;

  const key = `oi:rl:${options.key}`;
  const response = await fetch(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", key],
      ["PEXPIRE", key, String(options.windowMs), "NX"],
      ["PTTL", key],
    ]),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Upstash rate limit failed (${response.status}): ${errorText.slice(0, 220)}`);
  }

  const json = (await response.json()) as {
    result?: Array<{ result?: unknown }>;
  };

  const countRaw = json.result?.[0]?.result;
  const ttlRaw = json.result?.[2]?.result;
  const count = Number(countRaw);
  const ttlMs = Number(ttlRaw);
  const retryAfterSeconds = Math.ceil(
    (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : options.windowMs) / 1000
  );

  if (!Number.isFinite(count) || count <= 0) {
    return buildDecision(options, 1, Math.ceil(options.windowMs / 1000));
  }
  return buildDecision(options, count, retryAfterSeconds);
}

export async function evaluateRateLimit(options: RateLimitOptions): Promise<RateLimitDecision> {
  try {
    const durable = await evaluateRateLimitDurable(options);
    if (durable) return durable;
  } catch (error) {
    const g = globalThis as GlobalWithBucket;
    if (!g.__oiRateLimitStoreWarned) {
      g.__oiRateLimitStoreWarned = true;
      console.error("Rate limiter durable backend unavailable, using in-memory fallback.", error);
    }
  }

  const now = Date.now();
  const store = getBucketStore();
  cleanupExpired(now, store);

  const existing = store.get(options.key);
  if (!existing || existing.resetAt <= now) {
    store.set(options.key, { count: 1, resetAt: now + options.windowMs });
    return buildDecision(options, 1, Math.ceil(options.windowMs / 1000));
  }

  existing.count += 1;
  store.set(options.key, existing);

  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return buildDecision(options, existing.count, retryAfterSeconds);
}

export function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": String(decision.remaining),
    "Retry-After": String(decision.retryAfterSeconds),
  };
}

export function rateLimitExceededResponse(decision: RateLimitDecision) {
  return NextResponse.json(
    {
      error: "Too many requests. Please try again shortly.",
      retryAfterSeconds: decision.retryAfterSeconds,
    },
    {
      status: 429,
      headers: rateLimitHeaders(decision),
    }
  );
}
