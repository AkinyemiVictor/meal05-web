// Rate limit utilities.
// Uses Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN are set; falls back to in-memory.
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

let upstash = null;
let limiters = new Map();
const buckets = new Map(); // fallback memory

const now = () => Date.now();

export const getClientIp = (request) => {
  try {
    const xff = request.headers.get("x-forwarded-for") || request.headers.get("X-Forwarded-For");
    if (xff) {
      const first = xff.split(",")[0].trim();
      if (first) return first;
    }
    const cip = request.headers.get("x-real-ip") || request.headers.get("X-Real-IP");
    if (cip) return cip;
  } catch {}
  return "unknown";
};

const getUpstashLimiter = async (id, limit, windowMs) => {
  if (!upstash) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      try {
        const redis = new Redis({ url, token });
        upstash = { Ratelimit, redis };
      } catch {
        // Fall back to memory limiter
        upstash = null;
      }
    }
  }
  if (!upstash) return null;
  const key = `${id}:${limit}:${windowMs}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    const sliding = new upstash.Ratelimit({
      redis: upstash.redis,
      limiter: upstash.Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      analytics: false,
      prefix: `rl:${id}`,
    });
    limiter = sliding;
    limiters.set(key, limiter);
  }
  return limiter;
};

export async function checkRateLimit({ request, id = "default", limit = 60, windowMs = 60_000 }) {
  const ip = getClientIp(request);
  const key = `${ip}:${id}:${request.method}`;
  const limiter = await getUpstashLimiter(id, limit, windowMs);
  if (limiter) {
    const res = await limiter.limit(key);
    const resetMs = res.reset ? Math.max(0, res.reset * 1000 - now()) : 0;
    return { allowed: res.success, remaining: res.remaining, limit, resetMs };
  }
  // fallback memory
  const stamp = now();
  let b = buckets.get(key);
  if (!b || stamp - b.windowStart >= windowMs) {
    b = { windowStart: stamp, count: 0 };
    buckets.set(key, b);
  }
  if (b.count >= limit) {
    const retryAfterMs = b.windowStart + windowMs - stamp;
    return { allowed: false, remaining: 0, limit, resetMs: retryAfterMs };
  }
  b.count += 1;
  const remaining = Math.max(0, limit - b.count);
  return { allowed: true, remaining, limit, resetMs: 0 };
}

export function applyRateLimitHeaders(response, info) {
  try {
    response.headers.set("X-RateLimit-Limit", String(info.limit));
    response.headers.set("X-RateLimit-Remaining", String(info.remaining));
    if (!info.allowed && info.resetMs) {
      response.headers.set("Retry-After", String(Math.ceil(info.resetMs / 1000)));
    }
  } catch {}
  return response;
}

const rateLimitApi = { checkRateLimit, applyRateLimitHeaders, getClientIp };

export default rateLimitApi;
