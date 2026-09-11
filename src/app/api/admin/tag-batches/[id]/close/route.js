import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin-api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request, { params }) {
  const auth = await requireAdminApiUser();
  if (auth.response) return auth.response;
  const { id } = await params;
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("close_tag_batch", { p_batch_id: id, p_administrator_id: auth.user.id });
  if (error) return NextResponse.json({ error: error.message || "Unable to close Tag Buy." }, { status: 409 });
  revalidateTag("products");
  revalidatePath("/home");
  revalidatePath("/shop");
  revalidatePath("/admin/tag-buys");
  return NextResponse.json({ ok: true, result: data });
}
