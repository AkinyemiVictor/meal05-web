"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import VariantPicker from "@/components/variant-picker";
import categories from "@/data/categories";
import { formatProductPrice, resolveStockClass } from "@/lib/catalogue";
import { readCartItems, writeCartItems } from "@/lib/cart-storage";
import { getAvailableCount } from "@/lib/stock";
import { useNotice } from "@/components/notice-provider";
import { resolveProductImage } from "@/lib/product-image";
import { readStoredUser } from "@/lib/auth";

const ORDER_SIZE = 1;
const CATEGORY_LABELS = new Map(categories.map((category) => [category.slug, category.label]));

const normaliseOrderCount = (value, fallback = 1) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(1, Math.round(numeric));
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

const getVariantImage = (variant, product, fallback) =>
  resolveProductImage(variant?.image, product?.image, fallback);

const getStockValue = (variant, product) => {
  const count = Number(variant?.stockCount);
  if (Number.isFinite(count)) return count;
  if (variant?.stock != null) return variant.stock;
  const productCount = Number(product?.stock);
  if (Number.isFinite(productCount)) return productCount;
  return product?.stock ?? "";
};

const isVariantInactive = (variant, product) => {
  if (!variant || typeof variant !== "object") return true;
  if (variant.isSelectable === false || variant.is_active === false || variant.isActive === false) return true;
  const stockClass = resolveStockClass(getStockValue(variant, product));
  return stockClass === "is-unavailable";
};

