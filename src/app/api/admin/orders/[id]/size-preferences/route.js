import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/admin-access";
import {
  SELECTION_MODE_FLEXIBLE,
  SIZE_PREFERENCE_LABELS,
  normalizeSizePreference,
} from "@/lib/commerce-options";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export async function GET(_request, { params }) {
  const { id } = await params;
  const orderId = String(id || "").trim();
  if (!orderId) return NextResponse.json({ error: "Order id is required" }, { status: 400 });

  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!await hasAdminAccess({ userId: user.id, email: user.email })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("order_items")
    .select("id, product_id, variant_id, size_preference, products(name)")
    .eq("order_id", orderId)
    .not("size_preference", "is", null)
    .range(0, 499);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const preferences = (Array.isArray(data) ? data : [])
    .map((row) => {
      const value = normalizeSizePreference(row?.size_preference, SELECTION_MODE_FLEXIBLE);
      if (!value) return null;
      const product = Array.isArray(row?.products) ? row.products[0] : row?.products;
      return {
        itemId: row?.id,
        productId: row?.product_id,
        variantId: row?.variant_id ?? null,
        productName: String(product?.name || `Product ${row?.product_id || ""}`).trim(),
        value,
        label: SIZE_PREFERENCE_LABELS[value] || value,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ preferences }, { headers: { "Cache-Control": "no-store" } });
}
