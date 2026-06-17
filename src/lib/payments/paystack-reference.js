import "server-only";
import crypto from "node:crypto";
import { Redis } from "@upstash/redis";

const REF_TTL_SECONDS = 60 * 30; // 30 minutes
const memory = new Map();
let redisClient = undefined;

const now = () => Date.now();
const toInt = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

const keyFor = (reference) => `paystack:ref:${String(reference || "").trim()}`;

const safeJsonParse = (value) => {
  try {
    if (typeof value !== "string") return value && typeof value === "object" ? value : null;
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const getRedis = () => {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    redisClient = null;
    return redisClient;
  }
  redisClient = new Redis({ url, token });
  return redisClient;
};

const pruneMemory = () => {
  const ts = now();
  for (const [reference, value] of memory.entries()) {
    if (!value || ts >= Number(value.expiresAt || 0)) {
      memory.delete(reference);
    }
  }
};

const sanitizeOrderId = (orderId) =>
  String(orderId || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "");

const generateReference = (orderId) => {
  const safeOrderId = sanitizeOrderId(orderId);
  const stamp = now();
  const nonce = crypto.randomBytes(6).toString("hex");
  return `MK-${safeOrderId}-${stamp}-${nonce}`;
};

const putMemory = (reference, payload, ttlSeconds) => {
  pruneMemory();
  memory.set(reference, { ...payload, expiresAt: now() + ttlSeconds * 1000 });
};

const readMemory = (reference) => {
  pruneMemory();
  return memory.get(reference) || null;
};

const removeMemory = (reference) => {
  memory.delete(reference);
};

export const issuePaystackReference = async ({
  orderId,
  userId,
  email,
  amountKobo,
  ttlSeconds = REF_TTL_SECONDS,
}) => {
  const normalizedOrderId = sanitizeOrderId(orderId);
  if (!normalizedOrderId) {
    throw new Error("Invalid order id for payment reference");
  }

  const reference = generateReference(normalizedOrderId);
  const issuedAt = now();
  const ttl = toInt(ttlSeconds, REF_TTL_SECONDS);
  const payload = {
    reference,
    orderId: normalizedOrderId,
    userId: String(userId || "").trim(),
    email: String(email || "").trim().toLowerCase(),
    amountKobo: toInt(amountKobo, 0),
    issuedAt,
    expiresAt: issuedAt + ttl * 1000,
  };

  const redis = getRedis();
  if (redis) {
    await redis.setex(keyFor(reference), ttl, JSON.stringify(payload));
  } else {
    putMemory(reference, payload, ttl);
  }

  return payload;
};

export const readPaystackReference = async (reference) => {
  const normalized = String(reference || "").trim();
  if (!normalized) return null;

  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(keyFor(normalized));
    const parsed = safeJsonParse(raw);
    if (!parsed) return null;
    if (Number(parsed.expiresAt || 0) <= now()) {
      try {
        await redis.del(keyFor(normalized));
      } catch {}
      return null;
    }
    return parsed;
  }

  const cached = readMemory(normalized);
  if (!cached) return null;
  if (Number(cached.expiresAt || 0) <= now()) {
    removeMemory(normalized);
    return null;
  }
  return cached;
};

export const consumePaystackReference = async (reference) => {
  const normalized = String(reference || "").trim();
  if (!normalized) return;

  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(keyFor(normalized));
    } catch {}
    return;
  }

  removeMemory(normalized);
};
