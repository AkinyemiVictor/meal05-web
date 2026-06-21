"use client";

import Image from "next/image";
import { useMemo, useState, useEffect } from "react";
import { resolveStockClass } from "@/lib/catalogue";
import AddToCartForm from "@/components/add-to-cart-form";
import VariantPicker from "@/components/variant-picker";
import { resolveProductImage } from "@/lib/product-image";
import { formatMoney } from "@/lib/region";

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

export default function ProductDetailClient({ product, variations = [], fallbackImage }) {
  const defaultVariant = useMemo(() => pickDefaultVariant(variations), [variations]);
  const [selectedVariant, setSelectedVariant] = useState(defaultVariant || null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    setSelectedVariant(defaultVariant || null);
  }, [defaultVariant]);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [product?.id, selectedVariant]);

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
  const unitLabel = formatUnitLabel(display.unit);

  return (
    <>
      <div className="product-detail-visual">
        <div className="product-detail-media">
          <div className="product-detail-badges product-detail-badges--media">
            {display.discount ? <span className="product-detail-discount">{display.discount}% Off</span> : null}
            <span className={`product-detail-season ${display.inSeason ? "is-in-season" : "is-off-season"}`}>
              {display.inSeason ? "In Season" : "Out of Season"}
            </span>
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
        {galleryImages.length > 1 ? (
          <div className="product-detail-thumbs" role="listbox" aria-label="Product images">
            {galleryImages.map((src, idx) => (
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
            ))}
          </div>
        ) : null}
      </div>

      <div className="product-detail-content product-detail-content--hero">
        <h1>{product.name}</h1>
        <div className="product-detail-pricing">
          <span className="product-detail-price">{formatMoney(display.price)}</span>
          <span className="product-detail-price-unit">/{unitLabel}</span>
          {display.oldPrice && display.oldPrice > display.price ? (
            <span className="product-detail-old-price">{formatMoney(display.oldPrice)}/{unitLabel}</span>
          ) : null}
        </div>

        {Array.isArray(variations) && variations.length ? (
          <VariantPicker
            variations={variations}
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
      </div>
    </>
  );
}
