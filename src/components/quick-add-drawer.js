"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconShoppingBag, IconX } from "@tabler/icons-react";

import AvailabilityRequestNotice from "@/components/availability-request-notice";
import SizePreferencePicker from "@/components/size-preference-picker";
import VariantPicker from "@/components/variant-picker";
import categories from "@/data/categories";
import { formatProductPrice, resolveStockClass } from "@/lib/catalogue";
import { readCartItems, writeCartItems } from "@/lib/cart-storage";
import { getAvailableCount } from "@/lib/stock";
import { useNotice } from "@/components/notice-provider";
import { resolveProductImage } from "@/lib/product-image";
import { getProductHref } from "@/lib/products";
import { readStoredUser } from "@/lib/auth";
import { addAuthenticatedCartItem } from "@/lib/cart-sync";
import {
  SELECTION_MODE_FLEXIBLE,
  normalizeAvailabilityMode,
  normalizeSelectionMode,
  normalizeSizePreference,
} from "@/lib/commerce-options";
import {
  PURCHASE_MODE_FIXED,
  PURCHASE_MODE_LOOSE,
  clampQuantityToRules,
  getVariantPurchaseRules,
  normalizePurchaseMode,
  validateVariantQuantity,
} from "@/lib/purchase-quantities";

const CATEGORY_LABELS = new Map(categories.map((category) => [category.slug, category.label]));
const canUseNextImageOptimization = (src) =>
  String(src || "").startsWith("/") ||
  /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//i.test(String(src || ""));

const normaliseOrderCount = (value, variant = {}, fallback = 1) => {
  const validation = validateVariantQuantity(variant, value);
  if (validation.ok) return validation.quantity;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return clampQuantityToRules(variant, numeric);
};

const getLineKey = (item) => String(item?.variantId || item?.id || item?.productId || "");

const buildVariantName = (variant) => {
  if (!variant || typeof variant !== "object") return "";
  const parts = [
    variant.ripeness,
    variant.sizeLabel || variant.size,
    variant.packaging,
  ].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  return variant.name || variant.label || "";
};

const getAvailabilityMode = (variant, product) =>
  normalizeAvailabilityMode(
    variant?.availabilityMode ??
      variant?.availability_mode ??
      product?.availabilityMode ??
      product?.availability_mode
  );

const getInventoryTrackingMode = (variant, product) =>
  String(
    variant?.inventoryTrackingMode ??
      variant?.inventory_tracking_mode ??
      product?.inventoryTrackingMode ??
      product?.inventory_tracking_mode ??
      "tracked"
  ).toLowerCase() === "supplier"
    ? "supplier"
    : "tracked";

const bypassesLocalStock = (variant, product) =>
  getAvailabilityMode(variant, product) === "request" ||
  getInventoryTrackingMode(variant, product) === "supplier";

const pickDefaultVariant = (variations, product) => {
  if (!Array.isArray(variations) || variations.length === 0) {
    if (!product) return null;
    return {
      variationId: product.variantId || product.id,
      price: product.price,
      oldPrice: product.oldPrice,
      unit: product.unit,
      stock: product.stock,
      image: product.image,
      name: product.variantName || product.name,
      availabilityMode: product.availabilityMode ?? product.availability_mode,
      inventoryTrackingMode: product.inventoryTrackingMode ?? product.inventory_tracking_mode,
    };
  }
  const selectable = variations.filter((v) => v && !isVariantInactive(v, product));
  const pool = selectable.length ? selectable : variations;
  const explicit = pool.find((v) => v && v.is_default === true);
  if (explicit) return explicit;
  const withPrice = pool
    .filter((v) => v && v.price != null && Number.isFinite(Number(v.price)))
    .sort((a, b) => Number(a.price) - Number(b.price));
  if (withPrice.length) return withPrice[0];
  return pool[0] || null;
};

const getVariantId = (variant, product) =>
  variant?.variationId || variant?.id || product?.variantId || product?.id || null;

const getVariantPrice = (variant, product) =>
  Number(variant?.price ?? product?.price ?? 0) || 0;

const getVariantUnit = (variant, product) => variant?.unit || product?.unit || "";

