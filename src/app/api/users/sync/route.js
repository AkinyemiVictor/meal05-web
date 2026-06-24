import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  first_name: z.string().min(1).max(120).optional(),
  last_name: z.string().min(1).max(120).optional(),
  phone: z.string().min(4).max(32).optional(),
});

export async function PUT(request) {
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user }, error: authErr } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: authErr?.message || "Not authenticated" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = payloadSchema.safeParse(body || {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const patch = {
    id: user.id, // prefer id as PK if present
    user_id: user.id, // also set user_id for alt schemas
    email: user.email,
    ...parsed.data,
  };

  const { data, error } = await auth.from("users").upsert(patch).select("id, first_name, last_name, email, phone").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ user: data || patch }, { status: 200 });
}
