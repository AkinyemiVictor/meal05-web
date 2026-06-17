import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { isTrustedRequestOrigin } from "@/lib/api/request-origin";
import { logAdminError, logAdminEvent } from "@/lib/api/log";
import { sendOrderReceiptEmail } from "@/lib/notify";
import { resolveProductImage } from "@/lib/product-image";
import { applyPromoToOrderSummary, computeOrderSummary } from "@/lib/order-pricing";
import { getDeliverySummaryConfig } from "@/lib/delivery-settings";
import { loadDeliverySettings } from "@/lib/delivery-settings-server";
import { isMissingPromoCodeSchemaError, validatePromoCode } from "@/lib/promo-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedMethodsHeader = { Allow: "GET, POST" };
const tooManyRequests = (rl) => applyRateLimitHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
const variantInactiveThresholdRaw =
  process.env.NEXT_PUBLIC_VARIANT_INACTIVE_STOCK_THRESHOLD ??
  process.env.VARIANT_INACTIVE_STOCK_THRESHOLD;
const variantInactiveThreshold = Number(variantInactiveThresholdRaw);
const variantInactiveStockThreshold = Number.isFinite(variantInactiveThreshold)
  ? Math.max(0, Math.floor(variantInactiveThreshold))
  : 5;

export async function POST(request) {
  let rl = await checkRateLimit({ request, id: "orders:create:ip", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);
  if (!isTrustedRequestOrigin(request)) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Forbidden origin" }, { status: 403 }), rl);
  }

  const admin = getSupabaseAdminClient();
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user: cookieUser }, error: authErr } = await auth.auth.getUser();
  let user = cookieUser || null;
  if (!user) {
    const header = request.headers.get("authorization") || request.headers.get("Authorization") || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (token) {
      try {
        const { data: tokenData, error: tokenErr } = await admin.auth.getUser(token);
        if (!tokenErr && tokenData?.user) {
          user = tokenData.user;
        }
      } catch {
        /* noop */
      }
    }
  }
  if (authErr && !user) return applyRateLimitHeaders(NextResponse.json({ error: authErr.message }, { status: 401 }), rl);
  if (!user) return applyRateLimitHeaders(NextResponse.json({ error: "Not authenticated" }, { status: 401 }), rl);

  const userRl = await checkRateLimit({
    request,
    id: `orders:create:user:${user.id}`,
    limit: 8,
    windowMs: 60_000,
  });
  if (!userRl.allowed) return tooManyRequests(userRl);
  rl = userRl;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 }), rl);
  }

  const schema = z.object({
    deliveryAddress: z.string().max(500).optional().default(""),
    deliveryCity: z.string().max(120).optional().default(""),
    note: z.string().max(500).optional(),
    paymentMethod: z.string().max(64).optional().default("paystack"),
    promo_code: z.string().trim().max(64).optional(),
    items: z
      .array(
        z.object({
          product_id: z.union([z.string(), z.number()]).optional(),
          variant_id: z.union([z.string(), z.number()]).optional(),
          quantity: z.number().int().positive().max(9999).optional(),
          unit_price_at_add: z.number().nonnegative().optional(),
          variant_name: z.string().max(200).optional(),
          product_name: z.string().max(200).optional(),
        })
      )
      .optional(),
  });
  const parsed = schema.safeParse(payload || {});
  if (!parsed.success) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 }), rl);
  }

  const parseAvailableStock = (row) => {
    if (!row) return undefined;
    if (row.stock_count != null && Number.isFinite(Number(row.stock_count))) {
      return Math.max(0, Number(row.stock_count));
    }
    if (row.stock != null && Number.isFinite(Number(row.stock))) {
      return Math.max(0, Number(row.stock));
    }
    if (typeof row.stock === "string") {
      const digits = row.stock.match(/(\d+)/);
      if (digits && digits[1]) {
        const n = Number(digits[1]);
        if (Number.isFinite(n)) return Math.max(0, n);
      }
      if (row.stock.toLowerCase().includes("out")) return 0;
    }
    return undefined; // unknown/undocumented treated as unavailable
  };

  const isUnknownColumnError = (message) => {
    const errorText = String(message || "");
    return (
      /schema cache/i.test(errorText) ||
      /column .* does not exist/i.test(errorText) ||
      /could not find the .* column/i.test(errorText) ||
      /relation .* does not exist/i.test(errorText)
    );
  };
  const normalizePayloadCartItems = (rawItems) => {
    if (!Array.isArray(rawItems)) return [];
    return rawItems
      .map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const productId = item.product_id ?? item.productId ?? null;
        const variantId = item.variant_id ?? item.variantId ?? null;
        const qtyRaw = Number(item.quantity);
        const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.round(qtyRaw) : 1;
        if (productId == null && variantId == null) return null;
        return {
          id: item.id ?? `payload-${index + 1}`,
          product_id: productId != null ? String(productId) : null,
          variant_id: variantId != null ? String(variantId) : null,
          quantity,
          unit_price_at_add:
            item.unit_price_at_add != null && Number.isFinite(Number(item.unit_price_at_add))
              ? Number(item.unit_price_at_add)
              : null,
          variant_name: item.variant_name || item.variantName || null,
          product_name: item.product_name || item.productName || null,
        };
      })
      .filter(Boolean);
  };

  // 1) Fetch cart items with schema fallbacks
  const cartSelectCandidates = [
    {
      select: "id, product_id, variant_id, quantity, unit_price_at_add, variant_name, product_name",
      hasVariant: true,
    },
    {
      select: "id, product_id, variant_id, quantity, unit_price_at_add, product_name",
      hasVariant: true,
    },
    {
      select: "id, product_id, variant_id, quantity, unit_price_at_add",
      hasVariant: true,
    },
    {
      select: "id, product_id, quantity, unit_price_at_add, product_name",
      hasVariant: false,
    },
    {
      select: "id, product_id, quantity, unit_price_at_add",
      hasVariant: false,
    },
    {
      select: "id, product_id, quantity, product_name",
      hasVariant: false,
    },
    {
      select: "id, product_id, quantity",
      hasVariant: false,
    },
  ];
  const payloadCartItems = normalizePayloadCartItems(parsed.data.items);
  let cart = payloadCartItems;
  let cartShape = {
    hasVariant: payloadCartItems.some((row) => row?.variant_id != null),
  };
  let cartErr = null;
  if (!cart.length) {
    cartShape = cartSelectCandidates[cartSelectCandidates.length - 1];
    for (const candidate of cartSelectCandidates) {
      const result = await admin.from("cart_items").select(candidate.select).eq("user_id", user.id);
      if (!result.error) {
        cart = Array.isArray(result.data) ? result.data : [];
        cartShape = candidate;
        cartErr = null;
        break;
      }
      cartErr = result.error;
      if (isUnknownColumnError(result.error.message)) continue;
      break;
    }
  }
  if (cartErr) return applyRateLimitHeaders(NextResponse.json({ error: cartErr.message }, { status: 400 }), rl);
  if (cart.length === 0) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Cart is empty" }, { status: 400 }), rl);
  }

  const productIds = Array.from(
    new Set(
      cart
        .map((row) => row?.product_id)
        .filter((id) => id != null)
        .map((id) => String(id))
    )
  );
  const payloadVariantIds = Array.from(
    new Set(
      cart
        .map((row) => row?.variant_id)
        .filter((id) => id != null)
        .map((id) => String(id))
    )
  );
  const hasMissingVariantIds = cart.some((row) => row?.variant_id == null);
  const needsProductNames = cart.some((row) => !(row?.product_name || row?.variant_name));
  let productNameIndex = new Map();

  const variantSelectCandidates = [
    "id, product_id, name, price, unit, stock_count, stock, is_default",
    "id, product_id, name, price, unit, stock_count, is_default",
    "id, product_id, name, price, unit, stock, is_default",
    "id, product_id, name, price, unit, is_default",
    "id, product_id, name, price, unit",
    "id, product_id, name, price",
    "id, product_id, name",
    "id, product_id",
  ];
  let variantRows = [];
  if (payloadVariantIds.length || productIds.length) {
    for (const select of variantSelectCandidates) {
      const result = !hasMissingVariantIds && payloadVariantIds.length
        ? await admin.from("product_variants").select(select).in("id", payloadVariantIds)
        : await admin.from("product_variants").select(select).in("product_id", productIds);
      if (!result.error) {
        variantRows = Array.isArray(result.data) ? result.data : [];
        break;
      }
      if (isUnknownColumnError(result.error.message)) continue;
      break;
    }
  }

  if (needsProductNames && productIds.length) {
    const { data: productRows } = await admin
      .from("products")
      .select("id, name")
      .in("id", productIds);
    productNameIndex = new Map((Array.isArray(productRows) ? productRows : []).map((row) => [String(row.id), row?.name || ""]));
  }
  const variantIndex = new Map(variantRows.map((row) => [String(row.id), row]));
  const variantsByProduct = new Map();
  variantRows.forEach((row) => {
    const productId = row?.product_id;
    if (productId == null) return;
    const key = String(productId);
    if (!variantsByProduct.has(key)) variantsByProduct.set(key, []);
    variantsByProduct.get(key).push(row);
  });
  const pickPreferredVariant = (rows = []) => {
    if (!Array.isArray(rows) || !rows.length) return null;
    const defaults = rows.filter((row) => row?.is_default === true);
    if (defaults.length) return defaults[0];
    const priced = rows
      .filter((row) => Number.isFinite(Number(row?.price)))
      .sort((a, b) => Number(a.price) - Number(b.price));
    if (priced.length) return priced[0];
    return rows[0] || null;
  };
  const preferredVariantByProduct = new Map();
  variantsByProduct.forEach((rows, productId) => {
    const preferred = pickPreferredVariant(rows);
    if (preferred) preferredVariantByProduct.set(String(productId), preferred);
  });
  const resolveCartVariant = (row) => {
    const variantId = row?.variant_id != null ? String(row.variant_id) : "";
    if (variantId && variantIndex.has(variantId)) return variantIndex.get(variantId);
    const productId = row?.product_id != null ? String(row.product_id) : "";
    if (productId && preferredVariantByProduct.has(productId)) return preferredVariantByProduct.get(productId);
    return null;
  };

  const resolveCartItemName = (row) => {
    const productId = row?.product_id != null ? String(row.product_id) : "";
    const variant = resolveCartVariant(row);
    return row?.variant_name || variant?.name || row?.product_name || productNameIndex.get(productId) || "";
  };
  const cartVariantNames = new Map();
  const cartProductNames = new Map();
  cart.forEach((row) => {
    const variant = resolveCartVariant(row);
    const variantId = variant?.id;
    const productId = row?.product_id;
    const name = resolveCartItemName(row);
    if (variantId != null && name && !cartVariantNames.has(String(variantId))) {
      cartVariantNames.set(String(variantId), name);
    }
    const productName = row?.product_name || (productId != null ? productNameIndex.get(String(productId)) : "") || name;
    if (productId != null && productName && !cartProductNames.has(String(productId))) {
      cartProductNames.set(String(productId), productName);
    }
  });

  // 1b) Aggregate quantities per variant for stock validation
  const variantQuantities = new Map();
  const issues = [];
  if (cartShape.hasVariant) {
    cart.forEach((row) => {
      const qty = Number(row?.quantity) || 0;
      if (qty <= 0) return;
      const variant = resolveCartVariant(row);
      const variantId = variant?.id != null ? String(variant.id) : "";
      if (!variantId) return;
      variantQuantities.set(variantId, (variantQuantities.get(variantId) || 0) + qty);
    });
  }
  if (cartShape.hasVariant && variantQuantities.size) {
    variantQuantities.forEach((requested, variantId) => {
      const row = variantIndex.get(variantId);
      if (!row) {
        issues.push({
          variantId,
          error: "Variant missing",
          product: cartVariantNames.get(variantId) || "",
        });
        return;
      }
      const label =
        row?.name ||
        cartVariantNames.get(variantId) ||
        (row?.product_id != null ? cartProductNames.get(String(row.product_id)) : "") ||
        "";
      const availableRaw = parseAvailableStock(row);
      if (availableRaw === undefined) {
        issues.push({
          variantId,
          productId: row?.product_id ?? null,
          requested,
          available: null,
          product: label,
          message: "Stock data unavailable",
        });
        return;
      }
      if (availableRaw === null) {
        return;
      }
      const available = Number(availableRaw) || 0;
      if (available <= 0) {
        issues.push({
          variantId,
          productId: row?.product_id ?? null,
          requested,
          available,
          product: label,
          message: "Out of stock",
        });
      }
      if (available > 0 && available <= variantInactiveStockThreshold) {
        issues.push({
          variantId,
          productId: row?.product_id ?? null,
          requested,
          available,
          product: label,
          message: "This option is currently unavailable",
        });
      }
      if (available > 0 && requested > available) {
        issues.push({
          variantId,
          productId: row?.product_id ?? null,
          requested,
          available,
          product: label,
          message: `Not enough stock: requested ${requested}, available ${available}`,
        });
      }
    });
  }

  if (issues.length) {
    const primary = issues[0] || {};
    return applyRateLimitHeaders(
      NextResponse.json(
        {
          error: primary.message || "Insufficient stock for one or more items",
          available: primary.available,
          requested: primary.requested,
          product: primary.product,
          productId: primary.productId,
          variantId: primary.variantId,
          issues,
        },
        { status: 409 }
      ),
      rl
    );
  }

  const resolveUnitPrice = (row) => {
    const stored = Number(row?.unit_price_at_add);
    if (Number.isFinite(stored) && stored >= 0) return stored;
    const variant = resolveCartVariant(row);
    const price = Number(variant?.price);
    if (Number.isFinite(price)) return price;
    return 0;
  };

  const resolveItemName = (row) => {
    const productId = row?.product_id != null ? String(row.product_id) : "";
    return row?.variant_name || row?.product_name || productNameIndex.get(productId) || "";
  };

  const resolveUnit = (row) => {
    const variant = resolveCartVariant(row);
    if (variant?.unit) return variant.unit;
    return "";
  };
  const resolveVariantIdForOrderItem = (row) => {
    const variant = resolveCartVariant(row);
    return variant?.id ?? null;
  };
  const resolvedVariantIds = Array.from(
    new Set(
      cart
        .map((row) => resolveVariantIdForOrderItem(row))
        .filter((id) => id != null)
        .map((id) => String(id))
    )
  );

  const deliverySettings = await loadDeliverySettings();
  const deliverySummaryConfig = getDeliverySummaryConfig(deliverySettings, parsed.data.deliveryCity);
  const pricingItems = cart.map((row) => ({
    quantity: Number(row?.quantity || 0),
    unit_price_at_add: resolveUnitPrice(row),
  }));
  const baseSummary = computeOrderSummary(pricingItems, deliverySummaryConfig);
  const promoCode = String(parsed.data.promo_code || "").trim().toUpperCase();
  let promoValidation = null;
  if (promoCode) {
    try {
      promoValidation = await validatePromoCode({
        admin,
        code: promoCode,
        subtotal: baseSummary.subtotal,
        itemsCount: baseSummary.itemsCount,
        deliveryFee: baseSummary.deliveryFee,
      });
    } catch (promoError) {
      const schemaMissing = isMissingPromoCodeSchemaError(promoError?.message);
      return applyRateLimitHeaders(
        NextResponse.json(
          {
            error: schemaMissing
              ? "Promo code system is not available yet."
              : promoError?.message || "Unable to validate promo code.",
            schemaMissing,
          },
          { status: schemaMissing ? 503 : 500 }
        ),
        rl
      );
    }

    if (!promoValidation?.ok) {
      return applyRateLimitHeaders(
        NextResponse.json(
          {
            error: promoValidation?.error || "Promo code could not be applied.",
            promo: promoValidation?.promo || null,
          },
          { status: promoValidation?.status || 409 }
        ),
        rl
      );
    }
  }

  const finalSummary = promoValidation?.ok ? applyPromoToOrderSummary(baseSummary, promoValidation) : baseSummary;
  const orderTotal = finalSummary.total;
  const requestedPaymentMethod = String(parsed.data.paymentMethod || "").trim().toLowerCase() || "paystack";

  // 2) Create order row
  const orderRow = {
    user_id: user.id,
    total: orderTotal,
    subtotal: finalSummary.subtotal,
    delivery_fee: finalSummary.deliveryFee,
    item_discount: finalSummary.itemDiscount,
    delivery_discount: finalSummary.deliveryDiscount,
    discount_total: finalSummary.discountTotal,
    promo_code: finalSummary.promoCode || null,
    promo_description: finalSummary.promoDescription || null,
    status: "processing",
    payment_status: "pending",
    delivery_address: parsed.data.deliveryAddress || "",
    note: parsed.data.note || null,
  };
  const orderSelect =
    "id, total, subtotal, delivery_fee, item_discount, delivery_discount, discount_total, promo_code, promo_description, status, payment_status, delivery_address, created_at";
  const orderInsertCandidates = [
    {
      ...orderRow,
      payment_method: requestedPaymentMethod,
      authentication_method: requestedPaymentMethod,
      auth_method: requestedPaymentMethod,
    },
    {
      ...orderRow,
      payment_method: requestedPaymentMethod,
      authentication_method: requestedPaymentMethod,
    },
    {
      ...orderRow,
      payment_method: requestedPaymentMethod,
      auth_method: requestedPaymentMethod,
    },
    {
      ...orderRow,
      authentication_method: requestedPaymentMethod,
      auth_method: requestedPaymentMethod,
    },
    { ...orderRow, payment_method: requestedPaymentMethod },
    { ...orderRow, authentication_method: requestedPaymentMethod },
    { ...orderRow, auth_method: requestedPaymentMethod },
    { ...orderRow },
  ];
  const uniqueOrderInsertCandidates = [];
  const seenCandidateShapes = new Set();
  orderInsertCandidates.forEach((candidate) => {
    const shape = Object.keys(candidate).sort().join(",");
    if (seenCandidateShapes.has(shape)) return;
    seenCandidateShapes.add(shape);
    uniqueOrderInsertCandidates.push(candidate);
  });

  let orderIns = null;
  let orderErr = null;
  for (const candidate of uniqueOrderInsertCandidates) {
    const inserted = await admin.from("orders").insert(candidate).select(orderSelect).single();
    if (!inserted.error) {
      orderIns = inserted.data;
      orderErr = null;
      break;
    }
    orderErr = inserted.error;
    if (!isUnknownColumnError(inserted.error.message)) break;
  }
  if (orderErr) return applyRateLimitHeaders(NextResponse.json({ error: orderErr.message }, { status: 400 }), rl);

  // 3) Insert order_items
  const orderId = orderIns.id;
  const orderItemsWithVariant = cart.map((c) => ({
    order_id: orderId,
    product_id: c.product_id,
    variant_id: resolveVariantIdForOrderItem(c),
    quantity: c.quantity,
    unit_price: resolveUnitPrice(c),
  }));
  const orderItemsWithoutVariant = orderItemsWithVariant.map(({ variant_id, ...row }) => row);
  const orderItemCandidates = [orderItemsWithVariant, orderItemsWithoutVariant];
  let orderItems = orderItemsWithVariant;
  let oiErr = null;
  for (let index = 0; index < orderItemCandidates.length; index += 1) {
    const candidate = orderItemCandidates[index];
    const result = await admin.from("order_items").insert(candidate);
    if (!result.error) {
      orderItems = candidate;
      oiErr = null;
      break;
    }
    oiErr = result.error;
    if (index === 0 && isUnknownColumnError(result.error.message)) continue;
    break;
  }
  if (oiErr) {
    // Roll back the order row when items fail (e.g., stock trigger)
    try { await admin.from("orders").delete().eq("id", orderId); } catch {}
    await logAdminError(oiErr, { route: "/api/orders", stage: "insert:order_items", order_id: orderId, user_id: user.id });
    return applyRateLimitHeaders(NextResponse.json({ error: oiErr.message }, { status: 400 }), rl);
  }

  if (promoValidation?.ok && promoValidation?.promo?.id != null) {
    const nextUsageCount = Number(promoValidation.promo.usageCount || 0) + 1;
    const { error: promoUseErr } = await admin
      .from("promo_codes")
      .update({ usage_count: nextUsageCount })
      .eq("id", promoValidation.promo.id);
    if (promoUseErr) {
      await logAdminError(promoUseErr, {
        route: "/api/orders",
        stage: "update:promo-usage",
        order_id: orderId,
        promo_code: finalSummary.promoCode || undefined,
        user_id: user.id,
      });
    }
  }

  // 4) Clear cart
  const { error: clearErr } = await admin.from("cart_items").delete().eq("user_id", user.id);
  if (clearErr) {
    await logAdminError(clearErr, { route: "/api/orders", stage: "clear:cart", order_id: orderId, user_id: user.id });
    // Not fatal: return success but inform caller
  }

  await logAdminEvent({
    route: "/api/orders",
    stage: "created",
    order_id: orderId,
    user_id: user.id,
    total: orderTotal,
    subtotal: finalSummary.subtotal,
    delivery_fee: finalSummary.deliveryFee,
    discount_total: finalSummary.discountTotal,
    promo_code: finalSummary.promoCode || undefined,
  });

  // Fire-and-forget email receipt (if configured)
  try {
    const email = user?.email || null;
    if (email) {
      const normalized = {
        orderId: String(orderIns.id),
        createdAt: orderIns.created_at,
        summary: {
          total: Math.round(orderIns.total ?? finalSummary.total),
          subtotal: Math.round(orderIns.subtotal ?? finalSummary.subtotal),
          deliveryFee: Math.round(orderIns.delivery_fee ?? finalSummary.deliveryFee),
          itemDiscount: Math.round(orderIns.item_discount ?? finalSummary.itemDiscount),
          deliveryDiscount: Math.round(orderIns.delivery_discount ?? finalSummary.deliveryDiscount),
          discountTotal: Math.round(orderIns.discount_total ?? finalSummary.discountTotal),
          discount: Math.round(orderIns.discount_total ?? finalSummary.discountTotal),
          promoCode: orderIns.promo_code ?? finalSummary.promoCode ?? "",
          promoDescription: orderIns.promo_description ?? finalSummary.promoDescription ?? "",
        },
        items: cart.map((c) => ({
          name: resolveItemName(c) || `Product ${c.product_id}`,
          unit: resolveUnit(c),
          quantity: Number(c?.quantity) || 0,
          price: Math.round(resolveUnitPrice(c) || 0),
        })),
        user: { email, address: orderRow.delivery_address || "" },
      };
      // Do not await to keep latency low
      sendOrderReceiptEmail({ to: email, order: normalized }).catch(() => {});
    }
  } catch {}

  // 6) Return updated stock snapshot for affected products
  let updatedStock = [];
  if (resolvedVariantIds.length) {
    try {
      const { data: refreshed } = await admin
        .from("product_variants")
        .select("id, product_id, stock_count, stock")
        .in("id", resolvedVariantIds);
      updatedStock = Array.isArray(refreshed) ? refreshed : [];
    } catch {}
  }

  return applyRateLimitHeaders(
    NextResponse.json(
      {
        order: orderIns,
        items: orderItems,
        stock: updatedStock,
        summary: {
          total: Math.round(orderIns.total ?? finalSummary.total),
          subtotal: Math.round(orderIns.subtotal ?? finalSummary.subtotal),
          deliveryFee: Math.round(orderIns.delivery_fee ?? finalSummary.deliveryFee),
          itemDiscount: Math.round(orderIns.item_discount ?? finalSummary.itemDiscount),
          deliveryDiscount: Math.round(orderIns.delivery_discount ?? finalSummary.deliveryDiscount),
          discountTotal: Math.round(orderIns.discount_total ?? finalSummary.discountTotal),
          discount: Math.round(orderIns.discount_total ?? finalSummary.discountTotal),
          promoCode: orderIns.promo_code ?? finalSummary.promoCode ?? "",
          promoDescription: orderIns.promo_description ?? finalSummary.promoDescription ?? "",
        },
        promo: promoValidation?.promo || null,
      },
      { status: 201 }
    ),
    rl
  );
}