const buildCartItem = (product, variant, orderCount, fallbackImage) => {
  const variantId = getVariantId(variant, product);
  const lineId = variantId || product?.id || "";
  const unit = getVariantUnit(variant, product) || "Per pack";
  const price = getVariantPrice(variant, product);
  const variantName = buildVariantName(variant);
  const stock = variant?.stock ?? product?.stock ?? "In Stock";
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
    orderSize: ORDER_SIZE,
    orderCount,
    quantity: orderCount,
    stock,
    note: "Added from quick add",
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
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");

  const productId = product?.id;
  const useCenteredModal = isDropdown;
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
      setQuantity(1);
      return;
    }
    if (!productId) return;

    let cancelled = false;
    const cacheKey = String(productId);
    const cached = cacheRef.current.get(cacheKey);

    setStatus("loading");
    setError("");
    setDetail(null);
    setVariations([]);
    setSelectedVariant(null);
    setQuantity(1);

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
      setStatus("ready");
      cacheRef.current.set(cacheKey, { product: detailProduct, variations: list });
    };

    if (cached) {
      applyData(cached);
      return () => {
        cancelled = true;
      };
    }

    fetch(`/api/products/${productId}`)
      .then((res) => res.json())
      .then((json) => applyData(json))
      .catch((err) => {
        if (cancelled) return;
        setStatus("error");
        setError(err?.message || "Unable to load variants.");
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, productId]);

  const displayProduct = detail || product || null;
  const effectiveVariant = selectedVariant || pickDefaultVariant(variations, displayProduct);
  const priceLabel = useMemo(() => {
    if (!displayProduct) return "";
    return formatProductPrice(getVariantPrice(effectiveVariant, displayProduct), getVariantUnit(effectiveVariant, displayProduct));
  }, [displayProduct, effectiveVariant]);
  const addTotalLabel = useMemo(() => {
    const price = getVariantPrice(effectiveVariant, displayProduct) * normaliseOrderCount(quantity, 1);
    return formatProductPrice(price, "").replace(/\/$/, "");
  }, [displayProduct, effectiveVariant, quantity]);
  const categoryLabel = useMemo(() => {
    const category = displayProduct?.category || displayProduct?.categorySlug || "";
    return CATEGORY_LABELS.get(category) || category || "Produce";
  }, [displayProduct]);

  const isUnavailable = isVariantInactive(effectiveVariant, displayProduct);

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
      const safeQty = normaliseOrderCount(qty ?? quantity, 1);
      const availableCount = getAvailableCount(getStockValue(targetVariant, baseProduct));

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
          const existingCount = normaliseOrderCount(existing.orderCount ?? existing.quantity ?? 0, 0);
          const nextCount = existingCount + safeQty;
          if (Number.isFinite(availableCount) && nextCount > availableCount) {
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
            ...buildCartItem(baseProduct, targetVariant, nextCount, product?.image),
            note: existing.note || "Added from quick add",
          };
        } else {
          if (Number.isFinite(availableCount) && safeQty > availableCount) {
            const message = `Only ${availableCount} item${availableCount === 1 ? "" : "s"} available.`;
            if (isDropdown) {
              setError(message);
            } else {
              showNotice({ tone: "info", title: "Limited stock", message, autoClose: true });
            }
            setStatus("ready");
            return;
          }
          items.push(buildCartItem(baseProduct, targetVariant, safeQty, product?.image));
        }

        writeCartItems(items, undefined, { source: "quick-add" });

        try {
          if (readStoredUser()) {
            fetch("/api/cart", {
              method: "POST",
              cache: "no-store",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                product_id: baseProduct.id,
                variant_id: variantId,
                variant_name: buildVariantName(targetVariant) || targetVariant?.name || baseProduct.unit || "Default",
                product_name: baseProduct.name,
                unit_price_at_add: getVariantPrice(targetVariant, baseProduct),
                quantity: safeQty,
              }),
            }).catch(() => {});
          }
        } catch (_) {}

        if (!isDropdown) {
          showNotice({
            tone: "success",
            title: "Added to cart",
            message: `${baseProduct.name} added to your cart.`,
            autoClose: true,
          });
        }
        setStatus("ready");
        if (closeAfter) onClose?.();
      } catch (err) {
        setStatus("ready");
        setError(err?.message || "Unable to add to cart.");
      }
    },
    [displayProduct, effectiveVariant, isDropdown, onClose, product?.image, quantity, showNotice]
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
      <div className="quick-add-header">
        <div>
          <p className="quick-add-label">Quick add</p>
          <h3 className="quick-add-title">{displayProduct?.name || "Select an option"}</h3>
          <p className="quick-add-category">{categoryLabel}</p>
        </div>
        <button type="button" className="quick-add-close" onClick={onClose} aria-label="Close">
          X
        </button>
      </div>

      {status === "loading" ? (
        <p className="quick-add-status">Loading options...</p>
      ) : status === "error" ? (
        <p className="quick-add-status is-error">{error || "Unable to load options."}</p>
      ) : status === "ready" || status === "adding" ? (
        <>
          {variations.length ? (
            <VariantPicker
              variations={variations}
              selectedId={effectiveVariant?.variationId || effectiveVariant?.id}
              onChange={(variant) => setSelectedVariant(variant)}
            />
          ) : null}

          <div className="quick-add-summary">
            <div>
              <p className="quick-add-summary__label">Price</p>
              <p className="quick-add-summary__value">{priceLabel}</p>
            </div>
            <div className="quick-add-qty">
              <button
                type="button"
                onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setQuantity(Number.isInteger(next) && next >= 1 ? next : 1);
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const availableCount = getAvailableCount(getStockValue(effectiveVariant, displayProduct));
                  setQuantity((prev) => {
                    const next = prev + 1;
                    return Number.isFinite(availableCount) ? Math.min(next, Math.max(1, availableCount)) : next;
                  });
                }}
                disabled={Number.isFinite(getAvailableCount(getStockValue(effectiveVariant, displayProduct))) && quantity >= getAvailableCount(getStockValue(effectiveVariant, displayProduct))}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </div>

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
            ) : (
              <>
                <i className="fa-solid fa-basket-shopping" aria-hidden="true"></i>
                Add to cart · {addTotalLabel}
              </>
            )}
          </button>
        </>
      ) : (
        <p className="quick-add-status">Preparing options...</p>
      )}
    </div>
  );

  return (
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
}
