"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";

import SearchHistoryRecorder from "@/components/search-history-recorder";
import ProductGridSkeleton from "@/components/product-grid-skeleton";
import ProductCard from "@/components/product-card";
import PageBreadcrumbs from "@/components/page-breadcrumbs";
import PageState from "@/components/page-state";
import ProductGrid from "@/components/product-grid";
import copy from "@/data/copy";
import useProducts from "@/lib/use-products";

const PAGE_SIZE = 12;
const QuickAddDrawer = dynamic(() => import("@/components/quick-add-drawer"), { ssr: false });

const normalise = (value) =>
  value
    ?.toString()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() ?? "";
const formatCategoryLabel = (value) =>
  String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
const buildTokens = (value) =>
  normalise(value).split(/\s+/).map((t) => t.trim()).filter(Boolean);
const compact = (value) => normalise(value).replace(/\s+/g, "");

const SEARCH_SYNONYMS = {
  cereals: ["grain", "grains", "rice", "oats"],
  cereal: ["grain", "grains", "rice", "oats"],
  grains: ["cereal", "cereals", "rice", "oats"],
  grain: ["cereal", "cereals", "rice"],
  seafood: ["fish", "prawns", "shrimp"],
  fish: ["seafood"],
  veggies: ["vegetables", "greens"],
  vegetable: ["vegetables", "veggies", "greens"],
  vegetables: ["vegetable", "veggies", "greens"],
  oil: ["cooking oil", "essentials"],
  oils: ["oil", "cooking oil"],
  spice: ["spices", "condiments", "seasoning"],
  spices: ["spice", "condiments", "seasoning"],
  condiment: ["condiments", "spices", "seasoning"],
  condiments: ["condiment", "spices", "seasoning"],
  egg: ["eggs", "dairy"],
  eggs: ["egg", "dairy"],
  milk: ["dairy"],
  dairy: ["milk", "eggs"],
  beans: ["legumes"],
  legumes: ["beans"],
  yam: ["tubers"],
  yams: ["yam", "tubers"],
  mealkit: ["meal kit", "bundle", "bundles", "pack"],
  "meal kit": ["mealkit", "bundle", "bundles", "pack"],
  bundle: ["bundles", "mealkit", "meal kit", "pack"],
  bundles: ["bundle", "mealkit", "meal kit", "pack"],
};

const fieldValues = (product) => [
  product.name,
  product.category,
  product.categorySlug,
  product.unit,
  product.variantName,
  product.promoTagText,
  product.collectionSlug,
  ...(Array.isArray(product.tags) ? product.tags : []),
  product.isPopular ? "popular bestseller best seller" : "",
  product.isChefChoice ? "chef choice recommended" : "",
  product.isUnder15m ? "quick fast under 15 minutes" : "",
  product.isBundleEligible ? "bundle mealkit meal kit pack" : "",
];

const buildProductIndex = (product) => {
  const values = fieldValues(product).map(normalise).filter(Boolean);
  const text = values.join(" ");
  const words = Array.from(new Set(text.split(/\s+/).filter(Boolean)));
  const compactText = compact(text);
  return { product, text, words, compactText };
};

const expandTokens = (tokens) => {
  const expanded = [];
  tokens.forEach((token) => {
    expanded.push(token);
    const synonyms = SEARCH_SYNONYMS[token] || [];
    synonyms.forEach((entry) => buildTokens(entry).forEach((part) => expanded.push(part)));
  });
  return Array.from(new Set(expanded));
};

const getCategoryLabel = (slug, fallback) =>
  fallback || formatCategoryLabel(slug) || "More staples";

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

const fuzzyLimitFor = (token) => {
  if (token.length <= 3) return 0;
  if (token.length <= 5) return 1;
  return 2;
};

const tokenScore = (token, indexed) => {
  if (!token) return 0;
  if (indexed.text.includes(token)) return token.length >= 4 ? 30 : 18;
  if (indexed.compactText.includes(token)) return token.length >= 4 ? 24 : 14;
  let best = Number.POSITIVE_INFINITY;
  for (const word of indexed.words) {
    if (word.includes(token) || token.includes(word)) return 16;
    if (Math.abs(word.length - token.length) > 2) continue;
    best = Math.min(best, levenshtein(word, token));
  }
  return best <= fuzzyLimitFor(token) ? 12 - best * 3 : 0;
};

