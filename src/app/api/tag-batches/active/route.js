import { NextResponse } from "next/server";
import { getDefaultMarket } from "@/lib/market-server";
import { loadTagBatches } from "@/lib/tag-buy-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const productIds = searchParams.getAll("productId").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean).slice(0, 120);
  try {
    const market = await getDefaultMarket();
    const batches = await loadTagBatches({ marketId: market.id, productIds, statuses: ["open"] });
    return NextResponse.json({ batches }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to load Tag Buys." }, { status: 500 });
  }
}

