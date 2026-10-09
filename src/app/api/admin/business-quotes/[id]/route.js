import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiUser } from "@/lib/admin-api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

const schema = z.object({
  status: z.enum(["new", "reviewing", "quoted", "accepted", "declined", "closed"]),
  quotedTotal: z.number().finite().nonnegative().nullable(),
  adminNotes: z.string().trim().max(2000).nullable().optional(),
});

export async function PATCH(request, { params }) {
  const guard = await requireAdminApiUser();
  if (guard.response) return guard.response;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid update" }, { status: 400 });
  const { error } = await getSupabaseAdminClient().from("business_quote_requests").update({
    status: parsed.data.status,
    quoted_total: parsed.data.quotedTotal,
    admin_notes: parsed.data.adminNotes || null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message || "Unable to update quotation" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
