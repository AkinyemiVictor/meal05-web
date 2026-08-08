"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconSearch } from "@tabler/icons-react";

import ProductGridSkeleton from "@/components/product-grid-skeleton";
import CategoryCarouselSkeleton from "@/components/category-carousel-skeleton";
import ProductCard from "@/components/product-card";
import PageState from "@/components/page-state";
import ProductGrid from "@/components/product-grid";
import { buildCatalogItems } from "@/lib/catalog-items";
import useCategories from "@/lib/use-categories";
import { useCatalogProducts } from "@/lib/use-catalog-products";

const CategoryCarousel = dynamic(() => import("@/components/category-carousel"), {
  loading: () => <CategoryCarouselSkeleton />,
});
const QuickAddDrawer = dynamic(() => import("@/components/quick-add-drawer"), { ssr: false });

const PAGE_SIZE = 20;

export default function ShopPage() {
  const pageRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [quickAddProduct, setQuickAddProduct] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddAnchorEl, setQuickAddAnchorEl] = useState(null);

  const catalogUrl = useMemo(
    () => `/api/catalog/cards?page=${currentPage}&pageSize=${PAGE_SIZE}&sort=default`,
    [currentPage]
  );
  const { ordered, status, pagination } = useCatalogProducts(catalogUrl);
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

  const pagedProducts = useMemo(() => buildCatalogItems(ordered), [ordered]);
  const totalItems = Number(pagination?.total || 0);
  const totalPages = Math.max(1, Number(pagination?.totalPages || 1));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

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

  const start = totalItems ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(currentPage * PAGE_SIZE, totalItems);

  return (
    <main ref={pageRef} className="category-page shop-page">
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

      <form action="/search" method="get" className="shop-page__search" role="search">
        <IconSearch size={19} stroke={1.9} aria-hidden="true" />
        <label htmlFor="shop-mobile-search" className="sr-only">Search products</label>
        <input
          id="shop-mobile-search"
          type="search"
          name="q"
          placeholder="Search meal05"
          autoComplete="off"
          required
        />
        <button type="submit" aria-label="Search">
          <IconSearch size={17} stroke={2} aria-hidden="true" />
        </button>
      </form>

      {/* Product grid */}
      <section className="category-products" aria-live="polite">
        {isLoading ? (
          <ProductGridSkeleton count={12} />
        ) : hasError ? (
          <PageState title="We couldn't load products right now.">
            Please refresh the page or try again in a moment.
          </PageState>
        ) : pagedProducts.length ? (
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
          {isLoading ? "Loading..." : totalItems ? `Showing ${start}-${end} of ${totalItems} items` : ""}
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
