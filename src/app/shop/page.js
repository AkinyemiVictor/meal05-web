"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import ProductGridSkeleton from "@/components/product-grid-skeleton";
import CategoryCarouselSkeleton from "@/components/category-carousel-skeleton";
import ProductCard from "@/components/product-card";
import PageState from "@/components/page-state";
import ProductGrid from "@/components/product-grid";
import SortSelect from "@/components/sort-select";
import {
  buildCatalogItems,
  getCatalogItemName,
  getCatalogItemPrice,
} from "@/lib/catalog-items";
import useCategories from "@/lib/use-categories";
import { useCatalogProducts } from "@/lib/use-catalog-products";
import LocationPicker from "@/components/location-picker";

const CategoryCarousel = dynamic(() => import("@/components/category-carousel"), {
  loading: () => <CategoryCarouselSkeleton />,
});
const QuickAddDrawer = dynamic(() => import("@/components/quick-add-drawer"), { ssr: false });

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: "default", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name-asc", label: "Name: A–Z" },
];

const interleaveByCategory = (items = []) => {
  const groups = new Map();
  items.forEach((item) => {
    const key = item.categorySlug || item.category || "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const queues = [...groups.values()];
  const mixed = [];
  let remaining = true;
  while (remaining) {
    remaining = false;
    queues.forEach((queue) => {
      if (queue.length) {
        mixed.push(queue.shift());
        remaining = true;
      }
    });
  }
  return mixed;
};

export default function ShopPage() {
  const pageRef = useRef(null);
  const [sort, setSort] = useState("default");
  const [currentPage, setCurrentPage] = useState(1);
  const [quickAddProduct, setQuickAddProduct] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddAnchorEl, setQuickAddAnchorEl] = useState(null);

  const { ordered, status } = useCatalogProducts("/api/catalog/cards?limit=120");
  const { categories, status: categoriesStatus } = useCategories();
  const isLoading = status === "loading";
  const hasError = status === "error";
  const hasCategoriesError = categoriesStatus === "error";

  const categoryCards = useMemo(
    () =>
      categories.map((entry) => ({
        slug: entry.slug,
        label: entry.label || entry.name,
        icon: entry.icon || "fa-basket-shopping",
        href: `/categories/${entry.slug}`,
      })),
    [categories]
  );

  const catalogItems = useMemo(() => {
    return interleaveByCategory(buildCatalogItems(ordered));
  }, [ordered]);

  const filteredProducts = useMemo(() => {
    if (!ordered) return [];
    let list = catalogItems;
    if (sort === "price-asc") list = [...list].sort((a, b) => getCatalogItemPrice(a) - getCatalogItemPrice(b));
    else if (sort === "price-desc") list = [...list].sort((a, b) => getCatalogItemPrice(b) - getCatalogItemPrice(a));
    else if (sort === "name-asc") list = [...list].sort((a, b) => getCatalogItemName(a).localeCompare(getCatalogItemName(b)));
    return list;
  }, [ordered, sort, catalogItems]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));

  useEffect(() => { setCurrentPage(1); }, [sort]);

  const pagedProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, currentPage]);

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    setCurrentPage(page);
    pageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleQuickAdd = (product, anchorEl) => {
    if (!product) return;
    if (quickAddOpen && quickAddProduct?.id === product.id) {
      setQuickAddOpen(false);
      setQuickAddProduct(null);
      return;
    }
    setQuickAddAnchorEl(anchorEl || null);
    setQuickAddProduct(product);
    setQuickAddOpen(true);
  };

  const handleQuickAddClose = () => {
    setQuickAddOpen(false);
    setQuickAddProduct(null);
    setQuickAddAnchorEl(null);
  };

  const start = filteredProducts.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(currentPage * PAGE_SIZE, filteredProducts.length);

  return (
    <main ref={pageRef} className="category-page shop-page">
      <LocationPicker autoOpen hideTrigger />
      <div className="category-page__header">
        <div className="category-page__title">
          <span className="categoryCard__icon" aria-hidden="true">
            <i className="fa-solid fa-basket-shopping" />
          </span>
          <div>
            <span className="category-page__eyebrow">The Meal05 market</span>
            <h1 className="shop-page__heading">Shop fresh groceries</h1>
            <p className="category-page__description">
              Farm-sourced produce, proteins, grains, and more — delivered fresh in Ibadan.
            </p>
          </div>
        </div>
      </div>

      {/* Product grid */}
      <section className="category-products" aria-live="polite">
        {isLoading ? (
          <ProductGridSkeleton count={12} />
        ) : hasError ? (
          <PageState title="We couldn't load products right now.">
            Please refresh the page or try again in a moment.
          </PageState>
        ) : filteredProducts.length ? (
          <ProductGrid
            products={pagedProducts}
            renderProduct={(item) => (
              <ProductCard key={item.id} product={item.product} onQuickAdd={handleQuickAdd} />
            )}
          />
        ) : (
          <PageState title="No products in this category right now.">
            <Link href="/shop" style={{ marginTop: "0.75rem", display: "inline-block" }}>
              View all products
            </Link>
          </PageState>
        )}
      </section>

      {/* Pagination */}
      <div className="category-page__pagination">
        <p className="category-page__result-count" aria-live="polite">
          {isLoading ? "Loading..." : filteredProducts.length ? `Showing ${start}-${end} of ${filteredProducts.length} items` : ""}
        </p>
        {totalPages > 1 ? (
          <div className="pagination-nav" role="navigation" aria-label="Pagination">
            <button type="button" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}>Prev</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => handlePageChange(page)}
                className={page === currentPage ? "active" : undefined}
                aria-current={page === currentPage ? "page" : undefined}
              >
                {page}
              </button>
            ))}
            <button type="button" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}>Next</button>
          </div>
        ) : null}
      </div>

      {hasCategoriesError ? null : (
        <CategoryCarousel
          cards={categoryCards}
          heading="Browse by category"
          eyebrow="Shop by aisle"
          className="category-carousel--compact"
        />
      )}

      {quickAddProduct ? (
        <QuickAddDrawer
          product={quickAddProduct}
          isOpen={quickAddOpen}
          onClose={handleQuickAddClose}
          variant="dropdown"
          anchorEl={quickAddAnchorEl}
        />
      ) : null}
    </main>
  );
}
