import { loadHomeCatalogCards } from "@/lib/home-catalog-cards-server";
import { publicCatalogJson } from "@/lib/public-catalog-server";
import {
  attachFreshStockMetadata,
  groupCatalogProducts,
  loadRecentRestockedProductIds,
} from "@/lib/fresh-stock-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const clampLimit = (value) => Math.min(Math.max(Number(value) || 48, 1), 120);

export async function GET(request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const limit = clampLimit(searchParams.get("limit"));
    const { ids, metadata, market } = await loadRecentRestockedProductIds({ limit });

    if (!ids.length) {
      return publicCatalogJson(
        { grouped: {}, flat: [], market },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const payload = await loadHomeCatalogCards({ ids, limit: ids.length });
    const flat = attachFreshStockMetadata(payload?.flat, metadata);

    return publicCatalogJson(
      {
        ...payload,
        grouped: groupCatalogProducts(flat),
        flat,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return publicCatalogJson(
      { error: "Failed to load recently restocked products", details: error?.message || String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