const pickNumberOrNull = (...values) => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
};

const pickTextOrNull = (...values) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return null;
};

const getVariantImage = (variant, product, fallback) =>
  resolveProductImage(variant?.image, product?.image, fallback);

const getStockValue = (variant, product) => {
  if (variant?.stockCount != null) {
    const count = Number(variant.stockCount);
    if (Number.isFinite(count)) return count;
  }
  if (variant?.stock != null) return variant.stock;
  if (product?.stock != null) {
    const productCount = Number(product.stock);
    if (Number.isFinite(productCount)) return productCount;
  }
  return product?.stock ?? "";
};

const isVariantInactive = (variant, product) => {
  if (!variant || typeof variant !== "object") return true;
  if (variant.isSelectable === false || variant.is_active === false || variant.isActive === false) return true;
  const availabilityMode = getAvailabilityMode(variant, product);
  if (availabilityMode === "unavailable") return true;
  if (bypassesLocalStock(variant, product)) return false;
  const stockClass = resolveStockClass(getStockValue(variant, product));
  return stockClass === "is-unavailable";
};

const buildFallbackVariantFromProduct = (product) => {
  if (!product?.variantId && !product?.id) return null;
  const purchaseMode = normalizePurchaseMode(product?.purchase_mode ?? product?.purchaseMode);
  const variant = {
    variationId: product.variantId || product.id,
    id: product.variantId || product.id,
    name: product.variantName || product.variant_name || product.unit || "Option",
    price: product.price,
    oldPrice: product.oldPrice,
    unit: product.unit,
    currencyCode: product.currencyCode || product.currency_code,
    purchaseMode,
    purchase_mode: purchaseMode,
    minQuantity: product.minQuantity ?? product.min_quantity,
    min_quantity: product.min_quantity ?? product.minQuantity,
    maxQuantity: product.maxQuantity ?? product.max_quantity,
    max_quantity: product.max_quantity ?? product.maxQuantity,
    stepQuantity: product.stepQuantity ?? product.step_quantity,
    step_quantity: product.step_quantity ?? product.stepQuantity,
    baseUnit: product.baseUnit ?? product.base_unit,
    base_unit: product.base_unit ?? product.baseUnit,
    baseQuantity: product.baseQuantity ?? product.base_quantity,
    base_quantity: product.base_quantity ?? product.baseQuantity,
    weightMin: product.weightMin ?? product.weight_min,
    weight_min: product.weight_min ?? product.weightMin,
    weightMax: product.weightMax ?? product.weight_max,
    weight_max: product.weight_max ?? product.weightMax,
    weightUnit: product.weightUnit ?? product.weight_unit,
    weight_unit: product.weight_unit ?? product.weightUnit,
    volumeMin: product.volumeMin ?? product.volume_min,
    volume_min: product.volume_min ?? product.volumeMin,
    volumeMax: product.volumeMax ?? product.volume_max,
    volume_max: product.volume_max ?? product.volumeMax,
    volumeUnit: product.volumeUnit ?? product.volume_unit,
    volume_unit: product.volume_unit ?? product.volumeUnit,
    optionRole: product.optionRole ?? product.option_role,
    option_role: product.option_role ?? product.optionRole,
    availabilityMode: product.availabilityMode ?? product.availability_mode ?? "standard",
    availability_mode: product.availability_mode ?? product.availabilityMode ?? "standard",
    inventoryTrackingMode: product.inventoryTrackingMode ?? product.inventory_tracking_mode ?? "tracked",
    inventory_tracking_mode: product.inventory_tracking_mode ?? product.inventoryTrackingMode ?? "tracked",
    stock: product.stock,
    stockCount: product.stock,
    image: product.image,
    is_default: true,
  };
  return {
    ...variant,
    isSelectable: !isVariantInactive(variant, product),
  };
};

