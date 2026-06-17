import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminAccess } from "@/lib/admin-access";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { logAdminEvent, logAdminError } from "@/lib/api/log";
import { respondZodError } from "@/lib/api/validate";
import {
  normalizeProductMerchandisingRecord,
  PRODUCT_MERCHANDISING_FLAGS,
  PRODUCT_MERCHANDISING_SELECT_FIELDS,
} from "@/lib/product-merchandising";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isMissingMerchandisingSchemaError = (message) =>
  /column .*is_featured.* does not exist|column .*is_hidden.* does not exist|column .*is_bestseller.* does not exist|column .*is_new_arrival.* does not exist|column .*is_homepage_pick.* does not exist|column .*is_bundle_eligible.* does not exist|schema cache/i.test(
    String(message || "")
  );

const toId = (value) => {
  const num = Number(String(value || "").trim());
  return Number.isSafeInteger(num) && num > 0 ? num : null;
};

export async function POST(req) {
  const rl = await checkRateLimit({ request: req, id: "admin:products:merchandising:save", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
  }

  const auth = getSupabaseRouteClient(await cookies());
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr) {
    await logAdminError(authErr, { route: "/api/admin/products/merchandising/save", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: authErr.message }, { status: 401 }), rl);
  }
  if (!user) {
    await logAdminError("Not authenticated", { route: "/api/admin/products/merchandising/save", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: "Not authenticated" }, { status: 401 }), rl);
  }

  const allowed = await hasAdminAccess({ userId: user.id, email: user.email });
  if (!allowed) {
    await logAdminError("Forbidden admin attempt", { route: "/api/admin/products/merchandising/save", actor: user.email });
    return applyRateLimitHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }), rl);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }), rl);
  }

  const schemaShape = PRODUCT_MERCHANDISING_FLAGS.reduce(
    (shape, flag) => ({ ...shape, [flag.field]: z.boolean() }),
    { product_id: z.union([z.string(), z.number()]) }
  );
  const parsed = z.object(schemaShape).safeParse(body || {});
  if (!parsed.success) {
    await logAdminError("Validation failed", {
      route: "/api/admin/products/merchandising/save",
      issues: parsed.error.issues,
    });
    return applyRateLimitHeaders(respondZodError(parsed.error), rl);
  }

  const productId = toId(parsed.data.product_id);
  if (!productId) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid product id" }, { status: 400 }), rl);
  }

  const admin = getSupabaseAdminClient();
  const selectFields = `id, name, is_active, ${PRODUCT_MERCHANDISING_SELECT_FIELDS}`;
  const currentRes = await admin.from("products").select(selectFields).eq("id", productId).maybeSingle();
  if (currentRes.error) {
    await logAdminError(currentRes.error, {
      route: "/api/admin/products/merchandising/save",
      actor: user.email,
      product_id: productId,
      stage: "load-product",
    });
    if (isMissingMerchandisingSchemaError(currentRes.error.message)) {
      return applyRateLimitHeaders(
        NextResponse.json({ error: "Product merchandising flags are unavailable until the merchandising migration is applied." }, { status: 409 }),
        rl
      );
    }
    return applyRateLimitHeaders(NextResponse.json({ error: currentRes.error.message }, { status: 400 }), rl);
  }

  const existingProduct = currentRes.data;
  if (!existingProduct) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Product not found" }, { status: 404 }), rl);
  }

  const productPatch = {};
  PRODUCT_MERCHANDISING_FLAGS.forEach((flag) => {
    if (existingProduct?.[flag.field] !== parsed.data[flag.field]) {
      productPatch[flag.field] = parsed.data[flag.field];
    }
  });

  if (!Object.keys(productPatch).length) {
    return applyRateLimitHeaders(NextResponse.json({ error: "No changes detected" }, { status: 400 }), rl);
  }

  const writeRes = await admin
    .from("products")
    .update(productPatch)
    .eq("id", productId)
    .select(selectFields)
    .maybeSingle();

  if (writeRes.error) {
    await logAdminError(writeRes.error, {
      route: "/api/admin/products/merchandising/save",
      actor: user.email,
      product_id: productId,
      patch: productPatch,
      stage: "update-product",
    });
    if (isMissingMerchandisingSchemaError(writeRes.error.message)) {
      return applyRateLimitHeaders(
        NextResponse.json({ error: "Product merchandising flags are unavailable until the merchandising migration is applied." }, { status: 409 }),
        rl
      );
    }
    return applyRateLimitHeaders(NextResponse.json({ error: writeRes.error.message }, { status: 400 }), rl);
  }

  const updatedProduct = writeRes.data || existingProduct;
  const normalized = normalizeProductMerchandisingRecord(updatedProduct);

  await logAdminEvent({
    route: "/api/admin/products/merchandising/save",
    actor: user.email,
    product_id: productId,
    product_name: existingProduct.name,
    before_flags: normalizeProductMerchandisingRecord(existingProduct),
    after_flags: normalized,
    ok: true,
  });

  return applyRateLimitHeaders(
    NextResponse.json({
      ok: true,
      product: {
        id: updatedProduct.id,
        name: updatedProduct.name,
        is_active: updatedProduct.is_active,
        ...normalized,
      },
    }),
    rl
  );
}
