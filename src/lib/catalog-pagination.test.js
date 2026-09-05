import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  countDistinctCatalogProductsByCategory,
  getCatalogPageRange,
  normalizeCatalogPagination,
} from "./catalog-pagination.js";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("variants and image join rows do not increase parent-product category counts", () => {
  const counts = countDistinctCatalogProductsByCategory([
    { product_id: "eggs", category_slug: "dairy-eggs", variant_id: "small", image_id: 1, in_stock: true },
    { product_id: "eggs", category_slug: "dairy-eggs", variant_id: "medium", image_id: 2, in_stock: true },
    { product_id: "eggs", category_slug: "dairy-eggs", variant_id: "large", image_id: 3, in_stock: false },
    { product_id: "milk", category_slug: "dairy-eggs", image_id: 4, in_stock: false },
  ]);

  assert.deepEqual(counts, {
    "dairy-eggs": { product_count: 2, available_product_count: 1 },
  });
});

test("authoritative totals produce the correct 20-item page counts", () => {
  assert.equal(normalizeCatalogPagination({ total: 121, pageSize: 20 }).totalPages, 7);
  assert.equal(normalizeCatalogPagination({ total: 279, pageSize: 20 }).totalPages, 14);
});

test("page ranges cover every product once beyond record 120", () => {
  const ids = Array.from({ length: 279 }, (_, index) => index + 1);
  const seen = [];
  for (let page = 1; page <= 14; page += 1) {
    const { from, to } = getCatalogPageRange({ page, pageSize: 20 });
    seen.push(...ids.slice(from, to + 1));
  }

  assert.equal(seen.length, 279);
  assert.equal(new Set(seen).size, 279);
  assert.ok(seen.includes(121));
  assert.deepEqual(seen, ids);
});

test("Browse and search use exact server pagination instead of the legacy 120-product cap", () => {
  const shopPage = read("src/app/shop/page.js");
  const cardsRoute = read("src/app/api/catalog/cards/route.js");
  const catalogServer = read("src/lib/public-catalog-server.js");

  assert.match(shopPage, /pageSize=\$\{PAGE_SIZE\}/);
  assert.doesNotMatch(shopPage, /cards\?limit=120/);
  assert.match(cardsRoute, /loadCatalogCardPage/);
  assert.match(cardsRoute, /page:\s*searchParams\.get\("page"\)\s*\|\|\s*1/);
  assert.match(cardsRoute, /pageSize:\s*searchParams\.get\("pageSize"\)\s*\|\|\s*20/);
  assert.match(catalogServer, /from\("product_card_catalog_with_options"\)/);
  assert.match(catalogServer, /select\("product_id", \{ count: "exact", head: true \}\)/);
  assert.match(catalogServer, /Promise\.all\(\[\s*query\.range\(range\.from, range\.to\),\s*countQuery/);
  assert.match(catalogServer, /query\.range\(range\.from, range\.to\)/);
  const searchFunction = catalogServer.slice(catalogServer.indexOf("export async function loadPublicSearchResults"));
  assert.match(searchFunction, /loadPublicCatalogPage/);
  assert.doesNotMatch(searchFunction, /120/);
});

test("available products are ordered before unavailable products prior to pagination", () => {
  const cardsServer = read("src/lib/home-catalog-cards-server.js");
  const cardsRoute = read("src/app/api/catalog/cards/route.js");
  const searchRoute = read("src/app/api/catalog/search/route.js");
  const pageLoader = cardsServer.slice(cardsServer.indexOf("export async function loadCatalogCardPage"));

  const availabilityOrder = pageLoader.indexOf('query = query.order("in_stock", { ascending: false })');
  const paginationRange = pageLoader.indexOf("query.range(range.from, range.to)");
  assert.ok(availabilityOrder >= 0, "catalog page query must order by availability");
  assert.ok(paginationRange > availabilityOrder, "availability ordering must happen before pagination");
  assert.match(cardsServer, /\.filter\(\(product\) => product\.id\)/);
  assert.doesNotMatch(cardsServer, /product\.id && product\.price > 0/);
  assert.match(cardsRoute, /export const dynamic = "force-dynamic"/);
  assert.match(cardsRoute, /"Cache-Control": "no-store"/);
  assert.doesNotMatch(cardsRoute, /export const revalidate = 300/);
  assert.match(searchRoute, /loadCatalogCardPage/);
  assert.match(searchRoute, /pageSize:\s*limit/);
});

test("all public search inputs use the shared Search meal05 placeholder", () => {
  const files = [
    "src/components/meal05-header.js",
    "src/app/landing/page.js",
    "src/app/shop/page.js",
    "src/data/copy.js",
  ];
  const publicSearchSource = files.map(read).join("\n");
  files.forEach((file) => assert.match(read(file), /Search meal05/));
  assert.doesNotMatch(publicSearchSource, /Search tomatoes|Search fruits|Try &quot;|Try "/);
});

test("catalog search applies each query word independently across every server path", () => {
  const homeCards = read("src/lib/home-catalog-cards-server.js");
  const publicCatalog = read("src/lib/public-catalog-server.js");

  assert.match(homeCards, /applyCatalogSearchTerms\(query, search\)/);
  assert.match(homeCards, /applyCatalogSearchTerms\(countQuery, search\)/);
  assert.match(publicCatalog, /applyCatalogSearchTerms\(query, search\)/);
  assert.match(publicCatalog, /applyCatalogSearchTerms\(countQuery, search\)/);
  assert.doesNotMatch(`${homeCards}\n${publicCatalog}`, /ilike\("search_text",\s*`%\$\{searchTerm\}%`\)/);
});

test("the public search page uses the working catalog-card search loader directly", () => {
  const searchPage = read("src/app/search/page.js");

  assert.match(searchPage, /import \{ loadCatalogCardPage \} from "@\/lib\/home-catalog-cards-server"/);
  assert.match(
    searchPage,
    /const payload = await loadCatalogCardPage\(\{[\s\S]*?search: query,[\s\S]*?page: currentPage/
  );
  assert.doesNotMatch(searchPage, /loadPublicSearchResults/);
});
