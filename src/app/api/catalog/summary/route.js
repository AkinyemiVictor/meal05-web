import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import BUNDLE_PLANS from "@/data/bundle-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 60;
export const fetchCache = "default-cache";

const PUBLIC_CATALOG_SUMMARY_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  "CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
  "Vercel-CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const countRows = async (query) => {
  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0);
};

export async function GET() {
  try {
    const admin = getSupabaseAdminClient();

    const [
      totalActiveProducts,
      totalCategories,
      totalVariants,
      totalAvailableVariants,
      lowStockVariants,
      outOfStockVariants,
      activeProductsRes,
      availableVariantsRes,
    ] = await Promise.all([
      countRows(admin.from("products").select("id", { count: "exact", head: true }).eq("is_active", true)),
      countRows(admin.from("product_categories").select("id", { count: "exact", head: true })),
      countRows(admin.from("product_variants").select("id", { count: "exact", head: true }).eq("is_active", true)),
      countRows(
        admin
          .from("product_variants")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .gt("stock_count", 0)
      ),
      countRows(
        admin
          .from("product_variants")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .gt("stock_count", 0)
          .lte("stock_count", 5)
      ),
      countRows(
        admin
          .from("product_variants")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .lte("stock_count", 0)
      ),
      admin.from("products").select("id").eq("is_active", true).range(0, 9999),
      admin.from("product_variants").select("product_id, stock_count").eq("is_active", true).gt("stock_count", 0).range(0, 9999),
    ]);

    if (activeProductsRes.error) throw activeProductsRes.error;
    if (availableVariantsRes.error) throw availableVariantsRes.error;

    const activeProductIds = new Set((activeProductsRes.data || []).map((row) => String(row.id)));
    const availableProductIds = new Set(
      (availableVariantsRes.data || [])
        .filter((row) => toNumber(row.stock_count) > 0)
        .map((row) => String(row.product_id))
        .filter((id) => activeProductIds.has(id))
    );
    const totalBundlePlans = BUNDLE_PLANS.length;

    return NextResponse.json(
      {
        totalCatalogItems: totalActiveProducts + totalBundlePlans,
        totalActiveProducts,
        totalBundlePlans,
        totalCategories,
        totalAvailableProducts: availableProductIds.size,
        totalVariants,
        totalAvailableVariants,
        lowStockVariants,
        outOfStockVariants,
      },
      {
        status: 200,
        headers: PUBLIC_CATALOG_SUMMARY_CACHE_HEADERS,
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load catalog summary", details: error?.message || String(error) },
      { status: 500 }
    );
  }
}
