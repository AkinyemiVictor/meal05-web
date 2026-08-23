import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { loadMarketCatalog } from "@/lib/market-catalog-server";
import { loadAvailabilitySettings } from "@/lib/availability-settings-server";
import { toPublicAvailabilityTiming } from "@/lib/availability-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = getSupabaseAdminClient();
  try {
    const catalog = await loadMarketCatalog(admin);
    const settings = await loadAvailabilitySettings({ admin, marketId: catalog.market.id });
    return NextResponse.json(toPublicAvailabilityTiming(settings), {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Availability settings are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
