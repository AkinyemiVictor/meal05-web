import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { getOriginTrustContext } from "@/lib/api/request-origin";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { getDefaultMarket } from "@/lib/market-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const coordinatesSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().nonnegative().max(100000).optional().nullable(),
  formattedAddress: z.string().trim().max(500).optional().nullable(),
  providerPlaceId: z.string().trim().max(300).optional().nullable(),
  provider: z.string().trim().max(60).optional().nullable(),
});

const noStore = { "Cache-Control": "no-store, no-cache, must-revalidate" };

export async function GET(request) {
  const limit = await checkRateLimit({ request, id: "location:areas", limit: 120, windowMs: 60_000 });
  try {
    const market = await getDefaultMarket();
    const admin = getSupabaseAdminClient();
    const { data: zones, error: zoneError } = await admin
      .from("delivery_zones")
      .select("id,name,city,eta_note,sort_order,priority")
      .eq("market_id", market.id)
      .eq("is_active", true)
      .order("priority", { ascending: true });
    if (zoneError) throw zoneError;
    const zoneIds = (zones || []).map((zone) => zone.id);
    let areas = [];
    if (zoneIds.length) {
      const { data, error } = await admin
        .from("delivery_zone_areas")
        .select("id,zone_id,name,slug,area_type,lga_name,aliases,display_priority,is_featured")
        .in("zone_id", zoneIds)
        .eq("is_active", true)
        .order("is_featured", { ascending: false })
        .order("display_priority", { ascending: true });
      if (error) throw error;
      areas = data || [];
    }
    return applyRateLimitHeaders(NextResponse.json({ market: { id: market.id, code: market.code }, zones: zones || [], areas }, { headers: noStore }), limit);
  } catch (error) {
    return applyRateLimitHeaders(NextResponse.json({ error: error?.message || "Location areas are unavailable." }, { status: 503, headers: noStore }), limit);
  }
}

export async function POST(request) {
  const limit = await checkRateLimit({ request, id: "location:resolve", limit: 30, windowMs: 60_000 });
  if (!limit.allowed) return applyRateLimitHeaders(NextResponse.json({ error: "Too many location checks. Try again shortly." }, { status: 429 }), limit);
  const admin = getSupabaseAdminClient();
  const originTrust = await getOriginTrustContext(request, admin);
  if (!originTrust.trusted) return applyRateLimitHeaders(NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 }), limit);
  try {
    const parsed = coordinatesSchema.safeParse(await request.json());
    if (!parsed.success) return applyRateLimitHeaders(NextResponse.json({ error: "Valid latitude and longitude are required." }, { status: 400 }), limit);
    const market = await getDefaultMarket();
    const { data, error } = await admin.rpc("resolve_delivery_zone", {
      p_lat: parsed.data.latitude,
      p_lng: parsed.data.longitude,
      p_market_id: market.id,
    });
    if (error) throw error;
    const zone = Array.isArray(data) ? data[0] : null;
    return applyRateLimitHeaders(NextResponse.json({
      serviceable: Boolean(zone),
      coordinates: { latitude: parsed.data.latitude, longitude: parsed.data.longitude, accuracy: parsed.data.accuracy ?? null },
      formattedAddress: parsed.data.formattedAddress || "",
      providerPlaceId: parsed.data.providerPlaceId || "",
      provider: parsed.data.provider || "device",
      zone: zone ? {
        id: zone.zone_id,
        name: zone.zone_name,
        deliveryFee: Number(zone.delivery_fee || 0),
        minOrder: zone.min_order == null ? null : Number(zone.min_order),
        eta: zone.eta_note || "",
        distanceMetres: Math.round(Number(zone.distance_m || 0)),
      } : null,
    }, { headers: noStore }), limit);
  } catch (error) {
    return applyRateLimitHeaders(NextResponse.json({ error: error?.message || "Unable to check this location." }, { status: 503, headers: noStore }), limit);
  }
}
