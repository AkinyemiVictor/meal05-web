"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Fragment, use, useEffect, useState } from "react";

import SearchHistoryRecorder from "@/components/search-history-recorder";
import ProductGridSkeleton from "@/components/product-grid-skeleton";
import ProductPromoRibbon from "@/components/product-promo-ribbon";
import copy from "@/data/copy";
import useProducts from "@/lib/use-products";
import { formatProductPrice, resolveStockClass } from "@/lib/catalogue";
import { getProductHref } from "@/lib/products";
import { resolveProductImage } from "@/lib/product-image";

const PAGE_SIZE = 12;
const QuickAddDrawer = dynamic(() => import("@/components/quick-add-drawer"), { ssr: false });

const normalise = (value) => value?.toString().toLowerCase().trim() ?? "";
const formatCategoryLabel = (value) =>
  String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
const buildTokens = (value) =>
  value.toLowerCase().split(/\s+/).map((t) => t.trim()).filter(Boolean);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildSearchText = (product) =>
  [normalise(product.name), normalise(product.category), normalise(product.categorySlug), normalise(product.unit)]
    .filter(Boolean).join(" ");

const getCategoryLabel = (slug, fallback) =>
  fallback || formatCategoryLabel(slug) || "More staples";

function matchesProduct(product, tokens) {
  if (!tokens.length) return false;
  const haystack = buildSearchText(product);
  return tokens.every((token) => haystack.includes(token));
}

function levenshtein(a, b) {
  const lenA = a.length, lenB = b.length;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;
  const dp = Array.from({ length: lenA + 1 }, () => new Array(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i++) dp[i][0] = i;
  for (let j = 0; j <= lenB; j++) dp[0][j] = j;
  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[lenA][lenB];
}

function getSuggestions(query, limit = 3, list = []) {
  const normalisedQuery = normalise(query);
  if (!normalisedQuery) return [];
  const scored = list.map((product) => {
    const name = normalise(product.name);
    const score = Math.min(
      levenshtein(name, normalisedQuery),
      levenshtein(normalise(product.category), normalisedQuery)
    ) + (name.includes(normalisedQuery) ? -2 : 0);
    return { term: product.name, score };
  });
  scored.sort((a, b) => a.score - b.score);
  const unique = [];
  const seen = new Set();
  for (const candidate of scored) {
    const key = candidate.term.toLowerCase();
    if (seen.has(key)) continue;
    if (candidate.score > Math.max(5, normalisedQuery.length)) continue;
    if (candidate.term.toLowerCase() === normalisedQuery) continue;
    seen.add(key);
    unique.push(candidate.term);
    if (unique.length >= limit) break;
  }
  return unique;
}

function HighlightedText({ text, tokens }) {
  if (!tokens.length) return text;
  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        const isMatch = tokens.some((token) => part.toLowerCase() === token.toLowerCase());
        return isMatch ? <mark key={`h-${index}`}>{part}</mark> : <Fragment key={`t-${index}`}>{part}</Fragment>;
      })}
    </>
  );
}

function ProductResultCard({ product, tokens, onQuickAdd }) {
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
                <div className="product-card-discount"><p>{product.discount}% Off</p></div>
              ) : <span />}
              <div className={`product-card-season ${product.inSeason ? "is-in" : "is-out"}`}>
                <p>{product.inSeason ? "In Season" : "Out of Season"}</p>
              </div>
            </div>
            <Image src={productImage} alt={product.name} className="productImg" width={140} height={140} sizes="(max-width: 768px) 120px, 140px" loading="lazy" />
            <ProductPromoRibbon text={product.promoTagText} expiresAt={product.promoTagExpiresAt} enabled={product.promoTagEnabled} />
            {isUnavailable ? <div className="product-card__overlay" aria-hidden="true">Depleted</div> : null}
          </div>
          <div className="product-card-details">
            <h4><HighlightedText text={product.name} tokens={tokens} /></h4>
            <span className="product-card__price">
              <span className="price">{priceValue}</span>
              {unitValue ? <span className="price-unit">/{unitValue}</span> : null}
            </span>
            {hasOldPrice ? <span className="old-price">{formatProductPrice(product.oldPrice, product.unit)}</span> : null}
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
              <path d="M3 5H5L6.2 13.1C6.33347 13.983 7.07703 14.6425 7.96984 14.6425H17.4C18.1232 14.6425 18.753 14.1615 18.9363 13.4605L21 6.14246H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="product-card__cta-label">{isUnavailable ? "Out of stock" : "Add to cart"}</span>
        </button>
      </div>
    </article>
  );
}

