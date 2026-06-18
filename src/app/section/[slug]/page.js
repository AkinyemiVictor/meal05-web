"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

import CategoryCarousel from "@/components/category-carousel";
import BundlePlanCard from "@/components/bundle-plan-card";
import ProductGridSkeleton from "@/components/product-grid-skeleton";
import ProductCard from "@/components/product-card";
import PageBreadcrumbs from "@/components/page-breadcrumbs";
import PageState from "@/components/page-state";
import ProductGrid from "@/components/product-grid";
import BUNDLE_PLANS from "@/data/bundle-plans";
import categories, { getCategoryHref } from "@/data/categories";
import useProducts from "@/lib/use-products";
import {
  pickMostPopularProducts,
  pickNewestProducts,
  pickInSeasonProducts,
} from "@/lib/catalogue";
import { readCartItems } from "@/lib/cart-storage";
import { pickMostPurchasedProducts } from "@/lib/engagement";

const RECENTLY_VIEWED_STORAGE_KEY = "mealkit_recently_viewed";
const PAGE_SIZE = 20;
const CATEGORY_CARDS = categories.map((entry) => ({
  slug: entry.slug,
  label: entry.label,
  icon: entry.icon,
  href: getCategoryHref(entry),
}));
const QuickAddDrawer = dynamic(() => import("@/components/quick-add-drawer"), {
  ssr: false,
});

export default function SectionViewPage() {
  const params = useParams();
  const rawSlug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const slug = String(rawSlug || "").trim().toLowerCase();
  const isBundlePlansSlug = slug === "bundle-plans";
  const { ordered: allProducts, index: productIndex, status: productsStatus } = useProducts();
  const isLoadingProducts = !isBundlePlansSlug && productsStatus === "loading";
  const isProductsReady = productsStatus === "ready";
  const hasProductsError = !isBundlePlansSlug && productsStatus === "error";

  const pageRef = useRef(null);
  const [items, setItems] = useState(() => (isBundlePlansSlug ? BUNDLE_PLANS : []));
  const [currentPage, setCurrentPage] = useState(1);
  const [quickAddProduct, setQuickAddProduct] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddAnchorRect, setQuickAddAnchorRect] = useState(null);
  const [quickAddAnchorEl, setQuickAddAnchorEl] = useState(null);

  useEffect(() => {
    if (isBundlePlansSlug) {
      setItems(BUNDLE_PLANS);
      return;
    }
    if (!isProductsReady) {
      setItems([]);
      return;
    }
    if (slug === "recently-viewed") {
      try {
        const raw = window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
        const ids = raw ? JSON.parse(raw) : [];
        const arr = Array.isArray(ids) ? ids : [];
        const mapped = arr
          .map((id) => productIndex.get(String(id)))
          .filter(Boolean);
        setItems(mapped.length ? mapped : pickMostPopularProducts(allProducts, new Set(), 24));
      } catch {
        setItems(pickMostPopularProducts(allProducts, new Set(), 24));
      }
      return;
    }
    if (slug === "cross-sell") {
      const cartItems = readCartItems();
      const exclude = new Set((cartItems || []).map((it) => String(it.id)));
      setItems(pickMostPopularProducts(allProducts, exclude, 24));
      return;
    }
    if (slug === "popular") {
      const purchased = pickMostPurchasedProducts(allProducts, 48);
      setItems(purchased.length ? purchased : pickMostPopularProducts(allProducts, new Set(), 48));
      return;
    }
    if (slug === "new") {
      const inStock = allProducts.filter((p) => !String(p.stock || "").toLowerCase().includes("out"));
      setItems(pickNewestProducts(inStock, new Set(), 48));
      return;
    }
    if (slug === "in-season") {
      const seasonal = allProducts.filter((p) => p.inSeason === true);
      setItems(pickInSeasonProducts(seasonal, new Set(), 48));
      return;
    }
    // Fallback: show full catalogue
    setItems(allProducts.slice(0, 48));
  }, [isBundlePlansSlug, slug, allProducts, productIndex, isProductsReady]);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [slug]);

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

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    setCurrentPage(page);
  };

  const handleQuickAddClose = () => {
    setQuickAddOpen(false);
    setQuickAddProduct(null);
    setQuickAddAnchorRect(null);
    setQuickAddAnchorEl(null);
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

  const start = items.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(currentPage * PAGE_SIZE, items.length);

  const title =
    slug === "recently-viewed"
      ? "Recently Viewed"
      : slug === "cross-sell"
      ? "Suggested for You"
      : slug === "popular"
      ? "Popular Combo Packs"
      : slug === "new"
      ? "Fresh In Stock"
      : slug === "in-season"
      ? "In Season"
      : slug === "bundle-plans"
      ? "Bundle Plans"
      : "Products";
  const sectionDescription = isBundlePlansSlug
    ? "Choose a curated plan for fast, convenient shopping."
    : "Browse all items in this section.";

  return (
    <main ref={pageRef} className="category-page section-view-page">
      <PageBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Sections" },
          { label: title },
        ]}
      />
      <div className="category-page__header">
        <div className="category-page__title">
          <div>
            <h1 className="categoryCard__label">{title}</h1>
            <p className="category-page__description">{sectionDescription}</p>
          </div>
        </div>
      </div>

      <section className="category-products" aria-live="polite">
        {isLoadingProducts ? (
          <ProductGridSkeleton count={12} />
        ) : pagedItems.length ? (
          <ProductGrid role="list">
            {isBundlePlansSlug
              ? pagedItems.map((plan) => (
                  <BundlePlanCard key={plan.id || plan.slug} plan={plan} />
                ))
              : pagedItems.map((p) => (
                  <ProductCard key={p.id} product={p} onQuickAdd={handleQuickAdd} />
                ))}
          </ProductGrid>
        ) : hasProductsError ? (
          <PageState title="We couldn't load this section right now.">
            Please try again shortly.
          </PageState>
        ) : (
          <PageState title="No items here yet." />
        )}
      </section>
      <div className="category-page__pagination">
        <p className="category-page__result-count" aria-live="polite">
          {isLoadingProducts
            ? "Loading products..."
            : items.length
              ? `Showing ${start}-${end} of ${items.length} items`
              : hasProductsError
                ? "Unable to load this section right now"
                : "No items available in this section"}
        </p>
        {totalPages > 1 ? (
          <div className="pagination-nav" role="navigation" aria-label="Section pagination">
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
        cards={CATEGORY_CARDS}
        heading="Explore categories"
        eyebrow="Shop by aisle"
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
