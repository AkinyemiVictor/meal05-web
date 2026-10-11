import { loadCatalogCardPage } from "@/lib/home-catalog-cards-server";
import { loadPublicCatalogProducts, publicCatalogJson } from "@/lib/public-catalog-server";
import {
  attachFreshStockMetadata,
  groupCatalogProducts,
  loadRecentRestockedProductIds,
} from "@/lib/fresh-stock-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIVE_STOCK_HEADERS = {
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

export async function GET(request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const view = searchParams.get("view") || "default";
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 48), 1), 120);

    if (searchParams.has("page") || searchParams.has("pageSize")) {
      const payload = await loadCatalogCardPage({
        page: searchParams.get("page") || 1,
        pageSize: searchParams.get("pageSize") || 20,
        category: searchParams.get("category") || "",
        search: searchParams.get("search") || "",
        sort: searchParams.get("sort") || "default",
      });
      // Shop/category pagination is stock-sensitive. Do not let an older edge copy
      // re-introduce depleted products ahead of newly available ones.
      return publicCatalogJson(payload, { headers: LIVE_STOCK_HEADERS });
    }

    if (view === "new") {
      const { ids, metadata, market } = await loadRecentRestockedProductIds({ limit });
      if (!ids.length) {
        return publicCatalogJson(
          { grouped: {}, flat: [], market },
          { headers: { "Cache-Control": "no-store" } }
        );
      }

      const payload = await loadPublicCatalogProducts({ ids, limit: ids.length });
      const flat = attachFreshStockMetadata(payload?.flat, metadata);
      return publicCatalogJson(
        {
          ...payload,
          grouped: groupCatalogProducts(flat),
          flat,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const payload = await loadPublicCatalogProducts({
      category: searchParams.get("category") || "",
      view,
      limit,
    });
    return publicCatalogJson(payload);
  } catch (error) {
    return publicCatalogJson(
      { error: "Failed to load catalogue cards", details: error?.message || String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
