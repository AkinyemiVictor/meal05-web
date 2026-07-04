"use client";

import Link from "next/link";
import ProductCard from "@/components/product-card";
import ScaledCard from "@/components/scaled-card";

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
}) {
  const isLoading = status === "loading";
  const hasError = status === "error";

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
          <div className={`mt-6 ${preserveSingleRow ? "hidden" : "md:hidden"}`}>
            <div className="-mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-3 [scrollbar-width:none]">
              {products.slice(0, 8).map((product) => (
                <div key={product.variantId || product.id} className="w-[82vw] max-w-[340px] shrink-0 snap-start">
                  <ProductCard product={product} onAdd={onAdd} showSeasonBadge={showSeasonBadge} actionLabel={actionLabel} />
                </div>
              ))}
            </div>
          </div>

          <div className={`mt-6 min-w-0 gap-6 ${preserveSingleRow ? "home-product-collection--single-row grid grid-cols-[repeat(4,minmax(0,1fr))]" : "hidden grid-cols-[repeat(3,minmax(0,1fr))] md:grid lg:grid-cols-[repeat(4,minmax(0,1fr))]"}`}>
            {products.slice(0, 12).map((product) => (
              <div key={product.variantId || product.id} className="home-product-collection__card min-w-0">
                {preserveSingleRow ? (
                  <ScaledCard>
                    <ProductCard product={product} onAdd={onAdd} showSeasonBadge={showSeasonBadge} actionLabel={actionLabel} />
                  </ScaledCard>
                ) : (
                  <ProductCard product={product} onAdd={onAdd} showSeasonBadge={showSeasonBadge} actionLabel={actionLabel} />
                )}
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
