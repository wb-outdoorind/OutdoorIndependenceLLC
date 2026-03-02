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

export function evaluateRateLimit(options: RateLimitOptions): RateLimitDecision {
  const now = Date.now();
  const store = getBucketStore();
  cleanupExpired(now, store);

  const existing = store.get(options.key);
  if (!existing || existing.resetAt <= now) {
    store.set(options.key, { count: 1, resetAt: now + options.windowMs });
    return {
      ok: true,
      limit: options.limit,
      remaining: Math.max(0, options.limit - 1),
      retryAfterSeconds: Math.ceil(options.windowMs / 1000),
    };
  }

  existing.count += 1;
  store.set(options.key, existing);

  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  const remaining = Math.max(0, options.limit - existing.count);
  return {
    ok: existing.count <= options.limit,
    limit: options.limit,
    remaining,
    retryAfterSeconds,
  };
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
