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
import useProducts from "@/lib/use-products";

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

export default function ShopPage() {
  const pageRef = useRef(null);
  const [activeSlug, setActiveSlug] = useState("all");
  const [categories, setCategories] = useState([]);
  const [sort, setSort] = useState("default");
  const [currentPage, setCurrentPage] = useState(1);
  const [quickAddProduct, setQuickAddProduct] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddAnchorEl, setQuickAddAnchorEl] = useState(null);

  const { ordered, status } = useProducts();
  const isLoading = status === "loading";
  const hasError = status === "error";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/categories", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled) {
          setCategories(Array.isArray(payload?.categories) ? payload.categories : []);
        }
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const filteredProducts = useMemo(() => {
    if (!ordered) return [];
    let list = activeSlug === "all" ? ordered : ordered.filter((p) => p.categorySlug === activeSlug);
    if (sort === "price-asc") list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") list = [...list].sort((a, b) => b.price - a.price);
    else if (sort === "name-asc") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [ordered, activeSlug, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));

  useEffect(() => { setCurrentPage(1); }, [activeSlug, sort]);

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
    <main ref={pageRef} className="category-page">
      <div className="category-page__header">
        <div className="category-page__title">
          <span className="categoryCard__icon" aria-hidden="true">
            <i className="fa-solid fa-basket-shopping" />
          </span>
          <div>
            <h1 className="categoryCard__label">Shop</h1>
            <p className="category-page__description">
              Farm-sourced produce, proteins, grains, and more — delivered fresh in Ibadan.
            </p>
          </div>
        </div>
      </div>

      {/* Category filter tabs */}
      <div style={{ overflowX: "auto", paddingBottom: "0.5rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", minWidth: "max-content", padding: "0 0.25rem" }}>
          <button
            type="button"
            onClick={() => setActiveSlug("all")}
            className={`category-carousel__card${activeSlug === "all" ? " is-active" : ""}`}
            style={{ flexShrink: 0, padding: "0.5rem 1rem", borderRadius: "999px", border: "1.5px solid var(--mk-border)", background: activeSlug === "all" ? "var(--mk-accent)" : "var(--mk-surface)", color: activeSlug === "all" ? "#fff" : "var(--mk-text)", fontWeight: 600, fontSize: "0.875rem", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            All products
          </button>
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/categories/${cat.slug}`}
              style={{ flexShrink: 0, padding: "0.5rem 1rem", borderRadius: "999px", border: "1.5px solid var(--mk-border)", background: activeSlug === cat.slug ? "var(--mk-accent)" : "var(--mk-surface)", color: activeSlug === cat.slug ? "#fff" : "var(--mk-text)", fontWeight: 600, fontSize: "0.875rem", cursor: "pointer", whiteSpace: "nowrap" }}
            >
              {cat.label || cat.name}
            </Link>
          ))}
        </div>
      </div>

      {/* Sort bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <p style={{ color: "var(--mk-text-subtle)", fontSize: "0.875rem" }}>
          {isLoading ? "Loading..." : `${filteredProducts.length} product${filteredProducts.length === 1 ? "" : "s"}`}
        </p>
        <SortSelect
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          options={SORT_OPTIONS}
          selectStyle={{ padding: "0.4rem 0.8rem", borderRadius: "8px", border: "1.5px solid var(--mk-border)", background: "var(--mk-surface)", color: "var(--mk-text)", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer" }}
        />
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
            renderProduct={(product) => (
              <ProductCard key={product.id} product={product} onQuickAdd={handleQuickAdd} />
            )}
          />
        ) : (
          <PageState title="No products in this category right now.">
            <Link href="/shop" style={{ marginTop: "0.75rem", display: "inline-block" }} onClick={() => setActiveSlug("all")}>
              View all products
            </Link>
          </PageState>
        )}
      </section>

      {/* Pagination */}
      <div className="category-page__pagination">
        <p className="category-page__result-count" aria-live="polite">
          {isLoading ? "Loading..." : filteredProducts.length ? `Showing ${start}–${end} of ${filteredProducts.length} products` : ""}
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

      <CategoryCarousel cards={categoryCards} heading="Browse by category" eyebrow="Shop by aisle" activeSlug={activeSlug !== "all" ? activeSlug : undefined} />

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
