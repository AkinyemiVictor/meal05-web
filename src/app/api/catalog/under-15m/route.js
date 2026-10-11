import { loadHomeCatalogCards } from "@/lib/home-catalog-cards-server";
import { publicCatalogJson } from "@/lib/public-catalog-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const revalidate = 300;
export const fetchCache = "default-cache";

const clampLimit = (value) => Math.min(Math.max(Number(value) || 72, 1), 120);

export async function GET(request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const limit = clampLimit(searchParams.get("limit"));
    const admin = getSupabaseAdminClient();

    const { data: taggedRows, error } = await admin
      .from("products")
      .select("id, prep_minutes, under_15m_sort_order")
      .eq("is_active", true)
      .eq("is_under_15m", true)
      .order("under_15m_sort_order", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(limit);

    if (error) throw error;

    const rows = Array.isArray(taggedRows) ? taggedRows : [];
    const ids = rows.map((row) => String(row.id)).filter(Boolean);
    const metadata = new Map(rows.map((row) => [String(row.id), row]));

    if (!ids.length) {
      return publicCatalogJson({ grouped: { "under-15m": [] }, flat: [], market: null });
    }

    // Under 15m only needs card-level data for browsing. Full variants remain
    // deferred until Quick Add requests /api/products/{id} for the selected item.
    const payload = await loadHomeCatalogCards({ ids, limit: ids.length });
    const byId = new Map((Array.isArray(payload?.flat) ? payload.flat : []).map((product) => [String(product.id), product]));

    const flat = ids
      .map((id) => {
        const product = byId.get(id);
        const meta = metadata.get(id);
        if (!product) return null;
        return {
          ...product,
          isUnder15m: true,
          isUnder15Minutes: true,
          prepMinutes: Number(meta?.prep_minutes ?? 0),
          under15SortOrder: Number(meta?.under_15m_sort_order ?? 9999),
          collectionSlug: "under-15m",
        };
      })
      .filter(Boolean);

    return publicCatalogJson({
      ...payload,
      grouped: { "under-15m": flat },
      flat,
    });
  } catch (error) {
    return publicCatalogJson(
      { error: "Failed to load under-15m catalogue", details: error?.message || String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
