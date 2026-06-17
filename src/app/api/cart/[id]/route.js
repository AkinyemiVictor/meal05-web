import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { respondZodError } from "@/lib/api/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  const { id } = (await params) || {};
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const authClient = getSupabaseRouteClient(await cookies());
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const rl = await checkRateLimit({ request: req, id: "cart:update", limit: 60, windowMs: 60_000 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const schema = z.object({ quantity: z.number().int().positive().max(999) });
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    return respondZodError(parsed.error);
  }
  const quantityNum = parsed.data.quantity;

  const routeClient = getSupabaseRouteClient(await cookies());
  const { data, error } = await routeClient
    .from("cart_items")
    .update({ quantity: quantityNum })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) return applyRateLimitHeaders(NextResponse.json({ error }, { status: 400 }), rl);
  if (!data || data.length === 0) return applyRateLimitHeaders(NextResponse.json({ error: "Item not found" }, { status: 404 }), rl);
  return applyRateLimitHeaders(NextResponse.json({ message: "Quantity updated" }, { status: 200 }), rl);
}

export async function DELETE(req, { params }) {
  const { id } = (await params) || {};
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const authClient = getSupabaseRouteClient(await cookies());
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const rl = await checkRateLimit({ request: req, id: "cart:remove", limit: 60, windowMs: 60_000 });
  const routeClient = getSupabaseRouteClient(await cookies());
  const { data, error } = await routeClient
    .from("cart_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) return applyRateLimitHeaders(NextResponse.json({ error }, { status: 400 }), rl);
  if (!data || data.length === 0) return applyRateLimitHeaders(NextResponse.json({ error: "Item not found" }, { status: 404 }), rl);
  return applyRateLimitHeaders(NextResponse.json({ message: "Item removed" }, { status: 200 }), rl);
}
