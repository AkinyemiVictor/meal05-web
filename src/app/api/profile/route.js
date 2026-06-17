import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const rl = await checkRateLimit({ request, id: "profile:get", limit: 120, windowMs: 60_000 });
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user }, error: authErr } = await auth.auth.getUser();
  if (authErr) return applyRateLimitHeaders(NextResponse.json({ error: authErr.message }, { status: 401 }), rl);
  if (!user) return applyRateLimitHeaders(NextResponse.json({ error: "Not authenticated" }, { status: 401 }), rl);

  // Try id then user_id for compatibility
  let row = null; let error = null;
  let res = await auth.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (res.error && res.error.code !== "PGRST116") error = res.error; // not found is ok
  row = res.data || null;
  if (!row) {
    res = await auth.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (res.error && res.error.code !== "PGRST116") error = error || res.error;
    row = res.data || null;
  }
  if (error) return applyRateLimitHeaders(NextResponse.json({ error: error.message }, { status: 400 }), rl);

  return applyRateLimitHeaders(NextResponse.json({ profile: row }, { status: 200 }), rl);
}

export async function PUT(request) {
  const rl = await checkRateLimit({ request, id: "profile:update", limit: 60, windowMs: 60_000 });
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user }, error: authErr } = await auth.auth.getUser();
  if (authErr) return applyRateLimitHeaders(NextResponse.json({ error: authErr.message }, { status: 401 }), rl);
  if (!user) return applyRateLimitHeaders(NextResponse.json({ error: "Not authenticated" }, { status: 401 }), rl);

  let payload; try { payload = await request.json(); } catch { return applyRateLimitHeaders(NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 }), rl); }
  const schema = z.object({
    first_name: z.string().max(80).optional(),
    last_name: z.string().max(80).optional(),
    phone: z.string().max(32).optional(),
    address: z.string().max(500).optional(),
  }).refine((obj) => Object.keys(obj).length > 0, { message: "No fields to update" });
  const parsed = schema.safeParse(payload || {});
  if (!parsed.success) return applyRateLimitHeaders(NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 }), rl);

  // Upsert by id; if table uses user_id, also include that
  const patch = { ...parsed.data, id: user.id, user_id: user.id };
  const { data, error } = await auth.from("profiles").upsert(patch).select("*").single();
  if (error) return applyRateLimitHeaders(NextResponse.json({ error: error.message }, { status: 400 }), rl);

  return applyRateLimitHeaders(NextResponse.json({ profile: data }, { status: 200 }), rl);
}

