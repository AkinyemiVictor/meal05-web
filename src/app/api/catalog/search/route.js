import { loadPublicCatalogProducts, publicCatalogJson } from "@/lib/public-catalog-server";

export const runtime = "nodejs";
export const revalidate = 300;
export const fetchCache = "default-cache";

export async function GET(request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const q = String(searchParams.get("q") || "").trim();
    const payload = await loadPublicCatalogProducts({
      search: q,
      view: q ? "default" : "home",
      limit: Number(searchParams.get("limit") || 80),
    });
    return publicCatalogJson(payload);
  } catch (error) {
    return publicCatalogJson(
      { error: "Failed to search catalogue", details: error?.message || String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
