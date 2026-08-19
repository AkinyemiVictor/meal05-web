"use client";

import Image from "next/image";
import Link from "next/link";
import { IconShoppingCart } from "@tabler/icons-react";

import FavoriteToggleButton from "@/components/favorite-toggle-button";
import { formatProductPrice, resolveStockClass } from "@/lib/catalogue";
import { resolveProductImage } from "@/lib/product-image";
import { getProductHref } from "@/lib/products";
import { shouldShowSeasonBadge } from "@/lib/season-badge";

const classNames = (...items) => items.filter(Boolean).join(" ");
const canUseNextImageOptimization = (src) =>
  String(src || "").startsWith("/") ||
  /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//i.test(String(src || ""));

const formatNaira = (value) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

function ProductImage({ product, compact = false, priority = false }) {
  const src = resolveProductImage(product.cardImageUrl, product.image, product.mainImageUrl);
  const unavailable = resolveStockClass(product.stock) === "is-unavailable";
  const canShowSeasonBadge = shouldShowSeasonBadge(product);
  const shouldOptimize = canUseNextImageOptimization(src);
  const imageSizes = compact
    ? "(max-width: 767px) 42vw, (max-width: 1023px) 24vw, 180px"
    : "(max-width: 767px) 46vw, (max-width: 1023px) 30vw, 220px";

  return (
    <Link
      href={getProductHref(product)}
      prefetch={false}
      className={classNames(
        "relative block overflow-hidden border border-meal-line bg-meal-mist",
        compact ? "aspect-square rounded-[24px]" : "aspect-[1.06/1] rounded-3xl"
      )}
      aria-label={`View ${product.name}`}
    >
      <div
        className={classNames(
          "absolute z-10 flex min-w-0 items-start justify-start gap-2",
          compact ? "left-2.5 right-2.5 top-2.5" : "left-3 right-3 top-3 sm:left-4 sm:right-4 sm:top-4"
        )}
      >
        {canShowSeasonBadge && product.inSeason ? (
          <span
            className={classNames(
              "max-w-[calc(70%-0.25rem)] shrink truncate rounded-lg bg-meal-green/20 font-medium uppercase leading-none tracking-wider text-meal-text",
              compact ? "px-1.5 py-1 text-[9px]" : "px-2 py-1 text-[10px] sm:px-2.5 sm:text-[11px]"
            )}
          >
            In season
          </span>
        ) : null}
      </div>
      <div
        className={classNames(
          "absolute",
          compact ? "inset-x-3 bottom-3 top-9" : "inset-x-4 bottom-4 top-10 sm:inset-x-5 sm:bottom-5 sm:top-11"
        )}
      >
        <Image
          src={src}
          alt={product.name}
          fill
          priority={priority}
          unoptimized={!shouldOptimize}
          sizes={imageSizes}
          className="object-contain object-center"
        />
      </div>
      {unavailable ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-meal-paper/50">
          <span className="product-card__depleted-stamp">
            Depleted
          </span>
        </div>
      ) : null}
    </Link>
  );
}

export default function ProductCard({
  product,
  onAdd,
  onQuickAdd,
  className,
  actionLabel = "Add to cart",
  compact = false,
  priority = false,
}) {
  const stockClass = resolveStockClass(product.stock);
  const unavailable = stockClass === "is-unavailable";
  const productHref = getProductHref(product);
  const currentPrice = Number(product.price ?? product.starting_price ?? 0);
  const oldPrice = Number(
    product.oldPrice ??
      product.old_price ??
      product.compareAtPrice ??
      product.compare_at_price ??
      product.listPrice ??
      product.list_price ??
      0
  );
  const hasOldPrice = Number.isFinite(oldPrice) && Number.isFinite(currentPrice) && oldPrice > currentPrice && currentPrice > 0;

  const handleAdd = (event) => {
    const handler = onQuickAdd || onAdd;
    handler?.(product, event.currentTarget);
  };

  return (
    <article
      className={classNames(
        "meal05-product-card relative z-10 min-w-0 bg-meal-paper shadow-meal",
        compact ? "rounded-[24px] p-3" : "rounded-[28px] p-4",
        className
      )}
    >
      <ProductImage product={product} compact={compact} priority={priority} />
      <div className={classNames("flex flex-col", compact ? "min-h-[166px] pt-3" : "min-h-[212px] pt-4")}>
        <div className={classNames("relative min-w-0", compact ? "pr-10" : "pr-12")}>
          <Link
            href={productHref}
            prefetch={false}
            className="block min-w-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-meal-pepper/60"
            aria-label={`View ${product.name}`}
          >
            <p className={classNames("w-full truncate font-medium uppercase text-meal-muted", compact ? "text-[10px] tracking-[0.14em]" : "text-[11px] tracking-[0.16em]")}>
              {product.category || "Fresh market"}
            </p>
            <span
              className={classNames(
                "w-full overflow-hidden font-medium text-meal-text",
                compact ? "mt-1.5 max-h-10 text-[14px] leading-5" : "mt-2 max-h-12 text-base leading-6"
              )}
              style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}
              title={product.name}
            >
              {product.name}
            </span>
          </Link>
          <FavoriteToggleButton
            productId={product.id || product.productId}
            productName={product.name}
            iconSize={compact ? 15 : 18}
            className={classNames(
              "absolute right-0 top-0 grid place-items-center rounded-full border border-meal-line text-meal-muted transition disabled:cursor-wait",
              compact ? "h-8 w-8" : "h-10 w-10"
            )}
          />
        </div>

        <Link
          href={productHref}
          prefetch={false}
          className={classNames(
            "block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-meal-pepper/60",
            compact ? "mt-2" : "mt-2.5"
          )}
          aria-label={`View ${product.name} details`}
        >
          <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
            <p
              className={classNames(
                "shrink-0 font-medium leading-none tracking-tight text-meal-text",
                compact
                  ? "text-[14px] sm:text-base lg:text-lg"
                  : "text-[15px] sm:text-lg lg:text-xl"
              )}
            >
              {product.hasMultipleOptions ? "From " : ""}{formatProductPrice(product.price, "")}
            </p>
            {hasOldPrice ? (
              <p
                className={classNames(
                  "shrink-0 font-medium leading-none text-meal-muted line-through",
                  compact
                    ? "text-[10px] sm:text-xs lg:text-[13px]"
                    : "text-[11px] sm:text-xs lg:text-sm"
                )}
              >
                {formatNaira(oldPrice)}
              </p>
            ) : null}
          </div>
        </Link>

        <div className={classNames("mt-auto", compact ? "pt-3" : "pt-4")}>
          <button
            type="button"
            disabled={unavailable}
            onClick={handleAdd}
            className={classNames(
              compact
                ? "flex h-10 w-full items-center justify-center gap-1.5 rounded-xl px-3 text-[10px] font-medium uppercase tracking-[0.14em] transition"
                : "flex h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 text-xs font-medium uppercase tracking-[0.18em] transition",
              unavailable
                ? "border border-dashed border-meal-line bg-meal-mist text-meal-muted"
                : "bg-meal-ink text-meal-paper hover:bg-meal-pepper"
            )}
          >
            <IconShoppingCart size={compact ? 15 : 17} stroke={1.8} />
            {unavailable ? "Out of stock" : actionLabel}
          </button>
        </div>
      </div>
    </article>
  );
}
