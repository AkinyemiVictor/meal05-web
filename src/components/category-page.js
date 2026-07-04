"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import CategoryCarouselSkeleton from "@/components/category-carousel-skeleton";
import ProductCard from "@/components/product-card";
import PageBreadcrumbs from "@/components/page-breadcrumbs";
import PageState from "@/components/page-state";
import ProductGrid from "@/components/product-grid";

const CategoryCarousel = dynamic(() => import("@/components/category-carousel"), {
  loading: () => <CategoryCarouselSkeleton />,
});
const QuickAddDrawer = dynamic(() => import("@/components/quick-add-drawer"), {
  ssr: false,
});

const DEFAULT_PAGE_SIZE = 20;

const mapCategoryCard = (entry) => ({
  slug: entry.slug,
  label: entry.label || entry.name,
  icon: entry.icon || "fa-basket-shopping",
  href: `/categories/${entry.slug}`,
});

export default function CategoryPage({
  category,
  products = [],
  categories = [],
  pageSize = DEFAULT_PAGE_SIZE,
  status = "ready",
}) {
  const pageRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [quickAddProduct, setQuickAddProduct] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddAnchorRect, setQuickAddAnchorRect] = useState(null);
  const [quickAddAnchorEl, setQuickAddAnchorEl] = useState(null);

  const itemsPerPage = category?.itemsPerPage || pageSize || DEFAULT_PAGE_SIZE;
  const isLoadingProducts = status === "loading";
  const hasProductsError = status === "error";
  const categoryProducts = useMemo(() => {
    return Array.isArray(products) ? products.slice() : [];
  }, [products]);
  const totalPages = Math.max(1, Math.ceil(categoryProducts.length / itemsPerPage));

  useEffect(() => {
    setCurrentPage(1);
  }, [categoryProducts.length, itemsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (currentPage === 1) return;
    const target = pageRef.current;
    if (target?.scrollIntoView) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentPage]);

  const pagedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return categoryProducts.slice(start, start + itemsPerPage);
  }, [categoryProducts, currentPage, itemsPerPage]);

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    setCurrentPage(page);
  };

  const handleQuickAdd = (product, anchorEl) => {
    if (!product) return;
    if (quickAddOpen && quickAddProduct?.id === product.id) {
      handleQuickAddClose();
      return;
    }
    const rect = anchorEl?.getBoundingClientRect ? anchorEl.getBoundingClientRect() : null;
    setQuickAddAnchorEl(anchorEl || null);
    setQuickAddAnchorRect(rect);
    setQuickAddProduct(product);
    setQuickAddOpen(true);
  };

  const handleQuickAddClose = () => {
    setQuickAddOpen(false);
    setQuickAddProduct(null);
    setQuickAddAnchorRect(null);
    setQuickAddAnchorEl(null);
  };

  useEffect(() => {
    if (!quickAddOpen || !quickAddAnchorEl?.getBoundingClientRect) return;
    const updateAnchor = () => {
      try {
        setQuickAddAnchorRect(quickAddAnchorEl.getBoundingClientRect());
      } catch {
        setQuickAddAnchorRect(null);
      }
    };
    updateAnchor();
    window.addEventListener("scroll", updateAnchor, true);
    window.addEventListener("resize", updateAnchor);
    return () => {
      window.removeEventListener("scroll", updateAnchor, true);
      window.removeEventListener("resize", updateAnchor);
    };
  }, [quickAddOpen, quickAddAnchorEl]);

  if (!category) {
    return (
      <main className="category-page">
        <PageState title="Category not found.">
          Please return to the home page to explore available aisles.
        </PageState>
      </main>
    );
  }

  const start = categoryProducts.length ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const end = Math.min(currentPage * itemsPerPage, categoryProducts.length);
  const categoryCards = (Array.isArray(categories) ? categories : []).map(mapCategoryCard);

  return (
    <main ref={pageRef} className="category-page" data-category-slug={category.slug}>
      <PageBreadcrumbs
        items={[
          { label: "Home", href: "/home" },
          { label: "Shop", href: "/shop" },
          { label: category.label },
        ]}
      />
      <div className="category-page__header">
        <div className="category-page__title">
          <span className="categoryCard__icon" aria-hidden="true">
            <i className={`fa-solid ${category.icon}`} />
          </span>
          <div>
            <h1 className="categoryCard__label">{category.label}</h1>
            {category.description ? (
              <p className="category-page__description">{category.description}</p>
            ) : null}
          </div>
        </div>
      </div>

      <section className="category-products" aria-live="polite">
        {isLoadingProducts ? (
          <PageState title="Loading products..." />
        ) : categoryProducts.length ? (
          <ProductGrid
            products={pagedProducts}
            renderProduct={(product) => (
              <ProductCard key={product.id} product={product} onQuickAdd={handleQuickAdd} />
            )}
          />
        ) : hasProductsError ? (
          <PageState title="We couldn't load products right now.">
            Please try again in a moment.
          </PageState>
        ) : (
          <PageState title="No products are available right now.">
            Please check back soon - we are updating this aisle.
          </PageState>
        )}
      </section>

      <div className="category-page__pagination">
        <p id="result-count" className="category-page__result-count" aria-live="polite">
          {isLoadingProducts
            ? "Loading products..."
            : categoryProducts.length
              ? `Showing ${start}–${end} of ${categoryProducts.length} products`
              : hasProductsError
                ? "Unable to load products right now"
                : "No products available right now"}
        </p>
        {totalPages > 1 ? (
          <div className="pagination-nav" role="navigation" aria-label="Pagination">
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
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
            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>

      <CategoryCarousel
        cards={categoryCards}
        heading="Explore more categories"
        eyebrow="Shop by aisle"
        activeSlug={category.slug}
        className="category-carousel--compact"
      />

      {quickAddProduct ? (
        <QuickAddDrawer
          product={quickAddProduct}
          isOpen={quickAddOpen}
          onClose={handleQuickAddClose}
          variant="dropdown"
          anchorRect={quickAddAnchorRect}
          anchorEl={quickAddAnchorEl}
        />
      ) : null}
    </main>
  );
}
