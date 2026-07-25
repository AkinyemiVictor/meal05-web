"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import ProductCard from "@/components/product-card";
import ProductGrid from "@/components/product-grid";

const QuickAddDrawer = dynamic(() => import("@/components/quick-add-drawer"), { ssr: false });

const normalise = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formatCategoryLabel = (value) =>
  String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

export default function SearchResultsClient({ products = [] }) {
  const [quickAddProduct, setQuickAddProduct] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddAnchorEl, setQuickAddAnchorEl] = useState(null);

  const groupedResults = useMemo(() => {
    const grouped = new Map();
    products.forEach((product) => {
      const slug = normalise(product.categorySlug || product.category) || "other";
      if (!grouped.has(slug)) {
        grouped.set(slug, {
          slug,
          label: product.category || formatCategoryLabel(slug) || "More staples",
          items: [],
        });
      }
      grouped.get(slug).items.push(product);
    });
    return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [products]);
  const priorityProductIds = useMemo(
    () => new Set(groupedResults.flatMap((group) => group.items).slice(0, 4).map((product) => String(product.id))),
    [groupedResults]
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
        {groupedResults.map((group) => (
          <section key={group.slug} className="search-results-group">
            <header className="search-results-group__header">
              <span className="search-results-group__eyebrow">Category</span>
              <h2>{group.label}</h2>
            </header>
            <ProductGrid
              products={group.items}
              renderProduct={(product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onQuickAdd={handleQuickAdd}
                  priority={priorityProductIds.has(String(product.id))}
                />
              )}
            />
          </section>
        ))}
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
