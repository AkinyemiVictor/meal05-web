"use client";

import Image from "next/image";
import Link from "next/link";
import { IconShoppingCart, IconSparkles } from "@tabler/icons-react";

import { formatProductPrice, resolveStockClass } from "@/lib/catalogue";
import { resolveProductImage } from "@/lib/product-image";
import { getProductHref } from "@/lib/products";

const classNames = (...items) => items.filter(Boolean).join(" ");

const formatNaira = (value) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

function ProductImage({ product }) {
  const src = resolveProductImage(product.image, product.mainImageUrl);
  const unavailable = resolveStockClass(product.stock) === "is-unavailable";

  return (
    <Link
      href={getProductHref(product)}
      className="relative block aspect-[1.06/1] overflow-hidden rounded-3xl border border-meal-line bg-meal-mist"
      aria-label={`View ${product.name}`}
    >
      {product.discount ? (
        <span className="absolute left-4 top-4 z-10 rounded-lg bg-meal-pepper px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-meal-paper">
          {product.discount}% off
        </span>
      ) : null}
      {product.inSeason ? (
        <span className="absolute right-4 top-4 z-10 rounded-lg bg-meal-green/20 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-meal-text">
          In season
        </span>
      ) : null}
      <Image
        src={src}
        alt={product.name}
        fill
        unoptimized
        sizes="(max-width: 767px) 82vw, (max-width: 1023px) 30vw, 220px"
        className="object-contain p-8"
      />
      {unavailable ? (
        <div className="absolute inset-0 grid place-items-center bg-meal-paper/50">
          <span className="-rotate-6 bg-meal-ink px-5 py-2 text-sm font-medium uppercase tracking-[0.22em] text-meal-paper">
            Depleted
          </span>
        </div>
      ) : null}
    </Link>
  );
}

export default function ProductCard({ product, onAdd, onQuickAdd, className }) {
  const stockClass = resolveStockClass(product.stock);
  const unavailable = stockClass === "is-unavailable";
  const productHref = getProductHref(product);

  const handleAdd = (event) => {
    const handler = onQuickAdd || onAdd;
    handler?.(product, event.currentTarget);
  };

  return (
    <article className={classNames("meal05-product-card relative z-10 min-w-0 rounded-[28px] bg-meal-paper p-4 shadow-meal", className)}>
      <ProductImage product={product} />
      <div className="grid min-h-[188px] grid-rows-[auto_1fr_auto] pt-4">
        <div className="relative min-w-0 pr-12">
          <div className="min-w-0">
            <p className="w-full truncate text-[11px] font-medium uppercase tracking-[0.16em] text-meal-muted">
              {product.category || "Fresh market"}
            </p>
            <Link
              href={productHref}
              className="mt-2 block h-6 w-full truncate text-base font-medium leading-6 text-meal-text"
              title={product.name}
            >
              {product.name}
            </Link>
          </div>
          <Link
            href={productHref}
            className="absolute right-0 top-0 grid h-10 w-10 place-items-center rounded-full border border-meal-line text-meal-muted"
            aria-label={`View ${product.name}`}
          >
            <IconSparkles size={18} stroke={1.8} />
          </Link>
        </div>
        <div className="self-end">
          <div>
            <p className="text-xl font-medium tracking-tight text-meal-text">
              {formatProductPrice(product.price, product.unit)}
            </p>
            {Number(product.oldPrice) > Number(product.price) ? (
              <p className="mt-1 text-sm font-medium text-meal-muted line-through">
                {formatNaira(product.oldPrice)}
                {product.unit ? `/${product.unit}` : ""}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={unavailable}
            onClick={handleAdd}
            className={classNames(
              "mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 text-xs font-medium uppercase tracking-[0.18em] transition",
              unavailable
                ? "border border-dashed border-meal-line bg-meal-mist text-meal-muted"
                : "bg-meal-ink text-meal-paper hover:bg-meal-pepper"
            )}
          >
            <IconShoppingCart size={17} stroke={1.8} />
            {unavailable ? "Out of stock" : "Add to order"}
          </button>
        </div>
      </div>
    </article>
  );
}
