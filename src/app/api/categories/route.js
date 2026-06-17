import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabasePublicConfig } from "@/lib/config/supabase";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { loadCategoryCounts, loadCategoryRows, mapCategoryRows } from "@/lib/categories-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    if (!supabasePublicConfig?.url || !supabasePublicConfig?.anonKey) {
      return NextResponse.json(
        { error: "Supabase public credentials are missing." },
        { status: 500 }
      );
    }

    let supabase = getSupabaseRouteClient(await cookies());
    let rows = [];
    let error = null;

    try {
      rows = await loadCategoryRows(supabase);
    } catch (err) {
      error = err;
    }

    if (error && process.env.NODE_ENV !== "production") {
      try {
        supabase = getSupabaseAdminClient();
        rows = await loadCategoryRows(supabase);
        error = null;
      } catch (adminErr) {
        error = adminErr;
      }
    }

    if (error) {
      return NextResponse.json(
        { error: "Failed to load categories from Supabase", details: error?.message || String(error) },
        { status: 500 }
      );
    }

    const counts = await loadCategoryCounts(supabase);
    const categories = mapCategoryRows(rows, counts).map((category) => ({
      id: category.id,
      name: category.name || category.label,
      label: category.label,
      slug: category.slug,
      description: category.description || "",
      image_url: category.image_url || "",
      icon: category.icon,
      product_count: category.product_count || 0,
      available_product_count: category.available_product_count || 0,
      count: category.count || 0,
    }));

    return NextResponse.json(
      { categories },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
          "Surrogate-Control": "no-store",
          "Vercel-CDN-Cache-Control": "no-store",
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Unexpected server error while loading categories", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
