"use client";

import Image from "next/image";
import { useMemo, useState, useEffect } from "react";
import { resolveStockClass } from "@/lib/catalogue";
import AddToCartForm from "@/components/add-to-cart-form";
import VariantPicker from "@/components/variant-picker";
import { useNotice } from "@/components/notice-provider";
import { readStoredUser } from "@/lib/auth";
import { buildSignInHref } from "@/lib/auth-redirect";
import { resolveProductImage } from "@/lib/product-image";
import { formatMoney } from "@/lib/region";
import { PURCHASE_MODE_FIXED, PURCHASE_MODE_LOOSE, normalizePurchaseMode } from "@/lib/purchase-quantities";
import { shouldShowSeasonBadge } from "@/lib/season-badge";
import { loadFavoriteIds, updateFavoriteIds } from "@/lib/favorites-client";
import { IconHeart } from "@tabler/icons-react";

const isVariantInactive = (variant) => {
  if (!variant || typeof variant !== "object") return true;
  if (variant.isSelectable === false || variant.is_active === false || variant.isActive === false) return true;
  const stockSource = Number.isFinite(Number(variant.stockCount)) ? Number(variant.stockCount) : variant.stock;
  const stockClass = resolveStockClass(stockSource);
  return stockClass === "is-unavailable";
};

const pickDefaultVariant = (variations) => {
  if (!Array.isArray(variations) || variations.length === 0) return null;
  const selectable = variations.filter((v) => v && !isVariantInactive(v));
  const pool = selectable.length ? selectable : variations;
  const explicit = pool.find((v) => v && v.is_default === true);
  if (explicit) return explicit;
  const withPrice = pool
    .filter((v) => v && v.price != null && Number.isFinite(Number(v.price)))
    .sort((a, b) => Number(a.price) - Number(b.price));
  if (withPrice.length) return withPrice[0];
  return pool[0] || null;
};

const formatUnitLabel = (unit) => {
  const normalized = String(unit || "").trim();
  if (!normalized) return "unit";
  return normalized.replace(/^per\s+/i, "") || "unit";
};

const buildStars = (value) => {
  const safeValue = Math.max(0, Math.min(Number(value) || 0, 5));
  return Array.from({ length: 5 }, (_, index) => ({
    value: index + 1,
    isActive: index + 1 <= Math.round(safeValue),
  }));
};

