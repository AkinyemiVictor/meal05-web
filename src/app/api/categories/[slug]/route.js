import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabasePublicConfig } from "@/lib/config/supabase";
import { loadCategoryProductsPayload } from "@/lib/category-products";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(_request, { params }) {
  try {
    if (!supabasePublicConfig?.url || !supabasePublicConfig?.anonKey) {
      return NextResponse.json(
        { error: "Supabase public credentials are missing." },
        { status: 500 }
      );
    }

    const { slug } = await params;
    let supabase = getSupabaseRouteClient(await cookies());
    let payload = null;
    let error = null;

    try {
      payload = await loadCategoryProductsPayload(supabase, slug);
    } catch (err) {
      error = err;
    }

    if (error && process.env.NODE_ENV !== "production") {
      try {
        supabase = getSupabaseAdminClient();
        payload = await loadCategoryProductsPayload(supabase, slug);
        error = null;
      } catch (adminErr) {
        error = adminErr;
      }
    }

    if (error) {
      return NextResponse.json(
        { error: "Failed to load category from Supabase", details: error?.message || String(error) },
        { status: 500 }
      );
    }

    if (!payload?.category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        category: payload.category,
        products: payload.products,
        categories: payload.categories,
      },
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
      { error: "Unexpected server error while loading category", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
