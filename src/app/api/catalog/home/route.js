import { loadPublicCatalogProducts, publicCatalogJson } from "@/lib/public-catalog-server";

export const runtime = "nodejs";
export const revalidate = 300;
export const fetchCache = "default-cache";

export async function GET(request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const limit = Number(searchParams.get("limit") || 72);
    const payload = await loadPublicCatalogProducts({ view: "home", limit });
    return publicCatalogJson(payload);
  } catch (error) {
    return publicCatalogJson(
      { error: "Failed to load home catalogue", details: error?.message || String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