export async function GET(request) {
  const rl = await checkRateLimit({ request, id: "orders:list", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);
  const admin = getSupabaseAdminClient();
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user: cookieUser }, error: authErr } = await auth.auth.getUser();
  let user = cookieUser || null;
  if (!user) {
    const header = request.headers.get("authorization") || request.headers.get("Authorization") || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (token) {
      try {
        const { data: tokenData, error: tokenErr } = await admin.auth.getUser(token);
        if (!tokenErr && tokenData?.user) {
          user = tokenData.user;
        }
      } catch {
        /* noop */
      }
    }
  }
  if (authErr && !user) return applyRateLimitHeaders(NextResponse.json({ error: authErr.message }, { status: 401 }), rl);
  if (!user) return applyRateLimitHeaders(NextResponse.json({ error: "Not authenticated" }, { status: 401 }), rl);

  const routeClient = getSupabaseRouteClient(await cookies());
  const { data, error } = await routeClient
    .from("orders")
    .select(
      "id, total, status, payment_status, delivery_address, created_at, order_items:order_items(order_id, product_id, quantity, unit_price, products(name, unit, image_url))"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return applyRateLimitHeaders(NextResponse.json({ error: error.message }, { status: 400 }), rl);

  const rows = Array.isArray(data) ? data : [];
  const normalize = (row) => {
    const items = Array.isArray(row?.order_items) ? row.order_items : [];
    return {
      id: row.id,
      total: Number(row.total) || 0,
      status: row.status || "processing",
      paymentStatus: row.payment_status || "pending",
      deliveryAddress: row.delivery_address || "",
      createdAt: row.created_at,
      items: items.map((it) => {
        const unit = Number(it?.unit_price) || 0;
        const qty = Number(it?.quantity) || 0;
        const prod = it?.products || {};
        return {
          orderId: it.order_id,
          productId: it.product_id,
          quantity: qty,
          unitPrice: unit,
          lineTotal: unit * qty,
          product: {
            name: prod?.name || "",
            title: prod?.name || "",
            unit: prod?.unit || "",
            image: resolveProductImage(prod?.image_url, prod?.image),
          },
        };
      }),
    };
  };
  const orders = rows.map(normalize);
  return applyRateLimitHeaders(NextResponse.json({ orders }, { status: 200 }), rl);
}

export function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: allowedMethodsHeader });
}
