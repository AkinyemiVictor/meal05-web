import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { loadMarketCatalog } from "@/lib/market-catalog-server";
import { resolveProductImage } from "@/lib/product-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_PRODUCT_ID = /^\d+$/;
const ALLOWED_SIZES = new Set(["thumb", "card", "detail"]);

const pickImage = (row, size) => {
  if (!row) return "";
  if (size === "detail") {
    return resolveProductImage(
      row.detail_image_url,
      row.card_image_url,
      row.thumb_image_url,
      row.main_image_url
    );
  }
  if (size === "card") {
    return resolveProductImage(
      row.card_image_url,
      row.thumb_image_url,
      row.detail_image_url,
      row.main_image_url
    );
  }
  return resolveProductImage(
    row.thumb_image_url,
    row.card_image_url,
    row.detail_image_url,
    row.main_image_url
  );
};

export async function GET(request, { params }) {
  const { id: rawId } = (await params) || {};
  const id = String(rawId || "").trim();
  if (!SAFE_PRODUCT_ID.test(id)) {
    return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
  }

  const requestedSize = new URL(request.url).searchParams.get("size") || "thumb";
  const size = ALLOWED_SIZES.has(requestedSize) ? requestedSize : "thumb";

  try {
    const admin = getSupabaseAdminClient();
    const catalog = await loadMarketCatalog(admin);
    const { data: catalogRow, error: catalogError } = await admin
      .from("product_card_catalog")
      .select("product_id, main_image_url, thumb_image_url, card_image_url, detail_image_url")
      .eq("market_id", catalog.market.id)
      .eq("product_id", id)
      .maybeSingle();

    if (catalogError) {
      return NextResponse.json({ error: catalogError.message }, { status: 500 });
    }

    let image = catalogRow ? pickImage(catalogRow, size) : "";

    if (!image) {
      const { data: productRow, error: productError } = await admin
        .from("products")
        .select("main_image_url")
        .eq("id", id)
        .maybeSingle();
      if (productError) {
        return NextResponse.json({ error: productError.message }, { status: 500 });
      }
      image = resolveProductImage(productRow?.main_image_url);
    }

    if (!image || image === "/assets/img/product-placeholder.svg") {
      return NextResponse.json({ error: "Product image not found" }, { status: 404 });
    }

    const destination = new URL(image, request.url);
    const current = new URL(request.url);
    if (destination.pathname === current.pathname) {
      return NextResponse.json({ error: "Invalid product image target" }, { status: 500 });
    }

    return new Response(null, {
      status: 307,
      headers: {
        Location: destination.toString(),
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Unable to resolve product image" },
      { status: 500 }
    );
  }
}