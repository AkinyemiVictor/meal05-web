"use client";

import { resolveStockClass } from "@/lib/catalogue";
import { getProductById } from "@/lib/products";
import { readCartItems, writeCartItems } from "@/lib/cart-storage";
import { resolveProductImage } from "@/lib/product-image";
import { getAvailableCount } from "@/lib/stock";
import { readStoredUser } from "@/lib/auth";
import { addAuthenticatedCartItem } from "@/lib/cart-sync";

const DEFAULT_LINE_COUNT = 1;

const toPositiveInteger = (value, fallback = DEFAULT_LINE_COUNT) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(1, Math.round(numeric));
};

const normaliseIncludedProductIds = (value) => {
  if (!Array.isArray(value)) return [];
  const unique = new Set();
  value.forEach((entry) => {
    const numeric = Number(entry);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    unique.add(String(Math.round(numeric)));
  });
  return Array.from(unique);
};

const getLineKey = (item) =>
  String(item?.variantId || item?.id || item?.productId || "").trim();

const getLineCount = (item) => {
  const count = Number(item?.orderCount ?? item?.quantity ?? DEFAULT_LINE_COUNT);
  if (!Number.isFinite(count) || count <= 0) return DEFAULT_LINE_COUNT;
  return Math.max(DEFAULT_LINE_COUNT, Math.round(count));
};

const buildBundleCartItem = (product, count, planName) => {
  const orderCount = toPositiveInteger(count, DEFAULT_LINE_COUNT);
  const lineId = product?.variantId || product?.id;

  return {
    id: lineId,
    productId: product?.id,
    variantId: product?.variantId ?? null,
    variantName: product?.variantName || "",
    name: product?.name || "Fresh produce",
    unit: product?.unit || "Per pack",
    price: Number(product?.price) || 0,
    orderSize: 1,
    orderCount,
    quantity: orderCount,
    stock: product?.stock ?? "In Stock",
    note: `Added from pack plan: ${planName || "Pack plan"}`,
    image: resolveProductImage(product?.image),
  };
};

const findCartItemIndex = (items, product) => {
  if (!Array.isArray(items) || !product) return -1;
  const lineKey = getLineKey({
    variantId: product?.variantId,
    id: product?.id,
    productId: product?.id,
  });
  const productIdKey = String(product?.id || "");

  return items.findIndex((item) => {
    const itemKey = getLineKey(item);
    const itemProductKey = String(item?.productId || item?.id || "");
    return (
      itemKey === lineKey ||
      (!product?.variantId && itemKey === productIdKey) ||
      (!product?.variantId && itemProductKey === productIdKey)
    );
  });
};

const syncAddedItemToApi = (product, quantity) => {
  if (!readStoredUser()) return Promise.resolve();
  return addAuthenticatedCartItem(
    buildBundleCartItem(product, toPositiveInteger(quantity, DEFAULT_LINE_COUNT), "Pack plan"),
    { source: "bundle-plan" }
  );
};

export const addBundlePlanToCart = async (plan, options = {}) => {
  const includedIds = normaliseIncludedProductIds(plan?.includedProductIds);
  const quantityPerItem = toPositiveInteger(options?.quantityPerItem, DEFAULT_LINE_COUNT);

  if (!includedIds.length) {
    return {
      status: "pending",
      totalChangedCount: 0,
      addedCount: 0,
      unavailableCount: 0,
      unresolvedCount: 0,
      cappedCount: 0,
    };
  }

  const items = readCartItems();
  const addedEntries = [];
  const unavailableProducts = [];
  const unresolvedProductIds = [];
  let cappedCount = 0;

  includedIds.forEach((id) => {
    const product = getProductById(id);
    if (!product) {
      unresolvedProductIds.push(id);
      return;
    }

    if (resolveStockClass(product?.stock) === "is-unavailable") {
      unavailableProducts.push(product);
      return;
    }

    const index = findCartItemIndex(items, product);
    const existingCount = index >= 0 ? getLineCount(items[index]) : 0;
    const availableCount = getAvailableCount(product?.stock);
    const desiredCount = existingCount + quantityPerItem;
    const nextCount =
      Number.isFinite(availableCount) && availableCount >= 0
        ? Math.min(desiredCount, availableCount)
        : desiredCount;
    const delta = Math.max(0, nextCount - existingCount);

    if (Number.isFinite(availableCount) && nextCount < desiredCount) {
      cappedCount += 1;
    }

    if (!(delta > 0)) return;

    const cartItem = buildBundleCartItem(product, nextCount, plan?.name);
    if (index >= 0) {
      items[index] = { ...items[index], ...cartItem };
    } else {
      items.push(cartItem);
    }

    addedEntries.push({ product, delta });
  });

  if (!addedEntries.length) {
    return {
      status: "none",
      totalChangedCount: 0,
      addedCount: 0,
      unavailableCount: unavailableProducts.length,
      unresolvedCount: unresolvedProductIds.length,
      cappedCount,
    };
  }

  let syncedCount = addedEntries.length;
  let syncFailureCount = 0;
  if (readStoredUser()) {
    const results = await Promise.allSettled(
      addedEntries.map((entry) => syncAddedItemToApi(entry.product, entry.delta))
    );
    syncedCount = results.filter((result) => result.status === "fulfilled").length;
    syncFailureCount = results.length - syncedCount;
  } else {
    writeCartItems(items, undefined, { source: "bundle-plan" });
  }

  return {
    status: syncedCount > 0 ? "success" : "none",
    totalChangedCount: syncedCount,
    addedCount: syncedCount,
    unavailableCount: unavailableProducts.length + syncFailureCount,
    unresolvedCount: unresolvedProductIds.length,
    cappedCount,
  };
};

const pluralise = (count, singular, plural = `${singular}s`) =>
  count === 1 ? singular : plural;

export const buildBundleCartNotice = (planName, result) => {
  const safePlanName = planName || "This pack";
  if (!result || result.status === "pending") {
    return {
      tone: "info",
      title: "Pack setup pending",
      message: `${safePlanName} will be available for cart soon.`,
      autoClose: true,
    };
  }

  if (result.status !== "success" || !(result.totalChangedCount > 0)) {
    return {
      tone: "info",
      title: "Nothing added",
      message: `${safePlanName} has no available items to add right now.`,
      autoClose: true,
    };
  }

  const skippedCount =
    toPositiveInteger(result.unavailableCount, 0) +
    toPositiveInteger(result.unresolvedCount, 0);
  const cappedCount = toPositiveInteger(result.cappedCount, 0);

  const parts = [
    `${safePlanName}: ${result.totalChangedCount} ${pluralise(
      result.totalChangedCount,
      "item"
    )} added to your cart.`,
  ];

  if (cappedCount > 0) {
    parts.push(
      `${cappedCount} ${pluralise(cappedCount, "item")} adjusted to available stock.`
    );
  }

  if (skippedCount > 0) {
    parts.push(
      `${skippedCount} ${pluralise(skippedCount, "item")} could not be added right now.`
    );
  }

  return {
    tone: skippedCount > 0 ? "info" : "success",
    title: "Added to cart",
    message: parts.join(" "),
    autoClose: true,
  };
};
