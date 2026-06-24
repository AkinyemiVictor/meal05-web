import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { supabasePublicConfig } from "@/lib/config/supabase";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  identifier: z.string().min(4).max(80),
  password: z.string().min(1).max(256),
});

const normalizePhoneCandidates = (value) => {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return [];

  const candidates = new Set([raw, digits, `+${digits}`]);
  if (digits.startsWith("0") && digits.length > 1) {
    const withoutLocalZero = digits.replace(/^0+/, "");
    candidates.add(withoutLocalZero);
    candidates.add(`+234${withoutLocalZero}`);
    candidates.add(`234${withoutLocalZero}`);
  } else if (!digits.startsWith("234") && digits.length >= 7 && digits.length <= 14) {
    candidates.add(`+234${digits}`);
    candidates.add(`234${digits}`);
  }
  if (digits.startsWith("234")) {
    candidates.add(`+${digits}`);
  }

  return [...candidates].filter(Boolean);
};

const findEmailByPhone = async (admin, table, phoneCandidates) => {
  const { data, error } = await admin
    .from(table)
    .select("email, phone")
    .in("phone", phoneCandidates)
    .not("email", "is", null)
    .limit(1);

  if (error) {
    return { email: "", error };
  }

  return { email: String(data?.[0]?.email || "").trim().toLowerCase(), error: null };
};

export async function POST(request) {
  const rl = await checkRateLimit({ request, id: "auth:resolve-login", limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Too many attempts" }, { status: 429 }), rl);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 }), rl);
  }

  const parsed = payloadSchema.safeParse(body || {});
  if (!parsed.success) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid login details" }, { status: 400 }), rl);
  }

  const phoneCandidates = normalizePhoneCandidates(parsed.data.identifier);
  if (!phoneCandidates.length) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid login details" }, { status: 401 }), rl);
  }

  try {
    const admin = getSupabaseAdminClient();
    for (const table of ["users", "profiles"]) {
      const result = await findEmailByPhone(admin, table, phoneCandidates);
      if (result.email) {
        const auth = createClient(supabasePublicConfig.url, supabasePublicConfig.anonKey, {
          auth: { persistSession: false },
        });
        const { data, error } = await auth.auth.signInWithPassword({
          email: result.email,
          password: parsed.data.password,
        });
        if (error || !data?.session) {
          return applyRateLimitHeaders(NextResponse.json({ error: "Invalid login details" }, { status: 401 }), rl);
        }
        return applyRateLimitHeaders(NextResponse.json({ session: data.session, user: data.user }, { status: 200 }), rl);
      }
    }
  } catch (error) {
    console.warn("Unable to resolve phone login", error);
  }

  return applyRateLimitHeaders(NextResponse.json({ error: "Invalid login details" }, { status: 401 }), rl);
}
