import { loadPublicCatalogProducts, publicCatalogJson } from "@/lib/public-catalog-server";
import { shouldShowSeasonBadge } from "@/lib/season-badge";

export const runtime = "nodejs";
export const revalidate = 300;
export const fetchCache = "default-cache";

const clampLimit = (value) => Math.min(Math.max(Number(value) || 72, 1), 120);

export async function GET(request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const limit = clampLimit(searchParams.get("limit"));
    const payload = await loadPublicCatalogProducts({ view: "in-season", limit });

    const flat = (Array.isArray(payload?.flat) ? payload.flat : []).filter(
      (product) => product?.inSeason === true && shouldShowSeasonBadge(product)
    );

    return publicCatalogJson({
      ...payload,
      grouped: { "in-season": flat },
      flat,
    });
  } catch (error) {
    return publicCatalogJson(
      { error: "Failed to load in-season catalogue", details: error?.message || String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
