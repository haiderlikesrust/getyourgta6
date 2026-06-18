import { NextRequest, NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of buckets) {
    if (entry.resetAt < now) buckets.delete(key);
  }
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

export function rateLimit(
  request: NextRequest,
  options: { key: string; limit: number; windowMs: number },
): NextResponse | null {
  cleanup();
  const ip = getClientIp(request);
  const bucketKey = `${options.key}:${ip}`;
  const now = Date.now();

  let entry = buckets.get(bucketKey);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + options.windowMs };
    buckets.set(bucketKey, entry);
  }

  entry.count += 1;

  if (entry.count > options.limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  return null;
}
