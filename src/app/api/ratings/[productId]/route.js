import { cookies } from "next/headers";
import { z } from "zod";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { respondZodError } from "@/lib/api/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5),
});

const buildSummary = (rows) => {
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let sum = 0;
  for (const row of rows || []) {
    const value = Math.min(5, Math.max(1, Number(row.rating) || 0));
    if (!value) continue;
    breakdown[value] += 1;
    total += 1;
    sum += value;
  }
  return {
    average: total ? Number((sum / total).toFixed(2)) : 0,
    totalRatings: total,
    breakdown,
  };
};

export async function GET(req, { params }) {
  const { productId } = await params;
  const supabase = getSupabaseRouteClient(await cookies());
  const rl = await checkRateLimit({ request: req, id: `ratings:list:${productId}`, limit: 120, windowMs: 60_000 });

  if (!productId) {
    return applyRateLimitHeaders(new Response(JSON.stringify({ error: "Missing product id" }), { status: 400 }), rl);
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { data: approvedRows, error } = await supabase
    .from("product_ratings")
    .select("rating, user_id")
    .eq("product_id", productId)
    .eq("is_approved", true);

  if (error) {
    return applyRateLimitHeaders(new Response(JSON.stringify({ error: error.message || error }), { status: 400 }), rl);
  }

  const summary = buildSummary(approvedRows);
  let userRating = null;
  if (user?.id) {
    const { data: ownRating } = await supabase
      .from("product_ratings")
      .select("rating")
      .eq("product_id", productId)
      .eq("user_id", user.id)
      .maybeSingle();
    userRating = ownRating?.rating ?? null;
  }

  return applyRateLimitHeaders(
    new Response(JSON.stringify({ ...summary, userRating }), { status: 200 }),
    rl
  );
}

export async function POST(req, { params }) {
  const { productId } = await params;
  const supabase = getSupabaseRouteClient(await cookies());
  const rl = await checkRateLimit({ request: req, id: `ratings:write:${productId}`, limit: 60, windowMs: 60_000 });

  if (!productId) {
    return applyRateLimitHeaders(new Response(JSON.stringify({ error: "Missing product id" }), { status: 400 }), rl);
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return applyRateLimitHeaders(new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 }), rl);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return applyRateLimitHeaders(new Response(JSON.stringify({ error: "Invalid JSON payload" }), { status: 400 }), rl);
  }
  const parsed = ratingSchema.safeParse(body || {});
  if (!parsed.success) {
    return respondZodError(parsed.error);
  }

  const { rating } = parsed.data;
  const { error } = await supabase
    .from("product_ratings")
    .upsert(
      {
        user_id: user.id,
        product_id: String(productId),
        rating,
      },
      { onConflict: "product_id,user_id" }
    );

  if (error) {
    return applyRateLimitHeaders(new Response(JSON.stringify({ error: error.message || error }), { status: 400 }), rl);
  }

  return applyRateLimitHeaders(new Response(JSON.stringify({ success: true }), { status: 201 }), rl);
}