function scoreProduct(indexed, tokens) {
  if (!tokens.length) return 0;
  const expanded = expandTokens(tokens);
  let directScore = 0;
  let matchedRequired = 0;

  tokens.forEach((token) => {
    const score = tokenScore(token, indexed);
    if (score > 0) matchedRequired += 1;
    directScore += score;
  });

  if (matchedRequired === tokens.length) return directScore + 50;

  let synonymScore = 0;
  expanded.forEach((token) => {
    if (tokens.includes(token)) return;
    synonymScore = Math.max(synonymScore, tokenScore(token, indexed));
  });

  return matchedRequired > 0 || synonymScore > 0 ? directScore + synonymScore : 0;
}

function getSuggestions(query, limit = 5, indexedProducts = []) {
  const tokens = buildTokens(query);
  if (!tokens.length) return [];
  const scored = indexedProducts
    .map((indexed) => ({ term: indexed.product.name, score: scoreProduct(indexed, tokens) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));
  const unique = [];
  const seen = new Set();
  for (const candidate of scored) {
    const key = normalise(candidate.term);
    if (!key || seen.has(key) || key === normalise(query)) continue;
    seen.add(key);
    unique.push(candidate.term);
    if (unique.length >= limit) break;
  }
  return unique;
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

  const indexedProducts = useMemo(
    () => (Array.isArray(allProducts) ? allProducts.map(buildProductIndex) : []),
    [allProducts]
  );

  const filteredProducts = useMemo(() => {
    if (!tokens.length || !isProductsReady) return [];
    return indexedProducts
      .map((indexed) => ({ product: indexed.product, score: scoreProduct(indexed, tokens) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
      .map((entry) => entry.product);
  }, [indexedProducts, isProductsReady, tokens]);

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
  const suggestionTerms = query && !totalResults && isProductsReady ? getSuggestions(query, 5, indexedProducts) : [];
  const starterSuggestions = isProductsReady
    ? Array.from(
        new Set(
          allProducts
            .flatMap((product) => [product.category, product.promoTagText, product.isBundleEligible ? "MealKits" : ""])
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        )
      ).slice(0, 6)
    : [];

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
      <PageBreadcrumbs
        items={query
          ? [
              { label: "Home", href: "/" },
              { label: "Search", href: "/search" },
              { label: query },
            ]
          : [
              { label: "Home", href: "/" },
              { label: "Search" },
            ]}
      />

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
          <PageState title="We couldn't load products right now.">
            <p>Please refresh the page or try again in a moment.</p>
            <Link href="/shop" className="section-view-button">{copy.search.browseCategoriesCta}</Link>
          </PageState>
        ) : totalResults ? (
          <>
            <div className="category-products">
              {groupedResults.map((group) => (
                <section key={group.slug} className="search-results-group">
                  <header className="search-results-group__header">
                    <span className="search-results-group__eyebrow">Category</span>
                    <h2>{group.label}</h2>
                  </header>
                  <ProductGrid
                    products={group.products}
                    renderProduct={(product) => (
                      <ProductCard key={product.id} product={product} onQuickAdd={handleQuickAdd} />
                    )}
                  />
                </section>
              ))}
            </div>
            <div className="category-page__pagination">
              <p className="category-page__result-count" aria-live="polite">{resultCountText}</p>
              <Pagination query={query} currentPage={currentPage} totalPages={totalPages} />
            </div>
          </>
        ) : (
          <PageState title={copy.search.emptyTitle}>
            <p>{copy.search.emptyDescription(query)}</p>
            {suggestionTerms.length ? (
              <ul className="search-empty-suggestions">
                {suggestionTerms.map((term) => (
                  <li key={term}><Link href={buildPageHref(term)}>{`Search "${term}"`}</Link></li>
                ))}
              </ul>
            ) : null}
            <Link href="/shop" className="section-view-button">{copy.search.browseCategoriesCta}</Link>
          </PageState>
        )
      ) : (
        <PageState as="section" title={copy.search.emptyStartTitle}>
          <p>{copy.search.emptyStartDescription}</p>
          {starterSuggestions.length ? (
            <ul className="search-empty-suggestions">
              {starterSuggestions.map((term) => (
                <li key={term}><Link href={buildPageHref(term)}>{term}</Link></li>
              ))}
            </ul>
          ) : null}
          <Link href="/shop" className="section-view-button">{copy.search.browseCategoriesCta}</Link>
        </PageState>
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