const buildCartItem = (product, variant, orderCount, fallbackImage, sizePreference) => {
  const variantId = getVariantId(variant, product);
  const lineId = variantId || product?.id || "";
  const unit = getVariantUnit(variant, product) || "Per pack";
  const price = getVariantPrice(variant, product);
  const variantName = buildVariantName(variant);
  const stock = variant?.stock ?? product?.stock ?? "In Stock";
  const purchaseRules = getVariantPurchaseRules(variant);
  const quantity = normaliseOrderCount(orderCount, variant);
  const baseUnit = variant?.base_unit ?? variant?.baseUnit ?? product?.base_unit ?? product?.baseUnit ?? "";
  const baseQuantity = variant?.base_quantity ?? variant?.baseQuantity ?? product?.base_quantity ?? product?.baseQuantity ?? null;
  const weightMin = pickNumberOrNull(variant?.weight_min, variant?.weightMin, product?.weight_min, product?.weightMin);
  const weightMax = pickNumberOrNull(variant?.weight_max, variant?.weightMax, product?.weight_max, product?.weightMax);
  const weightUnit = pickTextOrNull(variant?.weight_unit, variant?.weightUnit, product?.weight_unit, product?.weightUnit);
  const volumeMin = pickNumberOrNull(variant?.volume_min, variant?.volumeMin, product?.volume_min, product?.volumeMin);
  const volumeMax = pickNumberOrNull(variant?.volume_max, variant?.volumeMax, product?.volume_max, product?.volumeMax);
  const volumeUnit = pickTextOrNull(variant?.volume_unit, variant?.volumeUnit, product?.volume_unit, product?.volumeUnit);
  const optionRole = pickTextOrNull(variant?.option_role, variant?.optionRole, product?.option_role, product?.optionRole);
  const selectionModel = normalizeSelectionMode(product?.selectionModel ?? product?.selection_model);
  const availabilityMode = getAvailabilityMode(variant, product);
  const inventoryTrackingMode = getInventoryTrackingMode(variant, product);
  const normalizedSizePreference = normalizeSizePreference(sizePreference, selectionModel);
  const variationNote = String(product?.variationNote ?? product?.variation_note ?? "").trim();
  return {
    id: lineId,
    productId: product?.id,
    variantId,
    variantName,
    name: product?.name || "Fresh produce",
    category: product?.category || "",
    categorySlug: product?.categorySlug || "",
    packaging: variant?.packaging || product?.packaging || "",
    unit,
    price,
    purchaseMode: purchaseRules.purchaseMode,
    purchase_mode: purchaseRules.purchaseMode,
    minQuantity: purchaseRules.minQuantity,
    min_quantity: purchaseRules.minQuantity,
    maxQuantity: purchaseRules.maxQuantity,
    max_quantity: purchaseRules.maxQuantity,
    stepQuantity: purchaseRules.stepQuantity,
    step_quantity: purchaseRules.stepQuantity,
    baseUnit: baseUnit || undefined,
    base_unit: baseUnit || undefined,
    baseQuantity: baseQuantity != null ? baseQuantity : undefined,
    base_quantity: baseQuantity != null ? baseQuantity : undefined,
    weightMin,
    weight_min: weightMin,
    weightMax,
    weight_max: weightMax,
    weightUnit,
    weight_unit: weightUnit,
    volumeMin,
    volume_min: volumeMin,
    volumeMax,
    volume_max: volumeMax,
    volumeUnit,
    volume_unit: volumeUnit,
    optionRole,
    option_role: optionRole,
    availabilityMode,
    availability_mode: availabilityMode,
    inventoryTrackingMode,
    inventory_tracking_mode: inventoryTrackingMode,
    selectionModel,
    selection_model: selectionModel,
    variationNote,
    variation_note: variationNote,
    sizePreference: normalizedSizePreference,
    size_preference: normalizedSizePreference,
    orderSize: 1,
    orderCount: quantity,
    quantity,
    stock,
    image: getVariantImage(variant, product, fallbackImage),
  };
};

