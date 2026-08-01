import { loadPublicCatalogProducts, publicCatalogJson } from "@/lib/public-catalog-server";
import {
  attachFreshStockMetadata,
  groupCatalogProducts,
  loadRecentRestockedProductIds,
} from "@/lib/fresh-stock-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 72), 1), 120);

    const [payload, freshStock] = await Promise.all([
      loadPublicCatalogProducts({ view: "home", limit }),
      loadRecentRestockedProductIds({ limit }),
    ]);

    if (!freshStock.ids.length) {
      return publicCatalogJson(payload, { headers: { "Cache-Control": "no-store" } });
    }

    const freshPayload = await loadPublicCatalogProducts({
      ids: freshStock.ids,
      limit: freshStock.ids.length,
    });
    const freshProducts = attachFreshStockMetadata(freshPayload?.flat, freshStock.metadata);
    const freshIds = new Set(freshProducts.map((product) => String(product.id)));
    const flat = [
      ...freshProducts,
      ...(Array.isArray(payload?.flat) ? payload.flat : []).filter(
        (product) => !freshIds.has(String(product?.id || ""))
      ),
    ].slice(0, limit);

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
      { error: "Failed to load home catalogue", details: error?.message || String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
