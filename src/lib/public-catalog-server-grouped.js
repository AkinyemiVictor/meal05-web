import {
  loadPublicCatalogPage as baseLoadPublicCatalogPage,
  loadPublicCatalogProducts as baseLoadPublicCatalogProducts,
  toProductCardDTO,
} from "./public-catalog-server.js";
import { getCatalogPageRange, normalizeCatalogPagination } from "@/lib/catalog-pagination";
import { toCategorySlug } from "@/lib/categories-server";
import { publicMarket } from "@/lib/market-catalog-server";
import { getDefaultMarket } from "@/lib/market-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export * from "./public-catalog-server.js";

const cleanSearchTerm = (value) =>
  String(value || "")
    .trim()
    .replace(/[%_,().]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);

const applyCatalogueFilters = (query, { category = "", search = "", view = "default" } = {}) => {
  const categorySlug = toCategorySlug(category || "");
  const searchTerm = cleanSearchTerm(search);

  if (categorySlug) query = query.eq("category_slug", categorySlug);
  if (searchTerm) query = query.ilike("search_text", `%${searchTerm}%`);
  if (view === "in-season") query = query.eq("in_season", true);

  return query;
};

const orderedRowsQuery = (admin, marketId, filters = {}) => {
  let query = admin
    .from("product_card_catalog")
    .select("product_id, display_group, display_group_order", { head: false })
    .eq("market_id", marketId);

  query = applyCatalogueFilters(query, filters);
  return query
    .order("display_sort_order", { ascending: true })
    .order("product_id", { ascending: true });
};

const rowsToUnits = (rows = []) => {
  const source = Array.isArray(rows) ? rows : [];
  const units = [];

  for (let index = 0; index < source.length; ) {
    const row = source[index];
    const group = String(row?.display_group || "").trim();
    if (!group) {
      units.push([row]);
      index += 1;
      continue;
    }

    const unit = [];
    while (index < source.length && String(source[index]?.display_group || "").trim() === group) {
      unit.push(source[index]);
      index += 1;
    }
    units.push(unit);
  }

  return units;
};

const packCataloguePages = (rows, pageSize) => {
  const safeSize = Math.max(1, Number(pageSize) || 20);
  const pages = [];
  let current = [];

  rowsToUnits(rows).forEach((unit) => {
    if (current.length && current.length + unit.length > safeSize) {
      pages.push(current);
      current = [];
    }
    current.push(...unit);
  });

  if (current.length) pages.push(current);
  return pages;
};

const takeWholeGroups = (rows, limit) => {
  const safeLimit = Math.max(1, Number(limit) || 48);
  const selected = [];

  for (const unit of rowsToUnits(rows)) {
    if (selected.length && selected.length + unit.length > safeLimit) break;
    if (!selected.length && unit.length > safeLimit) return unit;
    selected.push(...unit);
  }

  return selected;
};

const productIds = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => String(row?.product_id || "").trim())
    .filter(Boolean);

export async function loadPublicCatalogPage({
  page = 1,
  pageSize = 20,
  category = "",
  search = "",
  sort = "default",
} = {}) {
  // Respect deliberate customer sorts. Size-family grouping is the default browse order.
  if (sort !== "default") {
    return baseLoadPublicCatalogPage({ page, pageSize, category, search, sort });
  }

  const admin = getSupabaseAdminClient();
  const market = await getDefaultMarket();
  const range = getCatalogPageRange({ page, pageSize });
  const result = await orderedRowsQuery(admin, market.id, { category, search });
  if (result.error) throw result.error;

  const orderedRows = Array.isArray(result.data) ? result.data : [];
  const pages = packCataloguePages(orderedRows, range.pageSize);
  const pageRows = pages[range.page - 1] || [];
  const ids = productIds(pageRows);

  const payload = ids.length
    ? await baseLoadPublicCatalogProducts({ ids, category, search, limit: ids.length })
    : { grouped: {}, flat: [], market: publicMarket(market) };

  return {
    ...payload,
    pagination: {
      ...normalizeCatalogPagination({
        page: range.page,
        pageSize: range.pageSize,
        total: orderedRows.length,
      }),
      totalPages: Math.max(1, pages.length),
    },
  };
}

export async function loadPublicCatalogProducts({
  ids,
  category,
  search,
  view = "default",
  limit = 48,
} = {}) {
  const requestedIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (requestedIds.length || view === "new") {
    return baseLoadPublicCatalogProducts({ ids, category, search, view, limit });
  }

  const requestedLimit = Math.min(Math.max(Number(limit) || 48, 1), 120);
  // The existing authoritative loader preserves up to 80 explicitly ordered IDs.
  if (requestedLimit > 80) {
    return baseLoadPublicCatalogProducts({ ids, category, search, view, limit });
  }

  const admin = getSupabaseAdminClient();
  const market = await getDefaultMarket();
  const result = await orderedRowsQuery(admin, market.id, { category, search, view });
  if (result.error) throw result.error;

  const orderedRows = takeWholeGroups(result.data, requestedLimit);
  const orderedIds = productIds(orderedRows);

  if (!orderedIds.length) {
    return { grouped: {}, flat: [], market: publicMarket(market) };
  }

  return baseLoadPublicCatalogProducts({
    ids: orderedIds,
    category,
    search,
    view,
    limit: orderedIds.length,
  });
}

export async function loadPublicSearchResults({ search, page = 1, pageSize = 12 } = {}) {
  const query = String(search || "").trim().replace(/\s+/g, " ").slice(0, 80);
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safePageSize = Math.min(Math.max(Number.parseInt(pageSize, 10) || 12, 1), 24);

  if (!query) {
    return {
      items: [],
      page: safePage,
      pageSize: safePageSize,
      hasMore: false,
      returned: 0,
      market: null,
    };
  }

  const payload = await loadPublicCatalogPage({
    search: query,
    page: safePage,
    pageSize: safePageSize,
  });
  const items = (Array.isArray(payload?.flat) ? payload.flat : [])
    .map(toProductCardDTO)
    .filter((product) => product.id);
  const pagination = payload?.pagination || normalizeCatalogPagination({
    page: safePage,
    pageSize: safePageSize,
  });

  return {
    items,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: pagination.total,
    totalPages: pagination.totalPages,
    hasMore: pagination.page < pagination.totalPages,
    returned: items.length,
    market: payload?.market || null,
  };
}
