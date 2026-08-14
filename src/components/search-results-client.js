"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import ProductCard from "@/components/product-card";
import ProductGrid from "@/components/product-grid";

const QuickAddDrawer = dynamic(() => import("@/components/quick-add-drawer"), { ssr: false });

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
    setQuickAddProduct(product);
    setQuickAddOpen(true);
  };

  return (
    <>
      <div className="category-products">
        <ProductGrid
          products={products}
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
    </>
  );
}
