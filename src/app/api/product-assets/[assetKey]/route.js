import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_ASSET_KEY = /^[a-z0-9][a-z0-9-]{0,119}$/;

export async function GET(_request, { params }) {
  const { assetKey } = (await params) || {};
  const key = String(assetKey || "").trim().toLowerCase();

  if (!SAFE_ASSET_KEY.test(key)) {
    return NextResponse.json({ error: "Invalid asset key" }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from("product_image_blobs")
      .select("mime_type, base64_data")
      .eq("asset_key", key)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data?.base64_data) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const bytes = Buffer.from(data.base64_data, "base64");
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": data.mime_type || "application/octet-stream",
        "Content-Length": String(bytes.length),
        // Product asset keys are intentionally stable while their blob may be replaced.
        // Browsers must revalidate, while the edge may keep a very short copy to avoid
        // hitting Supabase for every card/thumb request.
        "Cache-Control": "public, max-age=0, must-revalidate",
        "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
        "Vercel-CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Unable to load image" },
      { status: 500 }
    );
  }
}