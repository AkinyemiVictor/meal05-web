import Link from "next/link";
import { IconSearch } from "@tabler/icons-react";

import PageBreadcrumbs from "@/components/page-breadcrumbs";
import PageState from "@/components/page-state";
import SearchHistoryRecorder from "@/components/search-history-recorder";
import SearchResultsClient from "@/components/search-results-client";
import categories from "@/data/categories";
import copy from "@/data/copy";
import { loadCatalogCardPage } from "@/lib/home-catalog-cards-server";

export const revalidate = 300;
export const fetchCache = "default-cache";

const PAGE_SIZE = 12;

const normalisePage = (value) => {
  const page = Number.parseInt(String(value || "1"), 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
};

function buildPageHref(query, pageNumber = 1) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (pageNumber > 1) params.set("page", String(pageNumber));
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

function Pagination({ query, currentPage, hasMore }) {
  if (currentPage <= 1 && !hasMore) return null;
  const isFirst = currentPage === 1;
  return (
    <nav className="pagination-nav" aria-label="Search results pages">
      <a href={isFirst ? "#" : buildPageHref(query, currentPage - 1)} aria-disabled={isFirst ? "true" : undefined} tabIndex={isFirst ? -1 : undefined}>
        Previous
      </a>
      <span className="is-active" aria-current="page">
        Page {currentPage}
      </span>
      <a href={!hasMore ? "#" : buildPageHref(query, currentPage + 1)} aria-disabled={!hasMore ? "true" : undefined} tabIndex={!hasMore ? -1 : undefined}>
        Next
      </a>
    </nav>
  );
}

export default async function SearchPage({ searchParams }) {
  const resolvedSearchParams = (await searchParams) || {};
  const query = String(resolvedSearchParams?.q || "").trim().replace(/\s+/g, " ").slice(0, 80);
  const currentPage = normalisePage(resolvedSearchParams?.page);
  let results = { items: [], page: currentPage, pageSize: PAGE_SIZE, hasMore: false, returned: 0 };
  let loadError = "";

  if (query) {
    try {
      const payload = await loadCatalogCardPage({
        search: query,
        page: currentPage,
        pageSize: PAGE_SIZE,
        sort: "default",
      });
      const items = Array.isArray(payload?.flat) ? payload.flat : [];
      const pagination = payload?.pagination || {};
      results = {
        items,
        page: Number(pagination.page) || currentPage,
        pageSize: Number(pagination.pageSize) || PAGE_SIZE,
        total: Number(pagination.total) || 0,
        totalPages: Number(pagination.totalPages) || 0,
        hasMore: Number(pagination.page) < Number(pagination.totalPages),
        returned: items.length,
        market: payload?.market || null,
      };
    } catch (error) {
      loadError = error?.message || "Unable to load products right now.";
    }
  }

  const hasResults = results.items.length > 0;
  const starterSuggestions = categories.slice(0, 8).map((category) => category.label);
  const description = query
    ? loadError
      ? "We couldn't load products right now. Please try again shortly."
      : hasResults
        ? `Showing ${results.items.length} matching item${results.items.length === 1 ? "" : "s"}${results.hasMore ? ". More results are available." : "."}`
        : copy.search.emptyDescription(query)
    : copy.search.introDefault;
  const resultCountText = query
    ? loadError
      ? "Unable to load products right now"
      : hasResults
        ? `Showing ${results.items.length} matching item${results.items.length === 1 ? "" : "s"} on page ${results.page}.`
        : "No matching items found"
    : "Enter a search term to view results";

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
          <label htmlFor="searchPageInput" className="sr-only">
            Search Meal05 products
          </label>
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
            <IconSearch size={18} stroke={2.2} aria-hidden="true" />
            <span className="sr-only">Submit search</span>
          </button>
        </form>
      </header>

      {query ? (
        loadError ? (
          <PageState title="We couldn't load products right now.">
            <p>Please refresh the page or try again in a moment.</p>
            <Link href="/shop" prefetch={false} className="section-view-button">{copy.search.browseCategoriesCta}</Link>
          </PageState>
        ) : hasResults ? (
          <>
            <SearchResultsClient products={results.items} />
            <div className="category-page__pagination">
              <p className="category-page__result-count" aria-live="polite">{resultCountText}</p>
              <Pagination query={query} currentPage={results.page} hasMore={results.hasMore} />
            </div>
          </>
        ) : (
          <PageState title={copy.search.emptyTitle}>
            <p>{copy.search.emptyDescription(query)}</p>
            <Link href="/shop" prefetch={false} className="section-view-button">{copy.search.browseCategoriesCta}</Link>
          </PageState>
        )
      ) : (
        <PageState as="section" title={copy.search.emptyStartTitle}>
          <p>{copy.search.emptyStartDescription}</p>
          {starterSuggestions.length ? (
            <ul className="search-empty-suggestions">
              {starterSuggestions.map((term) => (
                <li key={term}>
                  <Link href={buildPageHref(term)} prefetch={false}>{term}</Link>
                </li>
              ))}
            </ul>
          ) : null}
          <Link href="/shop" prefetch={false} className="section-view-button">{copy.search.browseCategoriesCta}</Link>
        </PageState>
      )}

      <SearchHistoryRecorder term={query} enabled={Boolean(query)} />
    </main>
  );
}
