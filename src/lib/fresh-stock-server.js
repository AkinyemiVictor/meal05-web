import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { getDefaultMarket } from "@/lib/market-server";

const clampLimit = (value) => Math.min(Math.max(Number(value) || 48, 1), 120);

export async function loadRecentRestockedProductIds({ limit = 48 } = {}) {
  const maxProducts = clampLimit(limit);
  const admin = getSupabaseAdminClient();
  const market = await getDefaultMarket();

  const { data, error } = await admin
    .from("product_variants")
    .select("product_id, restocked_at, last_restock_quantity")
    .eq("market_id", market.id)
    .eq("is_active", true)
    .gt("stock_count", 0)
    .not("restocked_at", "is", null)
    .order("restocked_at", { ascending: false })
    .limit(1000);

  if (error) throw error;

  const ids = [];
  const metadata = new Map();

  for (const row of Array.isArray(data) ? data : []) {
    const productId = String(row?.product_id || "").trim();
    if (!productId || metadata.has(productId)) continue;

    metadata.set(productId, {
      restockedAt: row?.restocked_at || null,
      lastRestockQuantity: Number(row?.last_restock_quantity || 0) || 0,
    });
    ids.push(productId);

    if (ids.length >= maxProducts) break;
  }

  return { ids, metadata, market };
}

export function attachFreshStockMetadata(products = [], metadata = new Map()) {
  return (Array.isArray(products) ? products : [])
    .map((product) => {
      const meta = metadata.get(String(product?.id || ""));
      if (!meta) return null;
      return {
        ...product,
        isNewArrival: true,
        isFreshInStock: true,
        restockedAt: meta.restockedAt,
        lastRestockQuantity: meta.lastRestockQuantity,
        collectionSlug: "fresh-in-stock",
      };
    })
    .filter(Boolean);
}

export function groupCatalogProducts(products = []) {
  return (Array.isArray(products) ? products : []).reduce((groups, product) => {
    const key = product?.categorySlug || "uncategorised";
    if (!groups[key]) groups[key] = [];
    groups[key].push(product);
    return groups;
  }, {});
}