const formatCategory = (value) =>
  String(value || "Fresh market")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export default function ProductDetailClient({ product, variations = [], fallbackImage, ratings }) {
  const { showNotice } = useNotice();
  const defaultVariant = useMemo(() => pickDefaultVariant(variations), [variations]);
  const [selectedVariant, setSelectedVariant] = useState(defaultVariant || null);
  const [purchaseMode, setPurchaseMode] = useState(() =>
    normalizePurchaseMode(defaultVariant?.purchase_mode ?? defaultVariant?.purchaseMode)
  );
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [saved, setSaved] = useState(false);
  const [favoriteStatus, setFavoriteStatus] = useState("idle");
  const fixedVariations = useMemo(
    () =>
      variations.filter((variant) =>
        normalizePurchaseMode(variant?.purchase_mode ?? variant?.purchaseMode) === PURCHASE_MODE_FIXED
      ),
    [variations]
  );
  const looseVariations = useMemo(
    () =>
      variations.filter((variant) =>
        normalizePurchaseMode(variant?.purchase_mode ?? variant?.purchaseMode) === PURCHASE_MODE_LOOSE
      ),
    [variations]
  );
  const hasFixedVariations = fixedVariations.length > 0;
  const hasLooseVariations = looseVariations.length > 0;
  const selectableVariations = purchaseMode === PURCHASE_MODE_LOOSE ? looseVariations : fixedVariations;

  const handlePurchaseModeChange = (nextMode) => {
    const nextVariations = nextMode === PURCHASE_MODE_LOOSE ? looseVariations : fixedVariations;
    setPurchaseMode(nextMode);
    setSelectedVariant(pickDefaultVariant(nextVariations) || null);
  };

  useEffect(() => {
    setSelectedVariant(defaultVariant || null);
    setPurchaseMode(normalizePurchaseMode(defaultVariant?.purchase_mode ?? defaultVariant?.purchaseMode));
  }, [defaultVariant]);

  useEffect(() => {
    const pool = selectableVariations.length ? selectableVariations : variations;
    const currentStillValid = pool.some(
      (variant) => String(variant?.variationId || variant?.id || "") === String(selectedVariant?.variationId || selectedVariant?.id || "")
    );
    if (!currentStillValid) {
      setSelectedVariant(pickDefaultVariant(pool) || null);
    }
  }, [purchaseMode, selectableVariations, selectedVariant?.id, selectedVariant?.variationId, variations]);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [product?.id, selectedVariant]);

  useEffect(() => {
    if (!readStoredUser() || !product?.id) {
      setSaved(false);
      return undefined;
    }

    const controller = new AbortController();
    loadFavoriteIds()
      .then((ids) => {
        if (controller.signal.aborted) return;
        setSaved(ids.includes(String(product.id)));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [product?.id]);

  const handleSaveToggle = async () => {
    if (!readStoredUser()) {
      const next = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/shop";
      const href = buildSignInHref({ tab: "login", next, hash: "loginForm" });
      showNotice({
        tone: "info",
        title: "Sign in required",
        message: "Create or sign in to your account to save Favorites.",
        dismissText: "Later",
        actions: [
          {
            label: "Sign in",
            variant: "primary",
            onClick: () => {
              if (typeof window !== "undefined") window.location.href = href;
            },
          },
        ],
      });
      return;
    }
    if (favoriteStatus === "saving") return;

    const wasSaved = saved;
    setSaved(!wasSaved);
    setFavoriteStatus("saving");
    try {
      const response = await fetch(
        wasSaved ? `/api/favorites?productId=${encodeURIComponent(product.id)}` : "/api/favorites",
        {
          method: wasSaved ? "DELETE" : "POST",
          cache: "no-store",
          headers: wasSaved ? undefined : { "Content-Type": "application/json" },
          body: wasSaved ? undefined : JSON.stringify({ productId: product.id }),
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to update Favorites.");
      }
      updateFavoriteIds((current) =>
        wasSaved ? current.filter((favoriteId) => favoriteId !== String(product.id)) : [String(product.id), ...current]
      );
    } catch (error) {
      setSaved(wasSaved);
      showNotice({
        tone: "error",
        title: "Favorites not updated",
        message: error?.message || "Please try again.",
        autoClose: true,
      });
    } finally {
      setFavoriteStatus("idle");
    }
  };

  const display = useMemo(() => {
    if (!selectedVariant) return { ...product, image: resolveProductImage(product.image, fallbackImage) };
    const variantNameParts = [
      selectedVariant.ripeness,
      selectedVariant.sizeLabel || selectedVariant.size,
      selectedVariant.packaging,
    ].filter(Boolean);
    const variantName =
      variantNameParts.length > 0
        ? variantNameParts.join(" / ")
        : selectedVariant.name || selectedVariant.ripeness || selectedVariant.size || selectedVariant.packaging;
    return {
      ...product,
      price: selectedVariant.price ?? product.price,
      oldPrice: selectedVariant.oldPrice ?? product.oldPrice,
      unit: selectedVariant.unit || product.unit,
      stock: selectedVariant.stockCount ?? selectedVariant.stock ?? product.stock,
      image: resolveProductImage(selectedVariant.image, product.image, fallbackImage),
      variantId: selectedVariant.variationId,
      variantName,
      purchaseMode: selectedVariant.purchaseMode ?? selectedVariant.purchase_mode,
      purchase_mode: selectedVariant.purchase_mode ?? selectedVariant.purchaseMode,
      minQuantity: selectedVariant.minQuantity,
      min_quantity: selectedVariant.min_quantity ?? selectedVariant.minQuantity,
      maxQuantity: selectedVariant.maxQuantity,
      max_quantity: selectedVariant.max_quantity ?? selectedVariant.maxQuantity,
      stepQuantity: selectedVariant.stepQuantity,
      step_quantity: selectedVariant.step_quantity ?? selectedVariant.stepQuantity,
      baseUnit: selectedVariant.baseUnit ?? selectedVariant.base_unit,
      base_unit: selectedVariant.base_unit ?? selectedVariant.baseUnit,
      baseQuantity: selectedVariant.baseQuantity ?? selectedVariant.base_quantity,
      base_quantity: selectedVariant.base_quantity ?? selectedVariant.baseQuantity,
      weightMin: selectedVariant.weightMin ?? selectedVariant.weight_min,
      weight_min: selectedVariant.weight_min ?? selectedVariant.weightMin,
      weightMax: selectedVariant.weightMax ?? selectedVariant.weight_max,
      weight_max: selectedVariant.weight_max ?? selectedVariant.weightMax,
      weightUnit: selectedVariant.weightUnit ?? selectedVariant.weight_unit,
      weight_unit: selectedVariant.weight_unit ?? selectedVariant.weightUnit,
      volumeMin: selectedVariant.volumeMin ?? selectedVariant.volume_min,
      volume_min: selectedVariant.volume_min ?? selectedVariant.volumeMin,
      volumeMax: selectedVariant.volumeMax ?? selectedVariant.volume_max,
      volume_max: selectedVariant.volume_max ?? selectedVariant.volumeMax,
      volumeUnit: selectedVariant.volumeUnit ?? selectedVariant.volume_unit,
      volume_unit: selectedVariant.volume_unit ?? selectedVariant.volumeUnit,
      optionRole: selectedVariant.optionRole ?? selectedVariant.option_role,
      option_role: selectedVariant.option_role ?? selectedVariant.optionRole,
    };
  }, [product, selectedVariant, fallbackImage]);

  const selectedVariantLabel = useMemo(() => {
    if (!selectedVariant) return "";
    const parts = [
      selectedVariant.ripeness,
      selectedVariant.sizeLabel || selectedVariant.size,
      selectedVariant.packaging,
    ].filter(Boolean);
    if (parts.length) return parts.join(" / ");
    return selectedVariant.name || "";
  }, [selectedVariant]);

  const galleryImages = useMemo(() => {
    const variantGallery = Array.isArray(selectedVariant?.galleryImageUrls) ? selectedVariant.galleryImageUrls : [];
    const productGallery = Array.isArray(product?.galleryImageUrls) ? product.galleryImageUrls : [];
    const base = variantGallery.length ? variantGallery : productGallery;
    const main = resolveProductImage(display.image, fallbackImage);
    const merged = base.map((image) => resolveProductImage(image)).filter(Boolean);
    if (main && !merged.includes(main)) merged.unshift(main);
    return merged.length ? merged : [resolveProductImage(fallbackImage)];
  }, [selectedVariant?.galleryImageUrls, product?.galleryImageUrls, display.image, fallbackImage]);

  const activeImage =
    resolveProductImage(galleryImages[Math.min(activeImageIndex, galleryImages.length - 1)], fallbackImage);

  const stockClass = resolveStockClass(display.stock);
  const isUnavailable = stockClass === "is-unavailable";
  const showSeasonBadge = shouldShowSeasonBadge(display);
  const isInSeason = display.inSeason !== false;
  const seasonLabel = isInSeason ? "In season" : "Off season";
  const unitLabel = formatUnitLabel(display.unit);
  const categoryLabel = formatCategory(display.category || product.category);
  const ratingAverage = Number(ratings?.average || 4.6);
  const reviewCount = Number(ratings?.totalRatings || ratings?.totalReviews || 128);
  const savings = Number(display.oldPrice) > Number(display.price) ? Number(display.oldPrice) - Number(display.price) : 0;

  return (
    <>
      <div className="product-detail-visual">
        <div className="product-detail-media">
          <div className="product-detail-badges product-detail-badges--media">
            {display.discount ? <span className="product-detail-discount">{display.discount}% Off</span> : null}
            {showSeasonBadge ? (
              <span className={`product-detail-season ${isInSeason ? "is-in-season" : "is-off-season"}`}>
                {seasonLabel}
              </span>
            ) : null}
          </div>
          <Image
            className="product-detail-media__image"
            src={resolveProductImage(activeImage, fallbackImage)}
            alt={product.name}
            width={640}
            height={380}
            sizes="(max-width: 900px) 100vw, 420px"
            loading="lazy"
          />
          {isUnavailable ? (
            <div className="product-detail-media__overlay" aria-hidden="true">Out of Stock</div>
          ) : null}
        </div>
        {galleryImages.length ? (
          <div className="product-detail-thumbs" role="listbox" aria-label="Product images">
            {galleryImages.map((src, idx) => {
              return (
                <button
                  key={`${product.id}-thumb-${idx}-${src}`}
                  type="button"
                  className={`product-detail-thumb${idx === activeImageIndex ? " is-active" : ""}`}
                  onClick={() => setActiveImageIndex(idx)}
                  aria-pressed={idx === activeImageIndex}
                >
                  <Image
                    src={src}
                    alt={`Thumbnail ${idx + 1}`}
                    width={56}
                    height={56}
                    sizes="56px"
                    loading="lazy"
                  />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="product-detail-content product-detail-content--hero">
        <p className="product-detail-category">{categoryLabel}</p>
        <h1>{product.name}</h1>
        <div className="product-detail-rating" aria-label={`${ratingAverage.toFixed(1)} out of 5 from ${reviewCount} reviews`}>
          <span className="product-detail-rating__stars" aria-hidden="true">
            {buildStars(ratingAverage).map((star) => (
              <i key={star.value} className={`${star.isActive ? "fa-solid" : "fa-regular"} fa-star`} />
            ))}
          </span>
          <strong>{ratingAverage.toFixed(1)}</strong>
          <span>{reviewCount.toLocaleString()} reviews</span>
        </div>
        <div className="product-detail-pricing">
          <span className="product-detail-price">{formatMoney(display.price)}</span>
          {display.oldPrice && display.oldPrice > display.price ? (
            <>
              <span className="product-detail-old-price">{formatMoney(display.oldPrice)}</span>
              <span className="product-detail-savings">Save {formatMoney(savings)}</span>
            </>
          ) : null}
        </div>

        {hasFixedVariations && hasLooseVariations ? (
          <div className="product-variant-picker__section">
            <p className="product-variant-picker__label">Purchase mode</p>
            <div className="product-variant-picker__options" role="list">
              <button
                type="button"
                className={`product-variant-picker__option${purchaseMode === PURCHASE_MODE_FIXED ? " is-active" : ""}`.trim()}
                onClick={() => handlePurchaseModeChange(PURCHASE_MODE_FIXED)}
                aria-pressed={purchaseMode === PURCHASE_MODE_FIXED}
              >
                <span className="product-variant-picker__option-main">Pack</span>
              </button>
              <button
                type="button"
                className={`product-variant-picker__option${purchaseMode === PURCHASE_MODE_LOOSE ? " is-active" : ""}`.trim()}
                onClick={() => handlePurchaseModeChange(PURCHASE_MODE_LOOSE)}
                aria-pressed={purchaseMode === PURCHASE_MODE_LOOSE}
              >
                <span className="product-variant-picker__option-main">Loose</span>
              </button>
            </div>
          </div>
        ) : null}

        {selectableVariations.length ? (
          <VariantPicker
            key={purchaseMode}
            variations={selectableVariations}
            selectedId={selectedVariant?.variationId}
            onChange={(v) => setSelectedVariant(v)}
          />
        ) : null}

        <AddToCartForm
          product={{
            ...display,
            image: activeImage,
            variantName: selectedVariantLabel || display.variantName,
          }}
          fallbackImage={fallbackImage}
        />

        <button
          type="button"
          className={`product-detail-save${saved ? " is-saved" : ""}`}
          onClick={handleSaveToggle}
          aria-pressed={saved}
          aria-busy={favoriteStatus === "saving"}
          disabled={favoriteStatus === "saving"}
        >
          <IconHeart size={19} fill={saved ? "currentColor" : "none"} stroke={saved ? 2.4 : 1.8} aria-hidden="true" />
          <span>{saved ? "Saved to Favorites" : "Save to Favorites"}</span>
        </button>
      </div>
    </>
  );
}
