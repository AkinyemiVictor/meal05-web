"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import ProductCard from "@/components/product-card";
import ProductGrid from "@/components/product-grid";

const QuickAddDrawer = dynamic(() => import("@/components/quick-add-drawer"), { ssr: false });

const requireCanonicalQuickAddMetadata = (product) =>
  product && typeof product === "object"
    ? { ...product, optionsLoaded: false }
    : product;

export default function SearchResultsClient({ products = [] }) {
  const [quickAddProduct, setQuickAddProduct] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddAnchorEl, setQuickAddAnchorEl] = useState(null);

  const priorityProductIds = useMemo(
    () => new Set(products.slice(0, 4).map((product) => String(product.id))),
    [products]
  );

  const handleQuickAddClose = () => {
    setQuickAddOpen(false);
    setQuickAddProduct(null);
    setQuickAddAnchorEl(null);
  };

  const handleQuickAdd = (product, anchorEl) => {
    if (!product) return;
    if (quickAddOpen && quickAddProduct?.id === product.id) {
      handleQuickAddClose();
      return;
    }
    setQuickAddAnchorEl(anchorEl || null);
    setQuickAddProduct(requireCanonicalQuickAddMetadata(product));
    setQuickAddOpen(true);
  };

  return (
    <>
      <div className="category-products">
        <ProductGrid
          products={products}
          className="search-results-grid"
          renderProduct={(product) => (
            <ProductCard
              key={product.id}
              product={product}
              onQuickAdd={handleQuickAdd}
              priority={priorityProductIds.has(String(product.id))}
            />
          )}
        />
      </div>
      <QuickAddDrawer
        product={quickAddProduct}
        isOpen={quickAddOpen}
        onClose={handleQuickAddClose}
        variant="dropdown"
        anchorEl={quickAddAnchorEl}
      />

      <style jsx global>{`
        .category-products .product-card-grid.search-results-grid {
          --search-grid-cols: 5;
          --search-grid-gap: 1.5rem;
          gap: var(--search-grid-gap);
          justify-content: flex-start;
        }

        .category-products .product-card-grid.search-results-grid > .product-card,
        .category-products .product-card-grid.search-results-grid > .meal05-product-card {
          flex: 0 0 calc((100% - (var(--search-grid-cols) - 1) * var(--search-grid-gap)) / var(--search-grid-cols));
          max-width: calc((100% - (var(--search-grid-cols) - 1) * var(--search-grid-gap)) / var(--search-grid-cols));
          min-width: 0;
        }

        @media (max-width: 1200px) {
          .category-products .product-card-grid.search-results-grid {
            --search-grid-cols: 4;
          }
        }

        @media (max-width: 960px) {
          .category-products .product-card-grid.search-results-grid {
            --search-grid-cols: 3;
          }
        }

        @media (max-width: 720px) {
          .category-products .product-card-grid.search-results-grid {
            --search-grid-cols: 2;
            --search-grid-gap: 0.85rem;
          }
        }
      `}</style>
    </>
  );
}
