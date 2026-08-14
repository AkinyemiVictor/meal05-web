import { cookies } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { hasAdminAccess } from "@/lib/admin-access";
import { buildProductSlug } from "@/lib/products";
import { toCategorySlug } from "@/lib/categories-server";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { logAdminError, logAdminEvent } from "@/lib/api/log";
import { revalidatePublicCatalog } from "@/lib/catalog-cache-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_REASONABLE_PRICE = 50;
const MAX_REASONABLE_PRICE = 10_000_000;
const LARGE_CHANGE_RATIO = 0.5;

const toPositiveInt = (value) => {
  const num = Number(value);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
};

const normalizePrice = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100) / 100;
};

const revalidatePriceSurfaces = ({ product, category }) => {
  const productSlug = buildProductSlug(product);
  const categorySlug = toCategorySlug(category?.slug || category?.name || "");

  revalidatePath("/home");
  revalidatePath("/shop");
  revalidatePath("/search");
  revalidatePath("/api/products");
  revalidatePath(`/api/products/${product.id}`);
  revalidatePath(`/products/${productSlug}`);

  if (categorySlug) {
    revalidatePath(`/categories/${categorySlug}`);
    revalidateTag(`category-products:${categorySlug}`);
  }
};

export async function POST(req) {
  const rl = await checkRateLimit({ request: req, id: "admin:prices:update", limit: 120, windowMs: 60_000 });
  if (!rl.allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
  }

  const auth = getSupabaseRouteClient(await cookies());
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();

  if (authErr || !user) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: authErr?.message || "Not authenticated" }, { status: 401 }),
      rl
    );
  }

  const allowed = await hasAdminAccess({ userId: user.id, email: user.email });
  if (!allowed) {
    await logAdminError("Forbidden admin price update attempt", { route: "/api/admin/prices/update", actor: user.email });
    return applyRateLimitHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }), rl);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }), rl);
  }

  const schema = z.object({
    product_id: z.union([z.string(), z.number()]),
    variant_id: z.union([z.string(), z.number()]),
    price: z.union([z.string(), z.number()]),
    confirm_large_change: z.boolean().optional(),
  });
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid price update request" }, { status: 400 }), rl);
  }

  const productId = toPositiveInt(parsed.data.product_id);
  const variantId = toPositiveInt(parsed.data.variant_id);
  const nextPrice = normalizePrice(parsed.data.price);
  if (!productId || !variantId) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid product or variant id" }, { status: 400 }), rl);
  }
  if (nextPrice == null || nextPrice < MIN_REASONABLE_PRICE) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: `Price must be at least ₦${MIN_REASONABLE_PRICE.toLocaleString("en-NG")}.` }, { status: 400 }),
      rl
    );
  }
  if (nextPrice > MAX_REASONABLE_PRICE) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Price is too high to save safely." }, { status: 400 }), rl);
  }

  const admin = getSupabaseAdminClient();
  const [variantRes, productRes] = await Promise.all([
    admin
      .from("product_variants")
      .select("id, product_id, price, currency_code, is_active")
      .eq("id", variantId)
      .maybeSingle(),
    admin
      .from("products")
      .select("id, name, category_id, is_price_volatile, is_active")
      .eq("id", productId)
      .maybeSingle(),
  ]);

  if (variantRes.error) {
    await logAdminError(variantRes.error, { route: "/api/admin/prices/update", variant_id: variantId });
    return applyRateLimitHeaders(NextResponse.json({ error: variantRes.error.message }, { status: 400 }), rl);
  }
  if (productRes.error) {
    await logAdminError(productRes.error, { route: "/api/admin/prices/update", product_id: productId });
    return applyRateLimitHeaders(NextResponse.json({ error: productRes.error.message }, { status: 400 }), rl);
  }

  const variant = variantRes.data;
  const product = productRes.data;
  if (!variant || !product) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Product or variant not found" }, { status: 404 }), rl);
  }
  if (Number(variant.product_id) !== Number(productId)) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Variant does not belong to product" }, { status: 409 }), rl);
  }
  if (product.is_price_volatile !== true) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Product is not marked volatile" }, { status: 409 }), rl);
  }
  if (product.is_active === false || variant.is_active === false) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Cannot update inactive product or variant here" }, { status: 409 }), rl);
  }

  const oldPrice = normalizePrice(variant.price);
  if (oldPrice == null) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Current price is invalid" }, { status: 409 }), rl);
  }
  if (oldPrice === nextPrice) {
    return applyRateLimitHeaders(
      NextResponse.json({ ok: true, unchanged: true, variant: { id: variant.id, price: oldPrice } }),
      rl
    );
  }

  const changeRatio = oldPrice > 0 ? Math.abs(nextPrice - oldPrice) / oldPrice : 1;
  if (changeRatio > LARGE_CHANGE_RATIO && parsed.data.confirm_large_change !== true) {
    return applyRateLimitHeaders(
      NextResponse.json(
        {
          error: `Large change detected: ₦${oldPrice.toLocaleString("en-NG")} → ₦${nextPrice.toLocaleString("en-NG")}.`,
          requiresConfirmation: true,
        },
        { status: 409 }
      ),
      rl
    );
  }

  const updateRes = await admin
    .from("product_variants")
    .update({ price: nextPrice, updated_at: new Date().toISOString() })
    .eq("id", variantId)
    .select("id, product_id, price, currency_code")
    .maybeSingle();

  if (updateRes.error) {
    await logAdminError(updateRes.error, {
      route: "/api/admin/prices/update",
      product_id: productId,
      variant_id: variantId,
      stage: "variant-update",
    });
    return applyRateLimitHeaders(NextResponse.json({ error: updateRes.error.message }, { status: 400 }), rl);
  }

  const historyRes = await admin.from("variant_price_history").insert({
    variant_id: variantId,
    old_price: oldPrice,
    new_price: nextPrice,
    changed_by: user.id,
  });

  if (historyRes.error) {
    await logAdminError(historyRes.error, {
      route: "/api/admin/prices/update",
      product_id: productId,
      variant_id: variantId,
      stage: "history-insert",
    });
    return applyRateLimitHeaders(NextResponse.json({ error: historyRes.error.message }, { status: 400 }), rl);
  }

  let category = null;
  if (product.category_id != null) {
    const categoryRes = await admin
      .from("product_categories")
      .select("id, name, slug")
      .eq("id", product.category_id)
      .maybeSingle();
    if (!categoryRes.error) category = categoryRes.data;
  }

  revalidatePriceSurfaces({ product, category });
  revalidatePublicCatalog();

  await logAdminEvent({
    route: "/api/admin/prices/update",
    actor: user.email,
    product_id: productId,
    product_name: product.name,
    variant_id: variantId,
    before_price: oldPrice,
    after_price: nextPrice,
    price_change_ratio: changeRatio,
    cache_revalidated: true,
    ok: true,
  });

  return applyRateLimitHeaders(
    NextResponse.json({
      ok: true,
      product: {
        id: product.id,
        name: product.name,
        slug: buildProductSlug(product),
        categorySlug: toCategorySlug(category?.slug || category?.name || ""),
      },
      variant: {
        id: updateRes.data?.id || variantId,
        product_id: updateRes.data?.product_id || productId,
        price: Number(updateRes.data?.price ?? nextPrice),
        currency_code: updateRes.data?.currency_code || variant.currency_code || "NGN",
      },
      invalidated: true,
    }),
    rl
  );
}
