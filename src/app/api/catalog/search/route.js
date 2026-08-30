import { loadCatalogCardPage } from "@/lib/home-catalog-cards-server";
import { publicCatalogJson } from "@/lib/public-catalog-server";

export const runtime = "nodejs";
export const revalidate = 300;
export const fetchCache = "default-cache";

export async function GET(request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const q = String(searchParams.get("q") || "").trim();
    const requestedLimit = Number.parseInt(searchParams.get("limit") || "20", 10);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 20, 1), 60);
    const payload = await loadCatalogCardPage({
      page: 1,
      pageSize: limit,
      search: q,
      sort: "default",
    });
    return publicCatalogJson(payload);
  } catch (error) {
    return publicCatalogJson(
      { error: "Failed to search catalogue", details: error?.message || String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
