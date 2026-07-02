import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { getDefaultMarket } from "@/lib/market-server";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { isTrustedRequestOrigin } from "@/lib/api/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });

export async function GET(request) {
  const rl = await checkRateLimit({ request, id: "fulfillment:options", limit: 60, windowMs: 60_000 });
  try {
    const market = await getDefaultMarket(); const admin = getSupabaseAdminClient();
    const { data, error } = await admin.from("pickup_locations").select("id,name,address,city,phone,hours,instructions").eq("market_id", market.id).eq("is_active", true).order("name");
    if (error) throw error;
    return applyRateLimitHeaders(NextResponse.json({ pickupLocations: data || [] }, { headers: { "Cache-Control": "no-store" } }), rl);
  } catch (error) { return applyRateLimitHeaders(NextResponse.json({ error: error.message }, { status: 503 }), rl); }
}

export async function POST(request) {
  const rl = await checkRateLimit({ request, id: "fulfillment:quotes", limit: 30, windowMs: 60_000 });
  if (!isTrustedRequestOrigin(request)) return applyRateLimitHeaders(NextResponse.json({ error: "Forbidden origin" }, { status: 403 }), rl);
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return applyRateLimitHeaders(NextResponse.json({ error: "Valid coordinates are required." }, { status: 400 }), rl);
    const market = await getDefaultMarket(); const admin = getSupabaseAdminClient();
    const { data: zones, error: zoneError } = await admin.rpc("resolve_delivery_zone", { p_lat: parsed.data.latitude, p_lng: parsed.data.longitude, p_market_id: market.id });
    if (zoneError) throw zoneError; const zone = zones?.[0];
    if (!zone) return applyRateLimitHeaders(NextResponse.json({ serviceable: false, quotes: [] }), rl);
    const { data, error } = await admin.from("delivery_partner_services")
      .select("id,partner_id,base_fee,currency_code,eta_note,ranking,is_recommended,delivery_partners!inner(id,name,slug,logo_url,status,market_id)")
      .eq("zone_id", zone.zone_id).eq("is_active", true).eq("delivery_partners.status", "active").eq("delivery_partners.market_id", market.id).order("ranking");
    if (error) throw error;
    const quotes = (data || []).map(row => ({ id: row.partner_id, serviceId: row.id, name: row.delivery_partners.name, slug: row.delivery_partners.slug, logoUrl: row.delivery_partners.logo_url || "", fee: Number(row.base_fee), currencyCode: row.currency_code, eta: row.eta_note || "Timing confirmed after booking", recommended: row.is_recommended }));
    return applyRateLimitHeaders(NextResponse.json({ serviceable: true, zone: { id: zone.zone_id, name: zone.zone_name }, quotes }), rl);
  } catch (error) { return applyRateLimitHeaders(NextResponse.json({ error: error.message || "Quotes unavailable." }, { status: 503 }), rl); }
}
