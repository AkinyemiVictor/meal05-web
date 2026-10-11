import { loadPublicCatalogProducts, publicCatalogJson } from "@/lib/public-catalog-server";

export const runtime = "nodejs";
export const revalidate = 300;
export const fetchCache = "default-cache";

export async function GET(request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const ids = String(searchParams.get("ids") || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const payload = await loadPublicCatalogProducts({ ids, limit: Math.min(ids.length || 1, 80) });
    return publicCatalogJson(payload);
  } catch (error) {
    return publicCatalogJson(
      { error: "Failed to load requested products", details: error?.message || String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
