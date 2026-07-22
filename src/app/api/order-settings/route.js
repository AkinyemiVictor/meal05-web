import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { loadPublicOrderSettings } from "@/lib/order-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await loadPublicOrderSettings(getSupabaseAdminClient());
  return NextResponse.json(settings, {
    headers: {
      "Cache-Control": "public, max-age=30, s-maxage=60",
    },
  });
}
