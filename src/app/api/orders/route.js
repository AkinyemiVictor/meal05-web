import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { isTrustedRequestOrigin } from "@/lib/api/request-origin";
import { logAdminError, logAdminEvent } from "@/lib/api/log";
import { sendAdminOrderAlertEmail, sendOrderConfirmationEmail } from "@/lib/notify";
import { resolveProductImage } from "@/lib/product-image";
import { applyPromoToOrderSummary, computeOrderSummary } from "@/lib/order-pricing";
import { getDeliverySummaryConfig } from "@/lib/delivery-settings";
import { loadDeliverySettings } from "@/lib/delivery-settings-server";
import { isMissingPromoCodeSchemaError, validatePromoCode } from "@/lib/promo-codes";
import { insertOrderStatusHistory } from "@/lib/order-status-history";
import { loadMarketCatalog } from "@/lib/market-catalog-server";
import { toCategorySlug } from "@/lib/categories-server";
import { isCheckoutPaymentMethodEnabled } from "@/lib/payments/payment-methods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedMethodsHeader = { Allow: "GET, POST" };
  const tooManyRequests = (rl) => applyRateLimitHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
const ORDER_SELECT_CANDIDATES = [
  "id, total, subtotal, packaging_fee, delivery_fee, item_discount, delivery_discount, discount_total, promo_code, promo_description, status, payment_status, delivery_address, delivery_house_number, delivery_street, delivery_landmark, delivery_address_label, delivery_contact_name, delivery_contact_phone, fulfillment_type, pickup_location_id, delivery_latitude, delivery_longitude, delivery_zone_id, delivery_zone_name, delivery_partner_id, partner_cost, delivery_subsidy, created_at",
  "id, total, subtotal, delivery_fee, item_discount, delivery_discount, discount_total, promo_code, promo_description, status, payment_status, delivery_address, delivery_house_number, delivery_street, delivery_landmark, delivery_address_label, delivery_contact_name, delivery_contact_phone, fulfillment_type, pickup_location_id, delivery_latitude, delivery_longitude, delivery_zone_id, delivery_zone_name, delivery_partner_id, partner_cost, delivery_subsidy, created_at",
];
const isUnknownColumnError = (message) => {
  const errorText = String(message || "");
  return (
    /schema cache/i.test(errorText) ||
    /column .* does not exist/i.test(errorText) ||
    /could not find the .* column/i.test(errorText) ||
    /relation .* does not exist/i.test(errorText)
  );
};

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
    deliveryHouseNumber: z.string().trim().max(80).optional().default(""),
    deliveryStreet: z.string().trim().max(500).optional().default(""),
    deliveryLandmark: z.string().trim().max(300).optional().default(""),
    deliveryAddressLabel: z.string().trim().max(40).optional().default("Home"),
    deliveryContactName: z.string().trim().max(120).optional().default(""),
    deliveryContactPhone: z.string().trim().max(30).optional().default(""),
    deliveryCity: z.string().max(120).optional().default(""),
    deliveryLatitude: z.number().finite().min(-90).max(90).optional(),
    deliveryLongitude: z.number().finite().min(-180).max(180).optional(),
    fulfillmentType: z.enum(["delivery", "pickup"]).default("delivery"),
    deliveryPartnerId: z.string().uuid().optional(),
    pickupLocationId: z.coerce.number().int().positive().optional(),
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
  let cartErr = null;
  if (!cart.length) {
    for (const candidate of cartSelectCandidates) {
      const result = await admin.from("cart_items").select(candidate.select).eq("user_id", user.id);
      if (!result.error) {
        cart = Array.isArray(result.data) ? result.data : [];
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

  const catalog = await loadMarketCatalog(admin);

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
  let productNameIndex = new Map();
  let productMetaIndex = new Map();
  let variantRows = [];
  if (payloadVariantIds.length || productIds.length) {
    const query = !hasMissingVariantIds && payloadVariantIds.length
      ? admin
          .from("product_variants")
          .select("id, product_id, name, price, unit, stock_count, is_default, is_active, market_id, currency_code, packaging, packaging_material_type")
          .in("id", payloadVariantIds)
      : admin
          .from("product_variants")
          .select("id, product_id, name, price, unit, stock_count, is_default, is_active, market_id, currency_code, packaging, packaging_material_type")
          .in("product_id", productIds);
    const result = await query.eq("market_id", catalog.market.id);
    if (result.error) {
      return applyRateLimitHeaders(NextResponse.json({ error: result.error.message }, { status: 400 }), rl);
    }
    variantRows = Array.isArray(result.data) ? result.data : [];
  }

  const resolvedProductIds = Array.from(
    new Set([...productIds, ...variantRows.map((row) => String(row.product_id)).filter(Boolean)])
  );
  if (resolvedProductIds.length) {
    const { data: productRows } = await admin
      .from("products")
      .select("id, name, category_id, packaging, packaging_material_type")
      .in("id", resolvedProductIds);
    const categoryIds = Array.from(
      new Set(
        (Array.isArray(productRows) ? productRows : [])
          .map((row) => row?.category_id)
          .filter((id) => id != null)
      )
    );
    let categoryMetaIndex = new Map();
    if (categoryIds.length) {
      const { data: categoryRows } = await admin
        .from("product_categories")
        .select("id, name, slug")
        .in("id", categoryIds);
      categoryMetaIndex = new Map(
        (Array.isArray(categoryRows) ? categoryRows : []).map((row) => {
          const categoryName = String(row?.name || "").trim();
          return [
            String(row.id),
            {
              category: categoryName,
              categorySlug: toCategorySlug(row?.slug || categoryName),
            },
          ];
        })
      );
    }
    productNameIndex = new Map(
      (Array.isArray(productRows) ? productRows : []).map((row) => {
        const listing = catalog.listings.get(String(row.id));
        return [String(row.id), listing?.local_name || row?.name || ""];
      })
    );
    productMetaIndex = new Map(
      (Array.isArray(productRows) ? productRows : []).map((row) => [
        String(row.id),
        {
          categoryId: row?.category_id ?? null,
          packaging:
            String(row?.packaging || row?.packaging_material_type || "").trim(),
          ...(categoryMetaIndex.get(String(row?.category_id ?? "")) || {}),
        },
      ])
    );
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
    return variant?.name || productNameIndex.get(String(variant?.product_id ?? productId)) || "";
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
    const productName = (variant?.product_id != null ? productNameIndex.get(String(variant.product_id)) : "") || name;
    if (productId != null && productName && !cartProductNames.has(String(productId))) {
      cartProductNames.set(String(productId), productName);
    }
  });

  // 1b) Aggregate quantities per variant for stock validation
  const variantQuantities = new Map();
  const issues = [];
  cart.forEach((row) => {
      const qty = Number(row?.quantity) || 0;
      if (qty <= 0) {
        issues.push({ message: "Cart contains an invalid quantity" });
        return;
      }
      const variant = resolveCartVariant(row);
      const variantId = variant?.id != null ? String(variant.id) : "";
      if (!variantId) {
        issues.push({ variantId: row?.variant_id ?? null, message: "Product option is unavailable in this market" });
        return;
      }
      const suppliedProductId = row?.product_id != null ? String(row.product_id) : "";
      if (suppliedProductId && suppliedProductId !== String(variant.product_id)) {
        issues.push({ variantId, productId: suppliedProductId, message: "Product and variant do not match" });
        return;
      }
      if (!catalog.listings.has(String(variant.product_id))) {
        issues.push({ variantId, productId: variant.product_id, message: "Product is not listed in this market" });
        return;
      }
      if (variant.is_active === false || variant.currency_code !== catalog.market.currencyCode) {
        issues.push({ variantId, productId: variant.product_id, message: "Product option is unavailable in this market" });
        return;
      }
      variantQuantities.set(variantId, (variantQuantities.get(variantId) || 0) + qty);
  });
  if (variantQuantities.size) {
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
    const variant = resolveCartVariant(row);
    const price = Number(variant?.price);
    return Number.isFinite(price) && price >= 0 ? price : 0;
  };

  const resolveItemName = (row) => {
    const variant = resolveCartVariant(row);
    return variant?.name || productNameIndex.get(String(variant?.product_id || "")) || "";
  };

  const resolveUnit = (row) => {
    const variant = resolveCartVariant(row);
    if (variant?.unit) return variant.unit;
    return "";
  };
  const resolveProductName = (row) => {
    const productId = row?.product_id != null ? String(row.product_id) : "";
    const variant = resolveCartVariant(row);
    return (
      String(row?.product_name || "").trim() ||
      productNameIndex.get(String(variant?.product_id || productId)) ||
      ""
    );
  };
  const resolveVariantName = (row) => {
    const variant = resolveCartVariant(row);
    return String(row?.variant_name || variant?.name || "").trim();
  };
  const resolveProductMeta = (row) => {
    const variant = resolveCartVariant(row);
    const productId = variant?.product_id ?? row?.product_id;
    return productMetaIndex.get(String(productId ?? "")) || null;
  };
  const resolvePackaging = (row) => {
    const variant = resolveCartVariant(row);
    const productMeta = resolveProductMeta(row);
    return String(
      variant?.packaging ||
        variant?.packaging_material_type ||
        row?.packaging ||
        row?.packaging_material_type ||
        productMeta?.packaging ||
        ""
    ).trim();
  };
  const resolveCategory = (row) => {
    const productMeta = resolveProductMeta(row);
    return String(row?.category || row?.category_name || productMeta?.category || "").trim();
  };
  const resolveCategorySlug = (row) => {
    const productMeta = resolveProductMeta(row);
    return String(row?.categorySlug || row?.category_slug || productMeta?.categorySlug || "").trim();
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
  const isPickup = parsed.data.fulfillmentType === "pickup";
  let pickupLocation = null;
  let deliveryArea = null;
  let dispatchOption = null;
  let partnerCost = 0;
  if (isPickup) {
    if (!parsed.data.pickupLocationId) return applyRateLimitHeaders(NextResponse.json({ error: "Select a pickup location." }, { status: 400 }), rl);
    const { data, error } = await admin.from("pickup_locations").select("id,name,address,hours").eq("id", parsed.data.pickupLocationId).eq("market_id", catalog.market.id).eq("is_active", true).maybeSingle();
    if (error || !data) return applyRateLimitHeaders(NextResponse.json({ error: "That pickup location is unavailable." }, { status: 400 }), rl);
    pickupLocation = data;
  } else {
  if (!parsed.data.deliveryHouseNumber || !parsed.data.deliveryStreet || !parsed.data.deliveryContactPhone) return applyRateLimitHeaders(NextResponse.json({ error: "House number, street address and contact phone are required for delivery." }, { status: 400 }), rl);
  if (parsed.data.deliveryLatitude == null || parsed.data.deliveryLongitude == null) return applyRateLimitHeaders(NextResponse.json({ error: "Confirm a delivery location." }, { status: 400 }), rl);
  const { data: resolvedZones, error: zoneError } = await admin.rpc("resolve_delivery_zone", {
    p_lat: parsed.data.deliveryLatitude,
    p_lng: parsed.data.deliveryLongitude,
    p_market_id: catalog.market.id,
  });
  if (zoneError) {
    await logAdminError(zoneError, { route: "/api/orders", stage: "resolve_delivery_zone", user_id: user.id });
    return applyRateLimitHeaders(NextResponse.json({ error: "Delivery-zone validation is unavailable.", code: "delivery_zone_error" }, { status: 503 }), rl);
  }
  deliveryArea = Array.isArray(resolvedZones) ? resolvedZones[0] : null;
  if (!deliveryArea) {
    return applyRateLimitHeaders(
      NextResponse.json(
        {
          error: "This exact location is outside our current delivery area. Select another location or join the waitlist.",
          code: "delivery_area_unavailable",
        },
        { status: 400 }
      ),
      rl
    );
  }
  if (!parsed.data.deliveryPartnerId) return applyRateLimitHeaders(NextResponse.json({ error: "Select a delivery partner." }, { status: 400 }), rl);
  const { data: service, error: serviceError } = await admin.from("delivery_partner_services")
    .select("base_fee,eta_note,partner_id,delivery_partners!inner(id,name,status,market_id)")
    .eq("zone_id", deliveryArea.zone_id).eq("partner_id", parsed.data.deliveryPartnerId).eq("is_active", true)
    .eq("delivery_partners.status", "active").eq("delivery_partners.market_id", catalog.market.id).maybeSingle();
  if (serviceError || !service) return applyRateLimitHeaders(NextResponse.json({ error: "That delivery partner is unavailable for this location." }, { status: 400 }), rl);
  partnerCost = Number(service.base_fee || 0);
  dispatchOption = { id: service.partner_id, name: service.delivery_partners.name, fee: partnerCost, eta: service.eta_note || "Timing confirmed after booking" };
  }
  const { data: priorOrders, error: priorOrdersError } = await admin
    .from("orders")
    .select("id")
    .eq("user_id", user.id)
    .neq("status", "cancelled")
    .limit(1);
  if (priorOrdersError) await logAdminError(priorOrdersError, { route: "/api/orders", stage: "first_order_check", user_id: user.id });
  const firstOrderFreeDelivery = !priorOrdersError && !(priorOrders || []).length;
  const deliverySummaryConfig = {
    ...getDeliverySummaryConfig(deliverySettings, "Ibadan"),
    deliveryFee: isPickup || firstOrderFreeDelivery ? 0 : partnerCost,
  };
  const pricingItems = cart.map((row) => ({
    quantity: Number(row?.quantity || 0),
    unit_price_at_add: resolveUnitPrice(row),
    name: resolveProductName(row),
    variantName: resolveVariantName(row),
    unit: resolveUnit(row),
    packaging: resolvePackaging(row),
    category: resolveCategory(row),
    categorySlug: resolveCategorySlug(row),
    packagingMode: String(row?.packagingMode || row?.packaging_mode || "").trim(),
    isHandled: row?.isHandled === true || row?.is_handled === true,
    isPackable:
      row?.isPackable === true ||
      row?.is_packable === true ||
      row?.isHandled === false ||
      row?.is_handled === false,
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
        marketId: catalog.market.id,
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
  if (!isCheckoutPaymentMethodEnabled(requestedPaymentMethod)) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Unsupported payment method or payment method is not enabled." }, { status: 400 }),
      rl
    );
  }

  // 2) Create order row
  const orderRowBase = {
    user_id: user.id,
    total: orderTotal,
    subtotal: finalSummary.subtotal,
    delivery_fee: finalSummary.deliveryFee,
    item_discount: finalSummary.itemDiscount,
    delivery_discount: finalSummary.deliveryDiscount,
    discount_total: finalSummary.discountTotal,
    promo_code: finalSummary.promoCode || null,
    promo_description: finalSummary.promoDescription || null,
    status: "pending",
    payment_status: "pending",
    payment_method: requestedPaymentMethod,
    market_id: catalog.market.id,
    currency_code: catalog.market.currencyCode,
    delivery_address: isPickup ? pickupLocation.address : [parsed.data.deliveryHouseNumber, parsed.data.deliveryStreet].filter(Boolean).join(", "),
    delivery_house_number: isPickup ? null : parsed.data.deliveryHouseNumber,
    delivery_street: isPickup ? null : parsed.data.deliveryStreet,
    delivery_landmark: isPickup ? null : parsed.data.deliveryLandmark || null,
    delivery_address_label: isPickup ? null : parsed.data.deliveryAddressLabel || "Home",
    delivery_contact_name: parsed.data.deliveryContactName || null,
    delivery_contact_phone: parsed.data.deliveryContactPhone || null,
    fulfillment_type: parsed.data.fulfillmentType,
    pickup_location_id: pickupLocation?.id || null,
    delivery_latitude: isPickup ? null : parsed.data.deliveryLatitude,
    delivery_longitude: isPickup ? null : parsed.data.deliveryLongitude,
    delivery_zone_id: deliveryArea?.zone_id || null,
    delivery_zone_name: deliveryArea?.zone_name || null,
    delivery_partner_id: dispatchOption?.id || null,
    partner_cost: isPickup ? 0 : partnerCost,
    delivery_subsidy: Math.max(0, partnerCost - finalSummary.deliveryFee),
    customer_note: parsed.data.note || null,
    delivery_instructions: isPickup ? `Pickup: ${pickupLocation.name} - ${pickupLocation.hours || "Time confirmed after payment"}` : parsed.data.deliveryLandmark || "Call the customer when outside.",
  };
  let orderIns = null;
  let orderErr = null;
  for (const select of ORDER_SELECT_CANDIDATES) {
    const includePackagingFee = select.includes("packaging_fee");
    const orderRow = includePackagingFee
      ? { ...orderRowBase, packaging_fee: finalSummary.packagingFee }
      : orderRowBase;
    const result = await admin.from("orders").insert(orderRow).select(select).single();
    if (!result.error) {
      orderIns = result.data;
      orderErr = null;
      break;
    }
    orderErr = result.error;
    if (isUnknownColumnError(result.error.message)) continue;
    break;
  }
  if (orderErr) return applyRateLimitHeaders(NextResponse.json({ error: orderErr.message }, { status: 400 }), rl);

  // 3) Insert order_items
  const orderId = orderIns.id;
  const orderItemsWithVariant = cart.map((c) => ({
    order_id: orderId,
    product_id: resolveCartVariant(c)?.product_id,
    variant_id: resolveVariantIdForOrderItem(c),
    quantity: c.quantity,
    price: resolveUnitPrice(c),
    currency_code: catalog.market.currencyCode,
  }));
  let orderItems = orderItemsWithVariant;
  const { error: oiErr } = await admin.from("order_items").insert(orderItemsWithVariant);
  if (oiErr) {
    // Roll back the order row when items fail (e.g., stock trigger)
    try { await admin.from("orders").delete().eq("id", orderId); } catch {}
    await logAdminError(oiErr, { route: "/api/orders", stage: "insert:order_items", order_id: orderId, user_id: user.id });
    return applyRateLimitHeaders(NextResponse.json({ error: oiErr.message }, { status: 400 }), rl);
  }

  if (!isPickup) {
    try {
      const addressRecord = {
        label: parsed.data.deliveryAddressLabel || "Home",
        full_name: parsed.data.deliveryContactName || null,
        phone: parsed.data.deliveryContactPhone || null,
        line1: parsed.data.deliveryStreet,
        line2: parsed.data.deliveryLandmark || null,
        house_number: parsed.data.deliveryHouseNumber,
        landmark: parsed.data.deliveryLandmark || null,
        city: "Ibadan",
        state: "Oyo",
        country: "Nigeria",
        latitude: parsed.data.deliveryLatitude,
        longitude: parsed.data.deliveryLongitude,
        formatted_address: [parsed.data.deliveryHouseNumber, parsed.data.deliveryStreet].filter(Boolean).join(", "),
        delivery_zone_id: deliveryArea.zone_id,
        geocoding_provider: "customer-confirmed",
        location_validated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data: savedAddress } = await admin.from("user_addresses").select("id").eq("user_id", user.id).eq("line1", parsed.data.deliveryStreet).limit(1).maybeSingle();
      if (savedAddress?.id) await admin.from("user_addresses").update(addressRecord).eq("id", savedAddress.id).throwOnError();
      else await admin.from("user_addresses").insert({ ...addressRecord, user_id: user.id }).throwOnError();
    } catch (addressError) {
      await logAdminError(addressError, { route: "/api/orders", stage: "save:user_address", order_id: orderId, user_id: user.id });
    }
  }

  const statusHistoryRes = await insertOrderStatusHistory(admin, {
    orderId,
    fromStatus: null,
    toStatus: orderRowBase.status,
    changedBy: user.id,
    note: "Order created",
  });
  if (statusHistoryRes.error) {
    await logAdminError(statusHistoryRes.error, {
      route: "/api/orders",
      stage: "insert:order_status_history",
      order_id: orderId,
      user_id: user.id,
    });
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
    packaging_fee: finalSummary.packagingFee,
    delivery_fee: finalSummary.deliveryFee,
      discount_total: finalSummary.discountTotal,
      promo_code: finalSummary.promoCode || undefined,
      dispatch_partner: dispatchOption?.name || null,
      dispatch_option_id: dispatchOption?.id || null,
      dispatch_fee: finalSummary.deliveryFee,
    });

  // Fire-and-forget order notifications (if configured)
  try {
    const email = user?.email || null;
    const customerName = parsed.data.deliveryContactName || null;
    const normalized = {
      orderId: String(orderIns.id),
      createdAt: orderIns.created_at,
      paymentMethod: requestedPaymentMethod,
      fullName: customerName || "",
      email: email || "",
      address: orderRowBase.delivery_address || "",
      summary: {
        total: Math.round(orderIns.total ?? finalSummary.total),
        subtotal: Math.round(orderIns.subtotal ?? finalSummary.subtotal),
        packagingFee: Math.round(orderIns.packaging_fee ?? finalSummary.packagingFee),
        deliveryFee: Math.round(orderIns.delivery_fee ?? finalSummary.deliveryFee),
        itemDiscount: Math.round(orderIns.item_discount ?? finalSummary.itemDiscount),
        deliveryDiscount: Math.round(orderIns.delivery_discount ?? finalSummary.deliveryDiscount),
        discountTotal: Math.round(orderIns.discount_total ?? finalSummary.discountTotal),
        discount: Math.round(orderIns.discount_total ?? finalSummary.discountTotal),
        promoCode: orderIns.promo_code ?? finalSummary.promoCode ?? "",
        promoDescription: orderIns.promo_description ?? finalSummary.promoDescription ?? "",
        dispatchPartner: dispatchOption,
      },
      items: cart.map((c) => ({
        name: resolveItemName(c) || `Product ${c.product_id}`,
        unit: resolveUnit(c),
        quantity: Number(c?.quantity) || 0,
        price: Math.round(resolveUnitPrice(c) || 0),
      })),
      user: {
        name: customerName || "",
        email,
        address: orderRowBase.delivery_address || "",
      },
    };
    if (email) {
      sendOrderConfirmationEmail({ to: email, order: normalized }).catch(() => {});
    }
    sendAdminOrderAlertEmail({ order: normalized }).catch(() => {});
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
        packagingFee: Math.round(orderIns.packaging_fee ?? finalSummary.packagingFee),
        deliveryFee: Math.round(orderIns.delivery_fee ?? finalSummary.deliveryFee),
        itemDiscount: Math.round(orderIns.item_discount ?? finalSummary.itemDiscount),
        deliveryDiscount: Math.round(orderIns.delivery_discount ?? finalSummary.deliveryDiscount),
          discountTotal: Math.round(orderIns.discount_total ?? finalSummary.discountTotal),
          discount: Math.round(orderIns.discount_total ?? finalSummary.discountTotal),
          promoCode: orderIns.promo_code ?? finalSummary.promoCode ?? "",
          promoDescription: orderIns.promo_description ?? finalSummary.promoDescription ?? "",
          dispatchPartner: dispatchOption,
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
  const orderSelects = [
    "id, total, status, payment_status, delivery_address, created_at, order_items:order_items(order_id, product_id, variant_id, quantity, price, products(name, unit, image_url))",
    "id, total, status, payment_status, delivery_address, created_at, order_items:order_items(order_id, product_id, quantity, price, products(name, unit, image_url))",
  ];
  let data = [];
  let error = null;
  for (const select of orderSelects) {
    const result = await routeClient
      .from("orders")
      .select(select)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (!result.error) {
      data = result.data;
      error = null;
      break;
    }
    error = result.error;
    if (!isUnknownColumnError(result.error.message)) break;
  }
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
        const unit = Number(it?.price ?? it?.unit_price) || 0;
        const qty = Number(it?.quantity) || 0;
        const prod = it?.products || {};
        return {
          orderId: it.order_id,
          productId: it.product_id,
          variantId: it.variant_id ?? null,
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
