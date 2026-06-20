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
      className="relative flex aspect-[1.06/1] items-center justify-center overflow-hidden rounded-3xl border border-meal-line bg-meal-mist"
      aria-label={`View ${product.name}`}
    >
      <div className="absolute left-4 right-4 top-4 z-10 flex min-w-0 items-start justify-between gap-2">
        {product.discount ? (
          <span className="max-w-[48%] shrink-0 truncate rounded-lg bg-meal-pepper px-2.5 py-1 text-[10px] font-medium uppercase leading-none tracking-wider text-meal-paper sm:text-[11px]">
            {product.discount}% off
          </span>
        ) : (
          <span aria-hidden="true" />
        )}
        {product.inSeason ? (
          <span className="ml-auto max-w-[48%] shrink-0 truncate rounded-lg bg-meal-green/20 px-2.5 py-1 text-[10px] font-medium uppercase leading-none tracking-wider text-meal-text sm:text-[11px]">
            In season
          </span>
        ) : null}
      </div>
      <Image
        src={src}
        alt={product.name}
        fill
        unoptimized
        sizes="(max-width: 767px) 82vw, (max-width: 1023px) 30vw, 220px"
        className="object-contain object-center p-10"
      />
      {unavailable ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-meal-paper/50">
          <span className="-rotate-6 whitespace-nowrap bg-meal-ink px-5 py-2 text-sm font-medium uppercase tracking-[0.18em] text-meal-paper">
            Out of stock
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