function buildPageHref(query, pageNumber = 1) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (pageNumber > 1) params.set("page", String(pageNumber));
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

function Pagination({ query, currentPage, totalPages }) {
  if (totalPages <= 1) return null;
  const isFirst = currentPage === 1;
  const isLast = currentPage === totalPages;
  return (
    <nav className="pagination-nav" aria-label="Search results pages">
      <a href={isFirst ? "#" : buildPageHref(query, currentPage - 1)} aria-disabled={isFirst ? "true" : undefined} tabIndex={isFirst ? -1 : undefined}>Previous</a>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((index) => {
        const isActive = index === currentPage;
        return (
          <a key={index} href={buildPageHref(query, index)} className={isActive ? "is-active" : undefined} aria-label={`Go to page ${index}`} aria-current={isActive ? "page" : undefined}>
            {index}
          </a>
        );
      })}
      <a href={isLast ? "#" : buildPageHref(query, currentPage + 1)} aria-disabled={isLast ? "true" : undefined} tabIndex={isLast ? -1 : undefined}>Next</a>
    </nav>
  );
}

export default function SearchPage({ searchParams }) {
  const resolvedSearchParams = use(searchParams);
  const { ordered: allProducts, status: productsStatus } = useProducts();
  const isLoadingProducts = productsStatus === "loading";
  const isProductsReady = productsStatus === "ready";
  const hasProductsError = productsStatus === "error";
  const rawQuery = resolvedSearchParams?.q ?? "";
  const query = rawQuery.toString().trim();
  const tokens = buildTokens(query);
  const [quickAddProduct, setQuickAddProduct] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddAnchorEl, setQuickAddAnchorEl] = useState(null);

  const filteredProducts = tokens.length && isProductsReady
    ? allProducts.filter((product) => matchesProduct(product, tokens))
    : [];

  const totalResults = isProductsReady ? filteredProducts.length : 0;
  const totalPages = totalResults ? Math.ceil(totalResults / PAGE_SIZE) : 0;
  const requestedPage = Number.parseInt(resolvedSearchParams?.page ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage) && requestedPage >= 1 ? Math.min(requestedPage, Math.max(totalPages, 1)) : 1;
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagedProducts = filteredProducts.slice(startIndex, startIndex + PAGE_SIZE);

  const groupedMap = new Map();
  pagedProducts.forEach((product) => {
    const slug = normalise(product.category) || "other";
    if (!groupedMap.has(slug)) groupedMap.set(slug, { slug, label: getCategoryLabel(product.category, product.category), products: [] });
    groupedMap.get(slug).products.push(product);
  });
  const groupedResults = Array.from(groupedMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  const suggestionTerms = query && !totalResults && isProductsReady ? getSuggestions(query, 3, allProducts) : [];

  const description = query
    ? isLoadingProducts ? "Loading the latest products..."
      : hasProductsError ? "We couldn’t load products right now. Please try again shortly."
      : totalResults ? `Showing ${pagedProducts.length} of ${totalResults} matching items.`
      : copy.search.emptyDescription(query)
    : copy.search.introDefault;

  const resultCountText = query
    ? isLoadingProducts ? "Loading products..."
      : hasProductsError ? "Unable to load products right now"
      : totalResults ? `Showing ${pagedProducts.length} of ${totalResults} matching items.`
      : "No matching items found"
    : "Enter a search term to view results";

  const handleQuickAddClose = () => { setQuickAddOpen(false); setQuickAddProduct(null); setQuickAddAnchorEl(null); };

  const handleQuickAdd = (product, anchorEl) => {
    if (!product) return;
    if (quickAddOpen && quickAddProduct?.id === product.id) { handleQuickAddClose(); return; }
    setQuickAddAnchorEl(anchorEl || null);
    setQuickAddProduct(product);
    setQuickAddOpen(true);
  };

  return (
    <main className="category-page" data-search-term={query}>
      <nav className="page-breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true" className="page-breadcrumb-divider">/</span>
        {query ? (
          <>
            <Link href="/search">Search</Link>
            <span aria-hidden="true" className="page-breadcrumb-divider">/</span>
            <span className="page-breadcrumb-current">{query}</span>
          </>
        ) : (
          <span className="page-breadcrumb-current">Search</span>
        )}
      </nav>

      <header className="category-page__header">
        <div className="category-page__title">
          <div>
            <span className="category-page__eyebrow">Search</span>
            <h1 className="categoryCard__label">{query ? `Results for "${query}"` : "Find farm-fresh staples"}</h1>
            <p className="category-page__description">{description}</p>
          </div>
        </div>
        <form
          className="flex min-w-0 items-center gap-3 rounded-2xl border border-meal-line bg-meal-paper px-4 text-meal-muted shadow-sm"
          role="search"
          action="/search"
          method="get"
        >
          <label htmlFor="searchPageInput" className="sr-only">Search Meal05 products</label>
          <input
            id="searchPageInput"
            name="q"
            type="search"
            defaultValue={query}
            placeholder={copy.search.placeholderPage}
            className="h-12 min-w-0 flex-1 bg-transparent text-sm font-medium text-meal-text outline-none placeholder:text-meal-muted"
            autoComplete="off"
            spellCheck="false"
          />
          <button
            type="submit"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-meal-ink text-meal-paper transition hover:bg-meal-pepper"
          >
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <span className="sr-only">Submit search</span>
          </button>
        </form>
      </header>

      {query ? (
        isLoadingProducts ? (
          <div className="category-products"><ProductGridSkeleton count={PAGE_SIZE} /></div>
        ) : hasProductsError ? (
          <div className="category-empty-state">
            <strong>We couldn&apos;t load products right now.</strong>
            <p>Please refresh the page or try again in a moment.</p>
            <Link href="/shop" className="section-view-button">{copy.search.browseCategoriesCta}</Link>
          </div>
        ) : totalResults ? (
          <>
            <div className="category-products">
              {groupedResults.map((group) => (
                <section key={group.slug} className="search-results-group">
                  <header className="search-results-group__header">
                    <span className="search-results-group__eyebrow">Category</span>
                    <h2>{group.label}</h2>
                  </header>
                  <div className="product-card-grid">
                    {group.products.map((product) => (
                      <ProductResultCard key={product.id} product={product} tokens={tokens} onQuickAdd={handleQuickAdd} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="category-page__pagination">
              <p className="category-page__result-count" aria-live="polite">{resultCountText}</p>
              <Pagination query={query} currentPage={currentPage} totalPages={totalPages} />
            </div>
          </>
        ) : (
          <div className="category-empty-state">
            <strong>{copy.search.emptyTitle}</strong>
            <p>{copy.search.emptyDescription(query)}</p>
            {suggestionTerms.length ? (
              <ul className="search-empty-suggestions">
                {suggestionTerms.map((term) => (
                  <li key={term}><Link href={buildPageHref(term)}>{`Search "${term}"`}</Link></li>
                ))}
              </ul>
            ) : null}
            <Link href="/shop" className="section-view-button">{copy.search.browseCategoriesCta}</Link>
          </div>
        )
      ) : (
        <section className="category-empty-state">
          <strong>{copy.search.emptyStartTitle}</strong>
          <p>{copy.search.emptyStartDescription}</p>
          <Link href="/shop" className="section-view-button">{copy.search.browseCategoriesCta}</Link>
        </section>
      )}

      <QuickAddDrawer
        product={quickAddProduct}
        isOpen={quickAddOpen}
        onClose={handleQuickAddClose}
        variant="dropdown"
        anchorEl={quickAddAnchorEl}
      />
      <SearchHistoryRecorder term={query} enabled={Boolean(query)} />
    </main>
  );
}
