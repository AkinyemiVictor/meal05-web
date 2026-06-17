import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminAccess } from "@/lib/admin-access";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILTER_TO_TYPE = {
  events: "event",
  errors: "error",
};

export async function GET(request) {
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user } } = await auth.auth.getUser();
  const allowed = user ? await hasAdminAccess({ userId: user.id, email: user.email }) : false;
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const qp = Object.fromEntries(url.searchParams.entries());
  const schema = z.object({
    type: z.enum(["errors", "events"]).optional().default("errors"),
    limit: z.coerce.number().int().min(1).max(500).optional().default(50),
    offset: z.coerce.number().int().min(0).optional().default(0),
  });
  const parsed = schema.safeParse(qp);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", issues: parsed.error.issues }, { status: 400 });
  }
  const { type, limit, offset } = parsed.data;

  const admin = getSupabaseAdminClient();
  const start = offset;
  const end = offset + limit - 1;
  const logType = FILTER_TO_TYPE[type];

  const { data, error } = await admin
    .from("admin_logs")
    .select("id, type, route, actor, message, metadata, created_at")
    .eq("type", logType)
    .order("created_at", { ascending: false })
    .range(start, end);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = Array.isArray(data) ? data : [];
  const items = rows.map((row) => ({
    id: row.id,
    type: row.type,
    route: row.route,
    actor: row.actor,
    message: row.message,
    created_at: row.created_at,
    metadata: row.metadata ?? {},
  }));

  return NextResponse.json({
    type,
    offset,
    limit,
    items,
    nextOffset: offset + items.length,
  }, { status: 200 });
}
