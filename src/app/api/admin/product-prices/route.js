import { cookies } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { logAdminError, logAdminEvent } from "@/lib/api/log";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { revalidatePublicCatalog } from "@/lib/catalog-cache-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreJson = (body, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });

const readServerAdminEmails = () =>
  String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

const requireAdminEmailUser = async () => {
  const auth = getSupabaseRouteClient(await cookies());
  const {
    data: { user },
    error,
  } = await auth.auth.getUser();
  if (error || !user) {
    return { response: noStoreJson({ error: error?.message || "Not authenticated" }, 401) };
  }
  const email = String(user.email || "").trim().toLowerCase();
  const allowedEmails = readServerAdminEmails();
  if (!email || !allowedEmails.includes(email)) {
    return { response: noStoreJson({ error: "Forbidden" }, 403) };
  }
  return { user, email };
};

const toNumberOrNull = (value) => {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
};

const toBooleanFilter = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (["true", "1", "yes", "active"].includes(text)) return true;
  if (["false", "0", "no", "inactive"].includes(text)) return false;
  return null;
};

const normalizeSort = (value) => {
  const text = String(value || "category").trim().toLowerCase();
  if (["category", "product", "variant"].includes(text)) return text;
  return "category";
};

const normalizeDirection = (value) => (String(value || "asc").toLowerCase() === "desc" ? "desc" : "asc");

const compareText = (left, right, direction = "asc") => {
  const result = String(left || "").localeCompare(String(right || ""), "en", { sensitivity: "base" });
  return direction === "desc" ? -result : result;
};

const sortItems = (items, sort, direction) =>
  [...items].sort((left, right) => {
    if (sort === "product") {
      return (
        compareText(left.productName, right.productName, direction) ||
        compareText(left.variantName, right.variantName, direction) ||
        compareText(left.categoryName, right.categoryName, direction)
      );
    }
    if (sort === "variant") {
      return (
        compareText(left.variantName, right.variantName, direction) ||
        compareText(left.productName, right.productName, direction) ||
        compareText(left.categoryName, right.categoryName, direction)
      );
    }
    return (
      compareText(left.categoryName, right.categoryName, direction) ||
      compareText(left.productName, right.productName, direction) ||
      compareText(left.variantName, right.variantName, direction)
    );
  });

const mapVariantRows = ({ variants, products, categories }) => {
  const productIndex = new Map((products || []).map((row) => [String(row.id), row]));
  const categoryIndex = new Map((categories || []).map((row) => [String(row.id), row]));
  return (variants || []).map((variant) => {
    const product = productIndex.get(String(variant.product_id)) || {};
    const category = categoryIndex.get(String(product.category_id ?? "")) || {};
    return {
      variantId: variant.id,
      productId: variant.product_id,
      productName: product.name || `Product ${variant.product_id}`,
      categoryName: category.name || "Uncategorised",
      variantName: variant.name || "Default",
      unit: variant.unit || "",
      price: Number(variant.price || 0),
      oldPrice: variant.old_price == null ? null : Number(variant.old_price),
      stockCount: variant.stock_count == null ? null : Number(variant.stock_count),
      isActive: variant.is_active !== false,
      isDefault: variant.is_default === true,
    };
  });
};

const loadPriceRows = async (admin, variantIds = null) => {
  let query = admin
    .from("product_variants")
    .select("id, product_id, name, unit, price, old_price, stock_count, is_active, is_default")
    .order("product_id", { ascending: true })
    .order("id", { ascending: true });
  if (Array.isArray(variantIds) && variantIds.length) {
    query = query.in("id", variantIds);
  }
  const variantsResult = await query;
  if (variantsResult.error) throw variantsResult.error;

  const productIds = [...new Set((variantsResult.data || []).map((row) => row.product_id).filter(Boolean))];
  let products = [];
  if (productIds.length) {
    const productsResult = await admin.from("products").select("id, name, category_id").in("id", productIds);
    if (productsResult.error) throw productsResult.error;
    products = productsResult.data || [];
  }

  const categoryIds = [...new Set(products.map((row) => row.category_id).filter(Boolean))];
  let categories = [];
  if (categoryIds.length) {
    const categoriesResult = await admin.from("product_categories").select("id, name").in("id", categoryIds);
    if (categoriesResult.error) throw categoriesResult.error;
    categories = categoriesResult.data || [];
  }

  return mapVariantRows({ variants: variantsResult.data || [], products, categories });
};

const revalidateProductPriceSurfaces = () => {
  revalidateTag("products");
  revalidatePath("/home");
  revalidatePath("/shop");
  revalidatePath("/search");
  revalidatePath("/api/products");
  revalidatePublicCatalog();
};

