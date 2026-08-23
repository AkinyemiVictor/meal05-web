import { publicCatalogJson } from "@/lib/public-catalog-server";
import { loadHomeCatalogCards } from "@/lib/home-catalog-cards-server";
import {
  attachFreshStockMetadata,
  groupCatalogProducts,
  loadRecentRestockedProductIds,
} from "@/lib/fresh-stock-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const revalidate = 60;
export const fetchCache = "default-cache";

const HOME_CATALOG_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
  "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  "Vercel-CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

const annotateChefChoice = (product, metadata) => {
  const meta = metadata.get(String(product?.id || ""));
  if (!meta) return product;
  return {
    ...product,
    isChefChoice: true,
    chefChoiceSortOrder: Number(meta.chef_choice_sort_order ?? 9999),
    collectionSlug: "chef-choice",
  };
};

export async function GET(request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 72), 1), 120);
    const admin = getSupabaseAdminClient();

    const [payload, freshStock, chefResult] = await Promise.all([
      loadHomeCatalogCards({ limit }),
      loadRecentRestockedProductIds({ limit }),
      admin
        .from("products")
        .select("id, chef_choice_sort_order")
        .eq("is_active", true)
        .eq("is_chef_choice", true)
        .order("chef_choice_sort_order", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .limit(80),
    ]);

    if (chefResult.error) throw chefResult.error;

    const chefRows = Array.isArray(chefResult.data) ? chefResult.data : [];
    const chefIds = chefRows.map((row) => String(row.id)).filter(Boolean);
    const chefMetadata = new Map(chefRows.map((row) => [String(row.id), row]));

    const [freshPayload, chefPayload] = await Promise.all([
      freshStock.ids.length
        ? loadHomeCatalogCards({ ids: freshStock.ids, limit: freshStock.ids.length })
        : Promise.resolve({ flat: [] }),
      chefIds.length
        ? loadHomeCatalogCards({ ids: chefIds, limit: chefIds.length })
        : Promise.resolve({ flat: [] }),
    ]);

    const freshProducts = attachFreshStockMetadata(freshPayload?.flat, freshStock.metadata)
      .map((product) => annotateChefChoice(product, chefMetadata));

    const chefById = new Map(
      (Array.isArray(chefPayload?.flat) ? chefPayload.flat : [])
        .map((product) => annotateChefChoice(product, chefMetadata))
        .map((product) => [String(product.id), product])
    );
    const chefProducts = chefIds.map((id) => chefById.get(id)).filter(Boolean);

    const freshIds = new Set(freshProducts.map((product) => String(product.id)));
    const chefIdSet = new Set(chefProducts.map((product) => String(product.id)));
    const baseProducts = (Array.isArray(payload?.flat) ? payload.flat : [])
      .map((product) => annotateChefChoice(product, chefMetadata))
      .filter((product) => {
        const id = String(product?.id || "");
        return id && !freshIds.has(id) && !chefIdSet.has(id);
      });

    const responseLimit = Math.min(120, Math.max(limit, limit + chefProducts.length));
    const flat = [
      ...freshProducts,
      ...chefProducts.filter((product) => !freshIds.has(String(product.id))),
      ...baseProducts,
    ].slice(0, responseLimit);

    return publicCatalogJson(
      {
        ...payload,
        grouped: groupCatalogProducts(flat),
        flat,
      },
      { headers: HOME_CATALOG_CACHE_HEADERS }
    );
  } catch (error) {
    return publicCatalogJson(
      { error: "Failed to load home catalogue", details: error?.message || String(error) },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
