import { cookies } from "next/headers";
import { z } from "zod";

import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { respondZodError } from "@/lib/api/validate";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const productIdSchema = z.object({
  productId: z.coerce.number().int().positive(),
});

const getAuthenticatedClient = async () => {
  const client = getSupabaseRouteClient(await cookies());
  const {
    data: { user },
  } = await client.auth.getUser();
  return { client, user };
};

const rateLimited = (rateLimit) =>
  applyRateLimitHeaders(Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 }), rateLimit);

export async function GET(request) {
  const { client, user } = await getAuthenticatedClient();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const rateLimit = await checkRateLimit({ request, id: "favorites:list", limit: 120, windowMs: 60_000 });
  if (!rateLimit.allowed) return rateLimited(rateLimit);
  const { data, error } = await client
    .from("favorites")
    .select("product_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return applyRateLimitHeaders(Response.json({ error: error.message || "Unable to load favorites." }, { status: 400 }), rateLimit);
  }

  return applyRateLimitHeaders(
    Response.json({
      productIds: (Array.isArray(data) ? data : []).map((entry) => String(entry.product_id)),
    }),
    rateLimit
  );
}

export async function POST(request) {
  const { client, user } = await getAuthenticatedClient();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const rateLimit = await checkRateLimit({ request, id: "favorites:save", limit: 60, windowMs: 60_000 });
  if (!rateLimit.allowed) return rateLimited(rateLimit);
  let body;
  try {
    body = await request.json();
  } catch {
    return applyRateLimitHeaders(Response.json({ error: "Invalid JSON payload" }, { status: 400 }), rateLimit);
  }
  const parsed = productIdSchema.safeParse(body);
  if (!parsed.success) return respondZodError(parsed.error);

  const { error } = await client
    .from("favorites")
    .upsert({ user_id: user.id, product_id: parsed.data.productId }, { onConflict: "user_id,product_id", ignoreDuplicates: true });
  if (error) {
    return applyRateLimitHeaders(Response.json({ error: error.message || "Unable to save favorite." }, { status: 400 }), rateLimit);
  }

  return applyRateLimitHeaders(Response.json({ productId: String(parsed.data.productId) }, { status: 201 }), rateLimit);
}

export async function DELETE(request) {
  const { client, user } = await getAuthenticatedClient();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const rateLimit = await checkRateLimit({ request, id: "favorites:remove", limit: 60, windowMs: 60_000 });
  if (!rateLimit.allowed) return rateLimited(rateLimit);
  const parsed = productIdSchema.safeParse({ productId: new URL(request.url).searchParams.get("productId") });
  if (!parsed.success) return respondZodError(parsed.error);

  const { error } = await client
    .from("favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("product_id", parsed.data.productId);
  if (error) {
    return applyRateLimitHeaders(Response.json({ error: error.message || "Unable to remove favorite." }, { status: 400 }), rateLimit);
  }

  return applyRateLimitHeaders(Response.json({ productId: String(parsed.data.productId) }), rateLimit);
}
