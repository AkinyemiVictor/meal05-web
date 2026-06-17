import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import {
  BANNER_TABLE_NAME,
  DEFAULT_BANNER_PLACEMENT,
  HERO_BANNER_BUCKET,
  buildMobileCandidates,
  inferMobileImage,
  isBannerVisibleNow,
  normalizeBannerPlacement,
  normalizeBannerRecord,
  sortBanners,
} from "@/lib/banners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const DEFAULT_LIMIT = 20;

const listBucketFiles = async (client) => {
  const { data, error } = await client.storage
    .from(HERO_BANNER_BUCKET)
    .list("", { limit: 200, sortBy: { column: "name", order: "asc" } });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
};

async function queryBanners(client, { limit = DEFAULT_LIMIT } = {}) {
  return client.from(BANNER_TABLE_NAME).select("*", { head: false }).limit(limit);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const placement = normalizeBannerPlacement(searchParams.get("placement") || DEFAULT_BANNER_PLACEMENT);
    const limitRaw = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.trunc(limitRaw))) : DEFAULT_LIMIT;

    const supabase = getSupabaseRouteClient(await cookies());
    let { data, error } = await queryBanners(supabase, { limit });

    if (error) {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
      }

      try {
        const admin = getSupabaseAdminClient();
        const res = await queryBanners(admin, { limit });
        data = res.data;
        error = res.error;
      } catch (adminError) {
        error = adminError;
      }

      if (error) {
        return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
      }
    }

    const rows = Array.isArray(data) ? data : [];
    const mapped = rows.map(normalizeBannerRecord).filter(Boolean);

    let mobileCandidates = [];
    try {
      const files = await listBucketFiles(supabase);
      mobileCandidates = buildMobileCandidates(supabase, files);
    } catch {
      if (process.env.NODE_ENV !== "production") {
        try {
          const admin = getSupabaseAdminClient();
          const files = await listBucketFiles(admin);
          mobileCandidates = buildMobileCandidates(admin, files);
        } catch {}
      }
    }

    const banners = sortBanners(
      mapped
        .map((banner) => {
          if (banner.mobileImage) return banner;
          const inferred = inferMobileImage(banner.image, mobileCandidates);
          return inferred ? { ...banner, mobileImage: inferred } : banner;
        })
        .filter((banner) => banner.placement === placement)
        .filter((banner) => isBannerVisibleNow(banner))
    );

    return NextResponse.json(
      { banners },
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
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch banners" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
          "Surrogate-Control": "no-store",
        },
      }
    );
  }
}