export async function GET(request) {
  let rl = await checkRateLimit({ request, id: "admin:product-prices:get:ip", limit: 120, windowMs: 60_000 });
  if (!rl.allowed) return applyRateLimitHeaders(noStoreJson({ error: "Too many requests" }, 429), rl);

  const auth = await requireAdminEmailUser();
  if (auth.response) return applyRateLimitHeaders(auth.response, rl);

  const userRl = await checkRateLimit({ request, id: `admin:product-prices:get:user:${auth.user.id}`, limit: 120, windowMs: 60_000 });
  if (!userRl.allowed) return applyRateLimitHeaders(noStoreJson({ error: "Too many requests" }, 429), userRl);
  rl = userRl;

  const admin = getSupabaseAdminClient();
  const { searchParams } = new URL(request.url);
  const search = String(searchParams.get("search") || "").trim().toLowerCase();
  const category = String(searchParams.get("category") || "").trim().toLowerCase();
  const active = toBooleanFilter(searchParams.get("active"));
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(200, Math.max(10, Number.parseInt(searchParams.get("pageSize") || "50", 10) || 50));
  const sort = normalizeSort(searchParams.get("sort"));
  const direction = normalizeDirection(searchParams.get("direction"));

  try {
    let items = await loadPriceRows(admin);
    const categories = [...new Set(items.map((item) => item.categoryName).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "en", { sensitivity: "base" })
    );

    if (search) {
      items = items.filter((item) =>
        `${item.productName} ${item.variantName}`.toLowerCase().includes(search)
      );
    }
    if (category) {
      items = items.filter((item) => item.categoryName.toLowerCase() === category);
    }
    if (active != null) {
      items = items.filter((item) => item.isActive === active);
    }

    const sorted = sortItems(items, sort, direction);
    const total = sorted.length;
    const start = (page - 1) * pageSize;
    const paged = sorted.slice(start, start + pageSize);

    return applyRateLimitHeaders(
      noStoreJson({
        items: paged,
        categories,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
        sort: { field: sort, direction },
      }),
      rl
    );
  } catch (error) {
    await logAdminError(error, { route: "/api/admin/product-prices", actor: auth.email, stage: "get" });
    return applyRateLimitHeaders(noStoreJson({ error: error.message || "Unable to load product prices." }, 500), rl);
  }
}

const updateSchema = z
  .object({
    variantId: z.union([z.string(), z.number()]),
    price: z.coerce.number().finite().positive(),
    oldPrice: z.union([z.coerce.number().finite().nonnegative(), z.null()]).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.oldPrice != null && Number(value.oldPrice) < Number(value.price)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["oldPrice"],
        message: "oldPrice must be greater than or equal to price",
      });
    }
  });

const patchSchema = z
  .object({
    updates: z.array(updateSchema).min(1).max(200),
  })
  .strict();

export async function PATCH(request) {
  let rl = await checkRateLimit({ request, id: "admin:product-prices:patch:ip", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return applyRateLimitHeaders(noStoreJson({ error: "Too many requests" }, 429), rl);

  const auth = await requireAdminEmailUser();
  if (auth.response) return applyRateLimitHeaders(auth.response, rl);

  const userRl = await checkRateLimit({ request, id: `admin:product-prices:patch:user:${auth.user.id}`, limit: 40, windowMs: 60_000 });
  if (!userRl.allowed) return applyRateLimitHeaders(noStoreJson({ error: "Too many requests" }, 429), userRl);
  rl = userRl;

  let body;
  try {
    body = await request.json();
  } catch {
    return applyRateLimitHeaders(noStoreJson({ error: "Invalid JSON payload" }, 400), rl);
  }

  const parsed = patchSchema.safeParse(body || {});
  if (!parsed.success) {
    await logAdminError("Invalid product price update payload", {
      route: "/api/admin/product-prices",
      actor: auth.email,
      stage: "validation",
      issues: parsed.error.issues,
    });
    return applyRateLimitHeaders(noStoreJson({ error: "Validation failed", issues: parsed.error.issues }, 400), rl);
  }

  const admin = getSupabaseAdminClient();
  const updates = parsed.data.updates.map((update) => ({
    variantId: Number(update.variantId),
    price: toNumberOrNull(update.price),
    oldPrice: update.oldPrice == null ? null : toNumberOrNull(update.oldPrice),
  }));
  if (updates.some((update) => !Number.isSafeInteger(update.variantId) || update.variantId <= 0 || update.price == null || update.price <= 0)) {
    return applyRateLimitHeaders(noStoreJson({ error: "Each update needs a valid variantId and positive price." }, 400), rl);
  }

  const ids = [...new Set(updates.map((update) => update.variantId))];
  if (ids.length !== updates.length) {
    return applyRateLimitHeaders(noStoreJson({ error: "Duplicate variantId values are not allowed in one request." }, 400), rl);
  }

  try {
    const existing = await loadPriceRows(admin, ids);
    if (existing.length !== ids.length) {
      return applyRateLimitHeaders(noStoreJson({ error: "One or more variants were not found." }, 404), rl);
    }

    for (const update of updates) {
      const { error } = await admin
        .from("product_variants")
        .update({
          price: update.price,
          old_price: update.oldPrice,
          updated_at: new Date().toISOString(),
        })
        .eq("id", update.variantId);
      if (error) throw error;
    }

    const items = sortItems(await loadPriceRows(admin, ids), "product", "asc");
    revalidateProductPriceSurfaces();
    await logAdminEvent({
      route: "/api/admin/product-prices",
      actor: auth.email,
      action: "product_prices_updated",
      variant_ids: ids,
      count: ids.length,
      cache_revalidated: true,
    });

    return applyRateLimitHeaders(noStoreJson({ ok: true, items, updated: items }), rl);
  } catch (error) {
    await logAdminError(error, {
      route: "/api/admin/product-prices",
      actor: auth.email,
      stage: "patch",
      variant_ids: ids,
    });
    return applyRateLimitHeaders(noStoreJson({ error: error.message || "Unable to update product prices." }, 500), rl);
  }
}