export default function QuickAddDrawer({ product, isOpen, onClose, variant = "drawer" }) {
  const { showNotice } = useNotice();
  const cacheRef = useRef(new Map());
  const panelRef = useRef(null);
  const isDropdown = variant === "dropdown";

  const [status, setStatus] = useState("idle");
  const [detail, setDetail] = useState(null);
  const [variations, setVariations] = useState([]);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [purchaseMode, setPurchaseMode] = useState(PURCHASE_MODE_FIXED);
  const [quantity, setQuantity] = useState(1);
  const [sizePreference, setSizePreference] = useState("best_available");
  const [error, setError] = useState("");

  const productId = product?.id;
  const useCenteredModal = true;
  const isModalPresentation = !isDropdown || useCenteredModal;

  useEffect(() => {
    if (!isOpen || !isModalPresentation) return;
    const prev = document.body.style.overflow;
    const prevDoc = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.style.overflow = prevDoc;
    };
  }, [isOpen, isModalPresentation]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setStatus("idle");
      setError("");
      setDetail(null);
      setVariations([]);
      setSelectedVariant(null);
      setPurchaseMode(PURCHASE_MODE_FIXED);
      setQuantity(1);
      setSizePreference("best_available");
      return;
    }
    if (!productId) return;

    let cancelled = false;
    const cacheKey = String(productId);
    const cached = cacheRef.current.get(cacheKey);
    const fallbackVariant = buildFallbackVariantFromProduct(product);
    const fallbackProduct = fallbackVariant ? product : null;
    const embeddedVariations = Array.isArray(product?.variations) ? product.variations : [];

    setStatus(fallbackVariant?.isSelectable ? "ready" : "loading");
    setError("");
    setDetail(fallbackProduct);
    setVariations(fallbackVariant ? [fallbackVariant] : []);
    setSelectedVariant(fallbackVariant || null);
    setPurchaseMode(fallbackVariant?.purchase_mode || PURCHASE_MODE_FIXED);
    setQuantity(getVariantPurchaseRules(fallbackVariant).minQuantity);
    setSizePreference(
      normalizeSelectionMode(product?.selectionModel ?? product?.selection_model) === SELECTION_MODE_FLEXIBLE
        ? normalizeSizePreference(product?.sizePreference ?? product?.size_preference, SELECTION_MODE_FLEXIBLE) || "best_available"
        : "best_available"
    );

    const applyData = (payload) => {
      if (cancelled) return;
      if (payload?.error) {
        setStatus("error");
        setError(payload?.error || "Unable to load variants.");
        return;
      }
      const detailProduct = payload?.product || payload || null;
      if (!detailProduct || !detailProduct.id) {
        setStatus("error");
        setError("Unable to load variants.");
        return;
      }
      const list = Array.isArray(payload?.variations) ? payload.variations : [];
      const defaultVariant = pickDefaultVariant(list, detailProduct);
      setDetail(detailProduct);
      setVariations(list);
      setSelectedVariant(defaultVariant);
      setPurchaseMode(normalizePurchaseMode(defaultVariant?.purchase_mode ?? defaultVariant?.purchaseMode));
      setQuantity(getVariantPurchaseRules(defaultVariant).minQuantity);
      setSizePreference(
        normalizeSelectionMode(detailProduct?.selectionModel ?? detailProduct?.selection_model) === SELECTION_MODE_FLEXIBLE
          ? normalizeSizePreference(
              detailProduct?.sizePreference ?? detailProduct?.size_preference,
              SELECTION_MODE_FLEXIBLE
            ) || "best_available"
          : "best_available"
      );
      setStatus("ready");
      cacheRef.current.set(cacheKey, { product: detailProduct, variations: list });
    };

    if (cached) {
      applyData(cached);
      return () => {
        cancelled = true;
      };
    }

    if (product?.optionsLoaded === true) {
      applyData({ product, variations: embeddedVariations });
      return () => {
        cancelled = true;
      };
    }

    fetch(`/api/products/${productId}`)
      .then((res) => res.json())
      .then((json) => applyData(json))
      .catch((err) => {
        if (cancelled) return;
        if (fallbackVariant?.isSelectable) {
          setStatus("ready");
          return;
        }
        setStatus("error");
        setError(err?.message || "Unable to load variants.");
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, product, productId]);

  const displayProduct = detail || product || null;
  const fixedVariations = useMemo(
    () =>
      variations.filter((entry) =>
        normalizePurchaseMode(entry?.purchase_mode ?? entry?.purchaseMode) === PURCHASE_MODE_FIXED
      ),
    [variations]
  );
  const looseVariations = useMemo(
    () =>
      variations.filter((entry) =>
        normalizePurchaseMode(entry?.purchase_mode ?? entry?.purchaseMode) === PURCHASE_MODE_LOOSE
      ),
    [variations]
  );
  const activeVariations = purchaseMode === PURCHASE_MODE_LOOSE ? looseVariations : fixedVariations;
  const effectiveVariant = selectedVariant || pickDefaultVariant(activeVariations, displayProduct);
  const purchaseRules = useMemo(() => getVariantPurchaseRules(effectiveVariant), [effectiveVariant]);
  const selectionModel = normalizeSelectionMode(displayProduct?.selectionModel ?? displayProduct?.selection_model);
  const isFlexibleMarket = selectionModel === SELECTION_MODE_FLEXIBLE;
  const availabilityMode = getAvailabilityMode(effectiveVariant, displayProduct);
  const inventoryTrackingMode = getInventoryTrackingMode(effectiveVariant, displayProduct);
  const bypassLocalStock = availabilityMode === "request" || inventoryTrackingMode === "supplier";

  useEffect(() => {
    const pool = activeVariations.length ? activeVariations : variations;
    const currentId = String(selectedVariant?.variationId || selectedVariant?.id || "");
    const stillValid = currentId && pool.some((entry) => String(entry?.variationId || entry?.id || "") === currentId);
    if (!stillValid) {
      const next = pickDefaultVariant(pool, displayProduct);
      setSelectedVariant(next);
      setQuantity(getVariantPurchaseRules(next).minQuantity);
    }
  }, [activeVariations, displayProduct, selectedVariant?.id, selectedVariant?.variationId, variations]);

  const priceLabel = useMemo(() => {
    if (!displayProduct) return "";
    return formatProductPrice(getVariantPrice(effectiveVariant, displayProduct), "");
  }, [displayProduct, effectiveVariant]);
  const categoryLabel = useMemo(() => {
    const category = displayProduct?.category || displayProduct?.categorySlug || "";
    return CATEGORY_LABELS.get(category) || category || "Produce";
  }, [displayProduct]);

  const isUnavailable = isVariantInactive(effectiveVariant, displayProduct);
  const productImage = getVariantImage(effectiveVariant, displayProduct, product?.image);
  const productHref = displayProduct ? getProductHref(displayProduct) : "#";
  const productDescription = pickTextOrNull(
    displayProduct?.description,
    displayProduct?.shortDescription,
    displayProduct?.short_description
  );
  const availabilityLabel =
    availabilityMode === "request"
      ? "Available on request"
      : isUnavailable
        ? "Out of stock"
        : "Available";
  const availableCount = getAvailableCount(getStockValue(effectiveVariant, displayProduct));
  const effectiveMaxQuantity = !bypassLocalStock && Number.isFinite(availableCount)
    ? Math.min(purchaseRules.maxQuantity ?? availableCount, availableCount)
    : purchaseRules.maxQuantity;
  const quantityAtMin = quantity <= purchaseRules.minQuantity;
  const quantityAtMax = effectiveMaxQuantity != null && quantity >= effectiveMaxQuantity;

  const handleAdd = useCallback(
    async ({ variant, qty, closeAfter = true } = {}) => {
      const targetVariant = variant || effectiveVariant;
      const baseProduct = displayProduct;
      if (!baseProduct || !targetVariant) {
        setError("Select an option before adding to cart.");
        return;
      }
      const variantId = getVariantId(targetVariant, baseProduct);
      if (!variantId) {
        setError("Select an option before adding to cart.");
        return;
      }
      const targetAvailabilityMode = getAvailabilityMode(targetVariant, baseProduct);
      const targetInventoryMode = getInventoryTrackingMode(targetVariant, baseProduct);
      const targetBypassLocalStock = targetAvailabilityMode === "request" || targetInventoryMode === "supplier";
      if (targetAvailabilityMode === "unavailable") {
        const message = "This option is out of stock.";
        if (isDropdown) {
          setError(message);
        } else {
          showNotice({ tone: "error", title: "Out of stock", message });
        }
        return;
      }
      if (!targetBypassLocalStock) {
        const stockClass = resolveStockClass(getStockValue(targetVariant, baseProduct));
        if (stockClass === "is-unavailable") {
          const message = "This option is out of stock.";
          if (isDropdown) {
            setError(message);
          } else {
            showNotice({ tone: "error", title: "Out of stock", message });
          }
          return;
        }
      }
      const validation = validateVariantQuantity(targetVariant, qty ?? quantity);
      if (!validation.ok) {
        setError(validation.error);
        return;
      }
      const safeQty = validation.quantity;
      const availableCount = getAvailableCount(getStockValue(targetVariant, baseProduct));
      const cartSizePreference =
        normalizeSelectionMode(baseProduct?.selectionModel ?? baseProduct?.selection_model) === SELECTION_MODE_FLEXIBLE
          ? normalizeSizePreference(sizePreference, SELECTION_MODE_FLEXIBLE) || "best_available"
          : null;

      setStatus("adding");
      try {
        const items = readCartItems();
        const lineKey = getLineKey({ variantId, id: baseProduct.id, productId: baseProduct.id });
        const productIdKey = String(baseProduct.id || "");
        const index = items.findIndex((item) => {
          const itemKey = getLineKey(item);
          const itemProductKey = String(item?.productId || item?.id || "");
          return (
            itemKey === lineKey ||
            (!variantId && itemKey === productIdKey) ||
            (!variantId && itemProductKey === productIdKey)
          );
        });

        if (index >= 0) {
          const existing = items[index];
          const existingCount = normaliseOrderCount(existing.orderCount ?? existing.quantity ?? 0, targetVariant, 0);
          const nextCount = existingCount + safeQty;
          const nextValidation = validateVariantQuantity(targetVariant, nextCount);
          if (!nextValidation.ok) {
            setError(nextValidation.error);
            setStatus("ready");
            return;
          }
          if (!targetBypassLocalStock && Number.isFinite(availableCount) && nextCount > availableCount) {
            const message = `Only ${availableCount} item${availableCount === 1 ? "" : "s"} available.`;
            if (isDropdown) {
              setError(message);
            } else {
              showNotice({ tone: "info", title: "Limited stock", message, autoClose: true });
            }
            setStatus("ready");
            return;
          }
          items[index] = {
            ...existing,
            ...buildCartItem(baseProduct, targetVariant, nextCount, product?.image, cartSizePreference),
          };
        } else {
          if (!targetBypassLocalStock && Number.isFinite(availableCount) && safeQty > availableCount) {
            const message = `Only ${availableCount} item${availableCount === 1 ? "" : "s"} available.`;
            if (isDropdown) {
              setError(message);
            } else {
              showNotice({ tone: "info", title: "Limited stock", message, autoClose: true });
            }
            setStatus("ready");
            return;
          }
          items.push(buildCartItem(baseProduct, targetVariant, safeQty, product?.image, cartSizePreference));
        }

        if (readStoredUser()) {
          await addAuthenticatedCartItem(
            buildCartItem(baseProduct, targetVariant, safeQty, product?.image, cartSizePreference),
            { source: "quick-add" }
          );
        } else {
          writeCartItems(items, undefined, { source: "quick-add" });
        }

        setStatus("ready");
        if (closeAfter) onClose?.();
      } catch (err) {
        setStatus("ready");
        const message = err?.message || "Unable to add to cart.";
        setError(message);
        showNotice({ tone: "error", title: "Cart not updated", message });
      }
    },
    [displayProduct, effectiveVariant, isDropdown, onClose, product?.image, quantity, showNotice, sizePreference]
  );

  if (!isOpen) return null;

  const panelClassName = [
    "quick-add-panel",
    useCenteredModal ? "quick-add-panel--mobile-modal" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const panelContent = (
    <div
      className={panelClassName}
      role="dialog"
      aria-modal={isModalPresentation ? "true" : "false"}
      aria-label="Quick add"
      ref={panelRef}
    >
      <div className="quick-add-handle" aria-hidden="true" />
      <div className="quick-add-mobile-topbar">
        <button type="button" className="quick-add-mobile-topbar__close" onClick={onClose} aria-label="Close">
          <IconX size={22} stroke={2} aria-hidden="true" />
        </button>
        <strong>Product details</strong>
        <span aria-hidden="true">
          <IconShoppingBag size={22} stroke={1.8} />
        </span>
      </div>

      <div className="quick-add-header quick-add-desktop-header">
        <div>
          <p className="quick-add-label">Quick add</p>
          <h3 className="quick-add-title">{displayProduct?.name || "Select an option"}</h3>
          <p className="quick-add-category">{categoryLabel}</p>
        </div>
        <button type="button" className="quick-add-close" onClick={onClose} aria-label="Close">
          <IconX size={20} stroke={2} aria-hidden="true" />
        </button>
      </div>

      <div className="quick-add-mobile-product">
        <div className="quick-add-mobile-product__image">
          <Image
            src={productImage}
            alt={displayProduct?.name || "Product"}
            fill
            unoptimized={!canUseNextImageOptimization(productImage)}
            sizes="(max-width: 640px) 58vw, 1px"
          />
        </div>
        <div className="quick-add-mobile-product__intro">
          <p>{categoryLabel}</p>
          <h3>{displayProduct?.name || "Select an option"}</h3>
          <span className={isUnavailable ? "is-unavailable" : ""}>
            <i className="fa-solid fa-circle" aria-hidden="true" />
            {availabilityLabel}
          </span>
        </div>
      </div>

      {status === "loading" ? (
        <p className="quick-add-status">Loading options...</p>
      ) : status === "error" ? (
        <p className="quick-add-status is-error">{error || "Unable to load options."}</p>
      ) : status === "ready" || status === "adding" ? (
        <>
          {variations.length ? (
            <>
              <div className="quick-add-desktop-options">
                {fixedVariations.length && looseVariations.length ? (
                  <div className="product-variant-picker__section">
                    <p className="product-variant-picker__label">Purchase mode</p>
                    <div className="product-variant-picker__options" role="list">
                      <button
                        type="button"
                        className={`product-variant-picker__option${purchaseMode === PURCHASE_MODE_FIXED ? " is-active" : ""}`.trim()}
                        onClick={() => setPurchaseMode(PURCHASE_MODE_FIXED)}
                        aria-pressed={purchaseMode === PURCHASE_MODE_FIXED}
                      >
                        <span className="product-variant-picker__option-main">Pack</span>
                      </button>
                      <button
                        type="button"
                        className={`product-variant-picker__option${purchaseMode === PURCHASE_MODE_LOOSE ? " is-active" : ""}`.trim()}
                        onClick={() => setPurchaseMode(PURCHASE_MODE_LOOSE)}
                        aria-pressed={purchaseMode === PURCHASE_MODE_LOOSE}
                      >
                        <span className="product-variant-picker__option-main">Loose</span>
                      </button>
                    </div>
                  </div>
                ) : null}
                {purchaseMode === PURCHASE_MODE_FIXED && activeVariations.length ? (
                  <VariantPicker
                    variations={activeVariations}
                    selectedId={effectiveVariant?.variationId || effectiveVariant?.id}
                    onChange={(variant) => setSelectedVariant(variant)}
                  />
                ) : null}
              </div>

              <div className="quick-add-mobile-options">
                {fixedVariations.length && looseVariations.length ? (
                  <label>
                    <span>Purchase type</span>
                    <select
                      value={purchaseMode}
                      onChange={(event) => setPurchaseMode(event.target.value)}
                    >
                      <option value={PURCHASE_MODE_FIXED}>Pack</option>
                      <option value={PURCHASE_MODE_LOOSE}>Loose</option>
                    </select>
                  </label>
                ) : null}

                {activeVariations.length ? (
                  <label>
                    <span>Choose an option</span>
                    <select
                      className="quick-add-mobile-option-select"
                      value={String(getVariantId(effectiveVariant, displayProduct) || "")}
                      onChange={(event) => {
                        const next = activeVariations.find(
                          (entry) => String(getVariantId(entry, displayProduct)) === event.target.value
                        );
                        if (next) setSelectedVariant(next);
                      }}
                    >
                      {activeVariations.map((entry) => {
                        const entryId = String(getVariantId(entry, displayProduct) || "");
                        const entryName = buildVariantName(entry) || entry.unit || "Option";
                        const entryPrice = formatProductPrice(getVariantPrice(entry, displayProduct), "");
                        return (
                          <option key={entryId} value={entryId} disabled={isVariantInactive(entry, displayProduct)}>
                            {entryName} — {entryPrice}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                ) : null}
              </div>
            </>
          ) : null}

          {isFlexibleMarket ? (
            <>
              <div className="quick-add-desktop-size-preference">
                <SizePreferencePicker
                  value={sizePreference}
                  onChange={setSizePreference}
                  compact
                />
              </div>
              <label className="quick-add-mobile-size-preference">
                <span>Piece size preference</span>
                <select value={sizePreference} onChange={(event) => setSizePreference(event.target.value)}>
                  <option value="best_available">Best available</option>
                  <option value="smaller">Small</option>
                  <option value="medium">Medium</option>
                  <option value="larger">Large</option>
                </select>
                <small>We’ll try to match your preferred produce size.</small>
              </label>
            </>
          ) : null}

          {availabilityMode === "request" ? <AvailabilityRequestNotice compact /> : null}

          <div className="quick-add-summary">
            <div>
              <p className="quick-add-summary__label">Price</p>
              <p className="quick-add-summary__value">{priceLabel}</p>
            </div>
            <div className="quick-add-qty">
              <button
                type="button"
                onClick={() => setQuantity((prev) => clampQuantityToRules(effectiveVariant, prev - purchaseRules.stepQuantity))}
                disabled={quantityAtMin}
                aria-label="Decrease quantity"
              >
                -
              </button>
              <input
                type="number"
                min={purchaseRules.minQuantity}
                max={effectiveMaxQuantity ?? undefined}
                step={purchaseRules.stepQuantity}
                inputMode={purchaseRules.purchaseMode === PURCHASE_MODE_LOOSE ? "decimal" : "numeric"}
                value={quantity}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setQuantity(Number.isFinite(next) && next > 0 ? next : purchaseRules.minQuantity);
                }}
                onBlur={() => setQuantity(clampQuantityToRules(effectiveVariant, quantity))}
              />
              <button
                type="button"
                onClick={() => {
                  setQuantity((prev) => {
                    const next = prev + purchaseRules.stepQuantity;
                    const max = effectiveMaxQuantity ?? purchaseRules.maxQuantity;
                    return clampQuantityToRules(
                      { ...effectiveVariant, maxQuantity: max, max_quantity: max ?? effectiveVariant?.max_quantity },
                      next
                    );
                  });
                }}
                disabled={quantityAtMax}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </div>

          <section className="quick-add-mobile-about" aria-labelledby="quick-add-about-title">
            <h4 id="quick-add-about-title">About this product</h4>
            {productDescription ? <p>{productDescription}</p> : null}
            <Link href={productHref} onClick={onClose}>View full product details</Link>
          </section>

          {error ? <p className="quick-add-status is-error">{error}</p> : null}

          <button
            type="button"
            className="quick-add-cta"
            onClick={() => handleAdd({})}
            disabled={!effectiveVariant || isUnavailable || status === "adding"}
          >
            {isUnavailable ? (
              "Out of stock"
            ) : status === "adding" ? (
              "Adding..."
            ) : availabilityMode === "request" ? (
              <>
                <IconShoppingBag size={20} stroke={1.8} aria-hidden="true" />
                Add to availability basket
              </>
            ) : (
              <>
                <IconShoppingBag size={20} stroke={1.8} aria-hidden="true" />
                Add to cart
              </>
            )}
          </button>
        </>
      ) : (
        <p className="quick-add-status">Preparing options...</p>
      )}
    </div>
  );

  const overlay = (
    <div className={`quick-add-overlay${useCenteredModal ? " quick-add-overlay--centered" : ""}`.trim()}>
      <button
        type="button"
        className={`quick-add-backdrop${isDropdown ? " quick-add-backdrop--blur" : ""}`.trim()}
        onClick={onClose}
        aria-label="Close quick add"
      />
      {panelContent}
    </div>
  );

  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}
