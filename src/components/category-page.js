"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import CategoryCarouselSkeleton from "@/components/category-carousel-skeleton";
import ProductPromoRibbon from "@/components/product-promo-ribbon";
import { formatProductPrice, resolveStockClass } from "@/lib/catalogue";
import { getProductHref } from "@/lib/products";
import { resolveProductImage } from "@/lib/product-image";

const CategoryCarousel = dynamic(() => import("@/components/category-carousel"), {
  loading: () => <CategoryCarouselSkeleton />,
});
const QuickAddDrawer = dynamic(() => import("@/components/quick-add-drawer"), {
  ssr: false,
});

const DEFAULT_PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest" },
];

const mapCategoryCard = (entry) => ({
  slug: entry.slug,
  label: entry.label || entry.name,
  icon: entry.icon || "fa-basket-shopping",
  href: `/categories/${entry.slug}`,
});

function CategoryProductCard({ product, onQuickAdd }) {
  const stockClass = resolveStockClass(product.stock);
  const hasOldPrice = product.oldPrice && product.oldPrice > product.price;
  const href = getProductHref(product);
  const isUnavailable = stockClass === "is-unavailable";
  const productImage = resolveProductImage(product.image);
  const formattedPrice = formatProductPrice(product.price, product.unit);
  const [priceValue, unitValue] = formattedPrice.split("/");

  return (
    <article className="product-card product-card--with-cta">
      <Link href={href} className="product-card__link" aria-label={`View ${product.name}`}>
        <div>
          <div className="product-card__imageWrap">
            <div className="product-card__badge-row">
              {product.discount ? (
                <div className="product-card-discount">
                  <p>{product.discount}% Off</p>
                </div>
              ) : <span />}
              <div className={`product-card-season ${product.inSeason ? 'is-in' : 'is-out'}`}>
                <p>{product.inSeason ? "In Season" : "Out of Season"}</p>
              </div>
            </div>
            <Image
              src={productImage}
              alt={product.name}
              className="productImg"
              width={140}
              height={140}
              sizes="(max-width: 768px) 120px, 140px"
              loading="lazy"
            />
            <ProductPromoRibbon
              text={product.promoTagText}
              expiresAt={product.promoTagExpiresAt}
              enabled={product.promoTagEnabled}
            />
            {isUnavailable ? (
              <div className="product-card__overlay" aria-hidden="true">
                Depleted
              </div>
            ) : null}
          </div>
          <div className="product-card-details">
            <h4>{product.name}</h4>
            <span className="product-card__price">
              <span className="price">{priceValue}</span>
              {unitValue ? <span className="price-unit">/{unitValue}</span> : null}
            </span>
            {hasOldPrice ? (
              <span className="old-price">{formatProductPrice(product.oldPrice, product.unit)}</span>
            ) : null}
          </div>
        </div>
      </Link>
      <div className="product-card__cta">
        <button
          type="button"
          className="product-card__cta-button"
          onClick={(event) => onQuickAdd?.(product, event.currentTarget)}
          disabled={isUnavailable}
          aria-label={`Add ${product.name} to cart`}
        >
          <span className="product-card__cta-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="8" cy="19" r="1.5" fill="currentColor" />
              <circle cx="17" cy="19" r="1.5" fill="currentColor" />
              <path
                d="M3 5H5L6.2 13.1C6.33347 13.983 7.07703 14.6425 7.96984 14.6425H17.4C18.1232 14.6425 18.753 14.1615 18.9363 13.4605L21 6.14246H6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="product-card__cta-label">
            {isUnavailable ? "Out of stock" : "Add to cart"}
          </span>
        </button>
      </div>
    </article>
  );
}

export default function CategoryPage({
  category,
  products = [],
  categories = [],
  pageSize = DEFAULT_PAGE_SIZE,
  status = "ready",
}) {
  const pageRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sort, setSort] = useState("default");
  const [quickAddProduct, setQuickAddProduct] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddAnchorRect, setQuickAddAnchorRect] = useState(null);
  const [quickAddAnchorEl, setQuickAddAnchorEl] = useState(null);

  const itemsPerPage = category?.itemsPerPage || pageSize || DEFAULT_PAGE_SIZE;
  const isLoadingProducts = status === "loading";
  const hasProductsError = status === "error";
  const categoryProducts = useMemo(() => {
    const list = Array.isArray(products) ? products.slice() : [];
    if (sort === "price-asc") return list.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    if (sort === "price-desc") return list.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    if (sort === "newest") return list.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
    return list;
  }, [products, sort]);
  const totalPages = Math.max(1, Math.ceil(categoryProducts.length / itemsPerPage));

  useEffect(() => {
    setCurrentPage(1);
  }, [categoryProducts.length, itemsPerPage, sort]);

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
        <div className="category-empty-state">
          <strong>Category not found.</strong>
          Please return to the home page to explore available aisles.
        </div>
      </main>
    );
  }

  const start = categoryProducts.length ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const end = Math.min(currentPage * itemsPerPage, categoryProducts.length);
  const categoryCards = (Array.isArray(categories) ? categories : []).map(mapCategoryCard);

  return (
    <main ref={pageRef} className="category-page" data-category-slug={category.slug}>
      <nav className="page-breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true" className="page-breadcrumb-divider">/</span>
        <Link href="/shop">Shop</Link>
        <span aria-hidden="true" className="page-breadcrumb-divider">/</span>
        <span className="page-breadcrumb-current">{category.label}</span>
      </nav>
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

      <div className="category-page__controls">
        <p className="category-page__result-count" aria-live="polite">
          {categoryProducts.length
            ? `${categoryProducts.length} product${categoryProducts.length === 1 ? "" : "s"}`
            : "No products available right now"}
        </p>
        <label>
          <span className="sr-only">Sort products</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            aria-label="Sort products"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="category-products" aria-live="polite">
        {isLoadingProducts ? (
          <div className="category-empty-state">
            <strong>Loading products...</strong>
          </div>
        ) : categoryProducts.length ? (
          <div className="product-card-grid">
            {pagedProducts.map((product) => (
              <CategoryProductCard key={product.id} product={product} onQuickAdd={handleQuickAdd} />
            ))}
          </div>
        ) : hasProductsError ? (
          <div className="category-empty-state">
            <strong>We couldn&apos;t load products right now.</strong>
            Please try again in a moment.
          </div>
        ) : (
          <div className="category-empty-state">
            <strong>No products are available right now.</strong>
            Please check back soon — we are updating this aisle.
          </div>
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
