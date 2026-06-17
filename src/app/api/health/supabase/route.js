import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function pingPublic() {
  try {
    const client = getSupabaseRouteClient(await cookies());
    const start = Date.now();
    const { error } = await client.from("products").select("id").limit(1);
    const ms = Date.now() - start;
    return { ok: !error, ms, error: error?.message || null };
  } catch (e) {
    return { ok: false, ms: null, error: e?.message || String(e) };
  }
}

async function pingAdmin() {
  try {
    const admin = getSupabaseAdminClient();
    const start = Date.now();
    const { error } = await admin.from("products").select("id").limit(1);
    const ms = Date.now() - start;
    return { ok: !error, ms, error: error?.message || null };
  } catch (e) {
    return { ok: false, ms: null, error: e?.message || String(e) };
  }
}

export async function GET() {
  const [pub, admin] = await Promise.all([pingPublic(), pingAdmin()]);
  const status = pub.ok && admin.ok ? 200 : 500;
  return NextResponse.json({
    service: "supabase",
    time: Date.now(),
    public: pub,
    admin,
  }, { status });
}

