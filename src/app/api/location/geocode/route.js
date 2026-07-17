import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { getOriginTrustContext } from "@/lib/api/request-origin";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("search"), query: z.string().trim().min(2).max(180) }),
  z.object({ mode: z.literal("reverse"), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
]);
const PHOTON = "https://photon.komoot.io";

const labelFor = (properties = {}) => [properties.name, properties.street, properties.district, properties.city, properties.state, properties.country].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(", ");

export async function POST(request) {
  const rl = await checkRateLimit({ request, id: "location:geocode", limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return applyRateLimitHeaders(NextResponse.json({ error: "Too many address searches. Try again shortly." }, { status: 429 }), rl);
  const admin = getSupabaseAdminClient();
  const originTrust = await getOriginTrustContext(request, admin);
  if (!originTrust.trusted) return applyRateLimitHeaders(NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 }), rl);
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return applyRateLimitHeaders(NextResponse.json({ error: "A valid address or coordinate is required." }, { status: 400 }), rl);
    const params = new URLSearchParams({ lang: "en", limit: parsed.data.mode === "search" ? "5" : "1" });
    let endpoint = "/api/";
    if (parsed.data.mode === "search") {
      params.set("q", `${parsed.data.query}, Ibadan, Oyo, Nigeria`);
      params.set("lat", "7.342134"); params.set("lon", "3.847802");
      params.set("bbox", "3.60,7.10,4.20,7.70");
    } else {
      endpoint = "/reverse"; params.set("lat", String(parsed.data.latitude)); params.set("lon", String(parsed.data.longitude));
    }
    const response = await fetch(`${PHOTON}${endpoint}?${params}`, { headers: { Accept: "application/json", "User-Agent": "Meal05/1.0 (location-support@meal05.com)" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!response.ok) throw new Error("Address search provider is unavailable.");
    const payload = await response.json();
    const results = (payload.features || []).map(feature => {
      const label = labelFor(feature.properties);
      return {
        latitude: Number(feature.geometry?.coordinates?.[1]),
        longitude: Number(feature.geometry?.coordinates?.[0]),
        label,
        formattedAddress: label,
        provider: "photon",
        providerPlaceId: String(feature.properties?.osm_id || ""),
      };
    }).filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
    return applyRateLimitHeaders(NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } }), rl);
  } catch (error) {
    return applyRateLimitHeaders(NextResponse.json({ error: error?.message || "Address search failed." }, { status: 503 }), rl);
  }
}
