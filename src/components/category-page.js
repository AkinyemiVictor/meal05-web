"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import CategoryCarouselSkeleton from "@/components/category-carousel-skeleton";
import ProductCard from "@/components/product-card";
import PageBreadcrumbs from "@/components/page-breadcrumbs";
import PageState from "@/components/page-state";
import ProductGrid from "@/components/product-grid";
import { buildPaginationItems } from "@/lib/pagination";
import usePaginationState from "@/lib/use-pagination-state";

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
  pagination = null,
  pageSize = DEFAULT_PAGE_SIZE,
  status = "ready",
}) {
  const [currentPage, setCurrentPage] = usePaginationState(category?.slug);
  const [quickAddProduct, setQuickAddProduct] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddAnchorRect, setQuickAddAnchorRect] = useState(null);
  const [quickAddAnchorEl, setQuickAddAnchorEl] = useState(null);
  const [pageProducts, setPageProducts] = useState(() => (Array.isArray(products) ? products : []));
  const [pageStatus, setPageStatus] = useState(status);
  const pageCacheRef = useRef(new Map([[1, Array.isArray(products) ? products : []]]));

  const itemsPerPage = Number(pagination?.pageSize || category?.itemsPerPage || pageSize || DEFAULT_PAGE_SIZE);
  const isLoadingProducts = pageStatus === "loading";
  const hasProductsError = pageStatus === "error";
  const categoryProducts = useMemo(() => {
    return Array.isArray(pageProducts) ? pageProducts.slice() : [];
  }, [pageProducts]);
  const totalItems = Number(pagination?.total ?? category?.product_count ?? categoryProducts.length) || 0;
  const totalPages = Math.max(1, Number(pagination?.totalPages || Math.ceil(totalItems / itemsPerPage)) || 1);
  const paginationItems = useMemo(
    () => buildPaginationItems(currentPage, totalPages),
    [currentPage, totalPages]
  );

  useEffect(() => {
    const initialProducts = Array.isArray(products) ? products : [];
    setPageProducts(initialProducts);
    setPageStatus(status);
    pageCacheRef.current = new Map([[1, initialProducts]]);
  }, [category?.slug, products, status]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages, { replace: true });
    }
  }, [currentPage, setCurrentPage, totalPages]);

  useEffect(() => {
    const cached = pageCacheRef.current.get(currentPage);
    if (cached) {
      setPageProducts(cached);
      setPageStatus("ready");
      return undefined;
    }

    let cancelled = false;
    setPageStatus("loading");
    const loadPage = async () => {
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(itemsPerPage),
        category: category.slug,
        sort: "default",
      });
      try {
        const response = await fetch(`/api/catalog/cards?${params.toString()}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (cancelled) return;
        const nextProducts = Array.isArray(payload?.flat) ? payload.flat : [];
        pageCacheRef.current.set(currentPage, nextProducts);
        setPageProducts(nextProducts);
        setPageStatus("ready");
      } catch {
        if (cancelled) return;
        setPageProducts([]);
        setPageStatus("error");
      }
    };
    loadPage();
    return () => {
      cancelled = true;
    };
  }, [category.slug, currentPage, itemsPerPage]);

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
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

  const start = totalItems && categoryProducts.length ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const end = Math.min((currentPage - 1) * itemsPerPage + categoryProducts.length, totalItems);
  const categoryCards = (Array.isArray(categories) ? categories : []).map(mapCategoryCard);

  return (
    <main className="category-page" data-category-slug={category.slug}>
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
            products={categoryProducts}
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
              ? `Showing ${start}-${end} of ${totalItems} products`
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
            {paginationItems.map((item) =>
              typeof item === "string" ? (
                <span key={item} className="pagination-nav__ellipsis" aria-hidden="true">…</span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => handlePageChange(item)}
                  className={item === currentPage ? "active" : undefined}
                  aria-current={item === currentPage ? "page" : undefined}
                >
                  {item}
                </button>
              )
            )}
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
