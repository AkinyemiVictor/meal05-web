"use client";

import Link from "next/link";
import ProductCard from "@/components/product-card";

export default function HomeProductCollection({
  eyebrow = "Top picks",
  title,
  products = [],
  status = "ready",
  emptyMessage = "No items are available in this collection yet.",
  seeAllHref,
  onAdd,
  showSeasonBadge = true,
  actionLabel,
  preserveSingleRow = false,
  variant = "home",
}) {
  const isLoading = status === "loading";
  const hasError = status === "error";
  const isLandingVariant = variant === "landing" || preserveSingleRow;
  const mobileProducts = products.slice(0, isLandingVariant ? 4 : 8);
  const desktopProducts = products.slice(0, isLandingVariant ? 4 : 12);

  return (
    <>
      <div className="mt-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-meal-pepper">{eyebrow}</p>
          <h2 className="mt-2 text-3xl font-semibold italic tracking-tight text-meal-text">{title}</h2>
        </div>
        {seeAllHref ? (
          <Link href={seeAllHref} className="text-sm font-medium uppercase tracking-[0.28em] text-meal-pepper">
            See all
          </Link>
        ) : null}
      </div>

      {isLoading || hasError ? (
        <div className="mt-6 rounded-3xl border border-meal-line bg-meal-paper p-6 text-sm font-medium text-meal-muted shadow-soft">
          {isLoading ? "Loading live Meal05 catalogue..." : "Unable to load the live Meal05 catalogue right now."}
        </div>
      ) : products.length ? (
        <>
          <div className="mt-6 md:hidden">
            <div
              className="home-product-collection__grid home-product-collection__grid--mobile grid grid-cols-2 gap-[0.85rem]"
            >
              {mobileProducts.map((product) => (
                <div key={product.variantId || product.id} className="min-w-0">
                  <ProductCard
                    product={product}
                    onAdd={onAdd}
                    showSeasonBadge={showSeasonBadge}
                    actionLabel={actionLabel}
                    className={
                      isLandingVariant
                        ? "home-product-collection__product-card--landing-mobile"
                        : "home-product-collection__product-card--home-mobile"
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div
            className={`mt-6 min-w-0 gap-6 ${
              isLandingVariant
                ? "home-product-collection__grid home-product-collection__grid--landing hidden md:grid md:grid-cols-2 xl:grid-cols-4"
                : "home-product-collection__grid home-product-collection__grid--home hidden grid-cols-[repeat(3,minmax(0,1fr))] md:grid 2xl:grid-cols-[repeat(4,minmax(0,1fr))]"
            }`}
          >
            {desktopProducts.map((product) => (
              <div key={product.variantId || product.id} className="home-product-collection__card min-w-0">
                <ProductCard
                  product={product}
                  onAdd={onAdd}
                  showSeasonBadge={showSeasonBadge}
                  actionLabel={actionLabel}
                  className={isLandingVariant ? "home-product-collection__product-card--landing" : undefined}
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-3xl border border-dashed border-meal-line bg-meal-paper p-6 text-sm font-medium text-meal-muted shadow-soft">
          {emptyMessage}
        </div>
      )}
    </>
  );
}
