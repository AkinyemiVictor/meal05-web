import Link from "next/link";
import {
  adminFormatters,
  loadInventoryMetrics,
  loadProductAdminCatalogue,
  loadProductPromoAdminCatalogue,
  loadProductSeasonAdminCatalogue,
} from "@/lib/admin-dashboard-data";
import AdminProductCatalogControl from "@/components/admin-product-catalog-control";
import AdminProductManagementControl from "@/components/admin-product-management-control";
import AdminProductPromoControl from "@/components/admin-product-promo-control";
import ProductPromoRibbon from "@/components/product-promo-ribbon";
import { loadCategoryRows, mapCategoryRows } from "@/lib/categories-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const dynamic = "force-dynamic";

const PAGE_PATH = "/admin/catalogue";

const toPositiveInt = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
};

const buildCatalogueHref = (params, updates = {}) => {
  const query = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (key in updates) return;
    if (value == null || value === "") return;
    query.set(key, String(value));
  });

  Object.entries(updates).forEach(([key, value]) => {
    if (value == null || value === "") return;
    query.set(key, String(value));
  });

  const queryString = query.toString();
  return queryString ? `${PAGE_PATH}?${queryString}` : PAGE_PATH;
};

const buildPaginationItems = (currentPage, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }

  const sorted = Array.from(pages)
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);

  const items = [];
  let previous = 0;
  for (const value of sorted) {
    if (previous && value - previous > 1) {
      if (value - previous === 2) {
        items.push(previous + 1);
      } else {
        items.push(`ellipsis-${previous}-${value}`);
      }
    }
    items.push(value);
    previous = value;
  }
  return items;
};

function PreservedParams({ params, exclude = [] }) {
  return Object.entries(params || {}).map(([key, value]) => {
    if (exclude.includes(key)) return null;
    if (value == null || value === "") return null;
    return <input key={key} type="hidden" name={key} value={String(value)} />;
  });
}

function SectionPagination({ params, pageKey, currentPage, totalPages, totalCount, startIndex, endIndex }) {
  if (totalCount < 1) return null;

  const items = buildPaginationItems(currentPage, totalPages);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        borderTop: "1px solid #e2e8f0",
        padding: "10px 12px",
        flexWrap: "wrap",
      }}
    >
      <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
        Showing {startIndex}-{endIndex} of {totalCount}
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {currentPage > 1 ? (
          <Link
            href={buildCatalogueHref(params, { [pageKey]: currentPage - 1 })}
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              padding: "6px 10px",
              color: "#0f172a",
              textDecoration: "none",
            }}
          >
            Previous
          </Link>
        ) : (
          <span style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", color: "#94a3b8" }}>
            Previous
          </span>
        )}

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {items.map((item) => {
            if (typeof item !== "number") {
              return (
                <span key={item} style={{ padding: "0 4px", color: "#64748b" }}>
                  ...
                </span>
              );
            }

            if (item === currentPage) {
              return (
                <span
                  key={item}
                  style={{
                    border: "1px solid #0f172a",
                    background: "#0f172a",
                    color: "#ffffff",
                    borderRadius: 8,
                    padding: "6px 10px",
                    fontWeight: 700,
                    minWidth: 36,
                    textAlign: "center",
                  }}
                >
                  {item}
                </span>
              );
            }

            return (
              <Link
                key={item}
                href={buildCatalogueHref(params, { [pageKey]: item })}
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "6px 10px",
                  color: "#0f172a",
                  textDecoration: "none",
                  minWidth: 36,
                  textAlign: "center",
                }}
              >
                {item}
              </Link>
            );
          })}
        </div>

        {currentPage < totalPages ? (
          <Link
            href={buildCatalogueHref(params, { [pageKey]: currentPage + 1 })}
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              padding: "6px 10px",
              color: "#0f172a",
              textDecoration: "none",
            }}
          >
            Next
          </Link>
        ) : (
          <span style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", color: "#94a3b8" }}>
            Next
          </span>
        )}
      </div>
    </div>
  );
}

export default async function AdminCataloguePage({ searchParams }) {
  const params = (await searchParams) || {};
  const threshold = Math.max(1, Math.min(20, Number(params?.threshold || 5)));
  const stockPageSize = Math.max(10, Math.min(100, toPositiveInt(params?.stockPageSize, 20)));
  const stockRequestedPage = toPositiveInt(params?.stockPage, 1);
  const pricePageSize = Math.max(10, Math.min(100, toPositiveInt(params?.pricePageSize, 25)));
  const priceRequestedPage = toPositiveInt(params?.pricePage, 1);
  const priceQuery = String(params?.priceQ || "").trim();
  const seasonPageSize = Math.max(10, Math.min(100, toPositiveInt(params?.seasonPageSize, 25)));
  const seasonRequestedPage = toPositiveInt(params?.seasonPage, 1);
  const seasonQuery = String(params?.seasonQ || "").trim();
  const promoPageSize = Math.max(10, Math.min(100, toPositiveInt(params?.promoPageSize, 25)));
  const promoRequestedPage = toPositiveInt(params?.promoPage, 1);
  const promoQuery = String(params?.promoQ || "").trim();

  const [inventory, priceCatalogue, seasonCatalogue, promoCatalogue, categoryRows] = await Promise.all([
    loadInventoryMetrics({ lowStockThreshold: threshold }),
    loadProductAdminCatalogue({ page: priceRequestedPage, pageSize: pricePageSize, query: priceQuery }),
    loadProductSeasonAdminCatalogue({ page: seasonRequestedPage, pageSize: seasonPageSize, query: seasonQuery }),
    loadProductPromoAdminCatalogue({ page: promoRequestedPage, pageSize: promoPageSize, query: promoQuery }),
    loadCategoryRows(getSupabaseAdminClient()).catch(() => []),
  ]);
  const categoryOptions = mapCategoryRows(categoryRows);

  const alertRows = [...inventory.outOfStock, ...inventory.lowStock];
  const stockTotalCount = alertRows.length;
  const stockTotalPages = Math.max(1, Math.ceil(stockTotalCount / stockPageSize));
  const stockPage = Math.min(stockRequestedPage, stockTotalPages);
  const stockStartIndex = stockTotalCount ? (stockPage - 1) * stockPageSize + 1 : 0;
  const stockEndIndex = Math.min(stockTotalCount, stockPage * stockPageSize);
  const stockRows = alertRows.slice(stockStartIndex ? stockStartIndex - 1 : 0, stockEndIndex);

  const priceTotalPages = Math.max(1, priceCatalogue.totalPages || Math.ceil(priceCatalogue.totalCount / pricePageSize) || 1);
  const pricePage = Math.min(priceRequestedPage, priceTotalPages);
  const priceStartIndex = priceCatalogue.totalCount ? (pricePage - 1) * pricePageSize + 1 : 0;
  const priceEndIndex = Math.min(priceCatalogue.totalCount, pricePage * pricePageSize);

  const seasonTotalPages = Math.max(
    1,
    seasonCatalogue.totalPages || Math.ceil(seasonCatalogue.totalCount / seasonPageSize) || 1
  );
  const seasonPage = Math.min(seasonRequestedPage, seasonTotalPages);
  const seasonStartIndex = seasonCatalogue.totalCount ? (seasonPage - 1) * seasonPageSize + 1 : 0;
  const seasonEndIndex = Math.min(seasonCatalogue.totalCount, seasonPage * seasonPageSize);
  const promoTotalPages = Math.max(1, promoCatalogue.totalPages || Math.ceil(promoCatalogue.totalCount / promoPageSize) || 1);
  const promoPage = Math.min(promoRequestedPage, promoTotalPages);
  const promoStartIndex = promoCatalogue.totalCount ? (promoPage - 1) * promoPageSize + 1 : 0;
  const promoEndIndex = Math.min(promoCatalogue.totalCount, promoPage * promoPageSize);

  const warnings = Array.from(
    new Set([
      ...(inventory.warnings || []),
      ...(priceCatalogue.warnings || []),
      ...(seasonCatalogue.warnings || []),
      ...(promoCatalogue.warnings || []),
    ])
  );

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: "0 16px 40px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 6px" }}>Catalogue Admin</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Manage product details, variant selling rules, availability, season, bundles, and promotional ribbons. Pricing and restocking use their dedicated workflows.
        </p>
      </header>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <a
          href="#stock-alerts"
          style={{
            textDecoration: "none",
            border: "1px solid #cbd5e1",
            borderRadius: 999,
            padding: "6px 12px",
            color: "#0f172a",
            background: "#ffffff",
            fontWeight: 600,
          }}
        >
          Stock Alerts
        </a>
        <a
          href="#variant-settings"
          style={{
            textDecoration: "none",
            border: "1px solid #cbd5e1",
            borderRadius: 999,
            padding: "6px 12px",
            color: "#0f172a",
            background: "#ffffff",
            fontWeight: 600,
          }}
        >
          Variant Settings
        </a>
        <a
          href="#season-control"
          style={{
            textDecoration: "none",
            border: "1px solid #cbd5e1",
            borderRadius: 999,
            padding: "6px 12px",
            color: "#0f172a",
            background: "#ffffff",
            fontWeight: 600,
          }}
        >
          Product Management
        </a>
        <a
          href="#promo-control"
          style={{
            textDecoration: "none",
            border: "1px solid #cbd5e1",
            borderRadius: 999,
            padding: "6px 12px",
            color: "#0f172a",
            background: "#ffffff",
            fontWeight: 600,
          }}
        >
          Promo Tag
        </a>
      </div>

      <section
        style={{
          marginBottom: 12,
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          color: "#1d4ed8",
          borderRadius: 8,
          padding: "10px 12px",
        }}
      >
        <strong>Merchandising flags now have their own workflow.</strong>{" "}
        <Link href="/admin/catalogue/merchandising" style={{ color: "#1d4ed8", fontWeight: 700, textDecoration: "underline" }}>
          Open Product Merchandising Flags
        </Link>{" "}
        to manage featured, hidden, bestseller, new arrival, homepage pick, and bundle-eligible states.
      </section>

      {warnings.length ? (
        <section
          style={{
            marginBottom: 12,
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            color: "#9a3412",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          <strong>Some catalogue data is partial.</strong>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <article style={{ border: "1px solid #fecaca", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#991b1b", fontSize: 12 }}>Alert Items</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#991b1b" }}>
            {adminFormatters.number(stockTotalCount)}
          </p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Tracked Variants</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(priceCatalogue.totalVariants)}</p>
        </article>
        <article style={{ border: "1px solid #dcfce7", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#166534", fontSize: 12 }}>Products In Season</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#166534" }}>
            {adminFormatters.number(seasonCatalogue.inSeasonProducts)}
          </p>
        </article>
        <article style={{ border: "1px solid #fecaca", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#991b1b", fontSize: 12 }}>Products Out Of Season</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#991b1b" }}>
            {adminFormatters.number(seasonCatalogue.outOfSeasonProducts)}
          </p>
        </article>
        <article style={{ border: "1px solid #fecaca", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#991b1b", fontSize: 12 }}>Active Promo Tags</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#991b1b" }}>
            {adminFormatters.number(promoCatalogue.activePromoCount)}
          </p>
        </article>
      </section>

      <section
        id="stock-alerts"
        style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff", marginBottom: 16 }}
      >
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Stock Alerts</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Review items that are out of stock or running low. All stock changes are completed in Inventory so the stock ledger has one authoritative workflow.
          </p>
        </div>

        <form
          method="GET"
          style={{
            padding: 12,
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <PreservedParams params={params} exclude={["stockPage", "threshold", "stockPageSize"]} />
          <input type="hidden" name="stockPage" value="1" />
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ color: "#475569", fontSize: 12, fontWeight: 600 }}>Low stock threshold</span>
            <input
              type="number"
              name="threshold"
              min={1}
              max={20}
              defaultValue={String(threshold)}
              style={{ width: 92, border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ color: "#475569", fontSize: 12, fontWeight: 600 }}>Rows</span>
            <select
              name="stockPageSize"
              defaultValue={String(stockPageSize)}
              style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}
            >
              <option value="20">20 rows</option>
              <option value="50">50 rows</option>
              <option value="100">100 rows</option>
            </select>
          </label>
          <button
            type="submit"
            style={{
              border: "1px solid #0f172a",
              borderRadius: 8,
              background: "#0f172a",
              color: "#ffffff",
              padding: "8px 12px",
              fontSize: 14,
              fontWeight: 600,
              alignSelf: "end",
            }}
          >
            Apply
          </button>
        </form>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Item</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Stock</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Severity</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Current Price</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Inventory Action</th>
              </tr>
            </thead>
            <tbody>
              {stockRows.map((row) => {
                const severity = row.stock === 0 ? "Out of stock" : "Low stock";
                const tone = row.stock === 0 ? { bg: "#fee2e2", fg: "#991b1b" } : { bg: "#fef9c3", fg: "#854d0e" };

                return (
                  <tr key={String(row.id)} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <p style={{ margin: 0, fontWeight: 600 }}>{row.name}</p>
                      <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                        Product ID: {row.productId} | Variant ID: {row.id}
                        {row.unit ? ` | ${row.unit}` : ""}
                      </p>
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      {row.stock == null ? "-" : adminFormatters.number(row.stock)}
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <span
                        style={{
                          background: tone.bg,
                          color: tone.fg,
                          borderRadius: 999,
                          padding: "3px 8px",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {severity}
                      </span>
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>{adminFormatters.currency(row.price)}</p>
                      <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                        {row.oldPrice != null && row.oldPrice > row.price
                          ? `Old price: ${adminFormatters.currency(row.oldPrice)}`
                          : "Old price not set"}
                      </p>
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <Link
                        href={`/admin/inventory?threshold=${threshold}`}
                        style={{ display: "inline-block", border: "1px solid #cbd5e1", borderRadius: 8, background: "#ffffff", color: "#0f172a", padding: "7px 10px", fontSize: 12, fontWeight: 700, textDecoration: "none" }}
                      >
                        Restock in Inventory
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!stockRows.length ? (
          <p style={{ margin: 0, padding: 12, color: "#64748b" }}>No alert items match the current stock threshold.</p>
        ) : null}

        <SectionPagination
          params={params}
          pageKey="stockPage"
          currentPage={stockPage}
          totalPages={stockTotalPages}
          totalCount={stockTotalCount}
          startIndex={stockStartIndex}
          endIndex={stockEndIndex}
        />
      </section>

      <section
        id="variant-settings"
        style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff", marginBottom: 16 }}
      >
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Variant Settings</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Update storefront availability and purchase quantity rules. Use the dedicated Price Manager for prices and Inventory for stock changes.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <Link href="/admin/prices" style={{ border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff", color: "#1d4ed8", padding: "7px 10px", fontSize: 12, fontWeight: 800, textDecoration: "none" }}>
              Open Price Manager
            </Link>
            <Link href="/admin/inventory" style={{ border: "1px solid #bbf7d0", borderRadius: 8, background: "#f0fdf4", color: "#166534", padding: "7px 10px", fontSize: 12, fontWeight: 800, textDecoration: "none" }}>
              Open Inventory
            </Link>
          </div>
        </div>

        <form
          method="GET"
          style={{
            padding: 12,
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <PreservedParams params={params} exclude={["pricePage", "pricePageSize", "priceQ"]} />
          <input type="hidden" name="pricePage" value="1" />
          <input
            type="search"
            name="priceQ"
            defaultValue={priceQuery}
            placeholder="Search product or variant"
            style={{
              minWidth: 240,
              flex: "1 1 280px",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 14,
            }}
          />
          <select
            name="pricePageSize"
            defaultValue={String(pricePageSize)}
            style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}
          >
            <option value="25">25 rows</option>
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
          </select>
          <button
            type="submit"
            style={{
              border: "1px solid #0f172a",
              borderRadius: 8,
              background: "#0f172a",
              color: "#ffffff",
              padding: "8px 12px",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Filter
          </button>
        </form>

        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: 13 }}>
          Showing {priceCatalogue.totalCount ? `${priceStartIndex}-${priceEndIndex}` : "0"} of {priceCatalogue.totalCount} variants.
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1320 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Product</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Variant</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Current</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Update</th>
              </tr>
            </thead>
            <tbody>
              {priceCatalogue.records.map((row) => (
                <tr key={`${row.productId}-${row.variantId}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{row.productName}</p>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>Product ID: {row.productId}</p>
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{row.variantName}</p>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                      Variant ID: {row.variantId}
                      {row.unit ? ` | ${row.unit}` : ""}
                    </p>
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{adminFormatters.currency(row.price)}</p>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                      {row.oldPrice != null && row.oldPrice > row.price
                        ? `Old price: ${adminFormatters.currency(row.oldPrice)}`
                        : "Old price not set"}
                    </p>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                      Stock: {row.stockCount == null ? "-" : adminFormatters.number(row.stockCount)}
                    </p>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                      Purchase: {row.purchaseMode === "loose" ? "Loose" : "Fixed"}
                      {row.minQuantity != null ? ` | Min ${row.minQuantity}` : ""}
                      {row.maxQuantity != null ? ` | Max ${row.maxQuantity}` : ""}
                      {row.stepQuantity != null ? ` | Step ${row.stepQuantity}` : ""}
                      {row.baseUnit ? ` | Base ${row.baseQuantity || 1} ${row.baseUnit}` : ""}
                    </p>
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <AdminProductCatalogControl
                      productId={row.productId}
                      productName={row.productName}
                      variantId={row.variantId}
                      variantName={row.variantName}
                      variantActive={row.variantActive}
                      purchaseMode={row.purchaseMode}
                      minQuantity={row.minQuantity}
                      maxQuantity={row.maxQuantity}
                      stepQuantity={row.stepQuantity}
                      baseUnit={row.baseUnit}
                      baseQuantity={row.baseQuantity}
                      showSeason={false}
                      showAvailability
                      showPurchaseRules
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!priceCatalogue.records.length ? (
          <p style={{ margin: 0, padding: 12, color: "#64748b" }}>No variants match the current filter.</p>
        ) : null}

        <SectionPagination
          params={params}
          pageKey="pricePage"
          currentPage={pricePage}
          totalPages={priceTotalPages}
          totalCount={priceCatalogue.totalCount}
          startIndex={priceStartIndex}
          endIndex={priceEndIndex}
        />
      </section>

      <section id="season-control" style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Product Management</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Update category, product availability, season status, image URL, and bundle eligibility without touching variant pricing.
          </p>
        </div>

        <form
          method="GET"
          style={{
            padding: 12,
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <PreservedParams params={params} exclude={["seasonPage", "seasonPageSize", "seasonQ"]} />
          <input type="hidden" name="seasonPage" value="1" />
          <input
            type="search"
            name="seasonQ"
            defaultValue={seasonQuery}
            placeholder="Search product"
            style={{
              minWidth: 240,
              flex: "1 1 280px",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 14,
            }}
          />
          <select
            name="seasonPageSize"
            defaultValue={String(seasonPageSize)}
            style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}
          >
            <option value="25">25 rows</option>
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
          </select>
          <button
            type="submit"
            style={{
              border: "1px solid #0f172a",
              borderRadius: 8,
              background: "#0f172a",
              color: "#ffffff",
              padding: "8px 12px",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Filter
          </button>
        </form>

        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: 13 }}>
          Showing {seasonCatalogue.totalCount ? `${seasonStartIndex}-${seasonEndIndex}` : "0"} of {seasonCatalogue.totalCount} products.
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Product</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Current Status</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Category / Image</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Update</th>
              </tr>
            </thead>
            <tbody>
              {seasonCatalogue.records.map((row) => {
                const seasonTone = row.productInSeason
                  ? { bg: "#dcfce7", fg: "#166534", label: "In Season" }
                  : { bg: "#fee2e2", fg: "#991b1b", label: "Out Of Season" };

                return (
                  <tr key={String(row.productId)} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <p style={{ margin: 0, fontWeight: 600 }}>{row.productName}</p>
                      <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>Product ID: {row.productId}</p>
                      {!row.productActive ? (
                        <span
                          style={{
                            display: "inline-block",
                            marginTop: 6,
                            background: "#e5e7eb",
                            color: "#374151",
                            borderRadius: 999,
                            padding: "2px 8px",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          Inactive
                        </span>
                      ) : null}
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <span
                        style={{
                          display: "inline-block",
                          background: seasonTone.bg,
                          color: seasonTone.fg,
                          borderRadius: 999,
                          padding: "4px 10px",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {seasonTone.label}
                      </span>
                      {row.isBundleEligible ? (
                        <span
                          style={{
                            display: "inline-block",
                            marginTop: 6,
                            marginLeft: 6,
                            background: "#ede9fe",
                            color: "#5b21b6",
                            borderRadius: 999,
                            padding: "4px 10px",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          Bundle Eligible
                        </span>
                      ) : null}
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <p style={{ margin: 0, color: "#0f172a", fontSize: 13 }}>
                        {categoryOptions.find((category) => String(category.id) === String(row.categoryId))?.label || "Unassigned"}
                      </p>
                      <p
                        style={{
                          margin: "4px 0 0",
                          color: row.imageUrl ? "#64748b" : "#b91c1c",
                          fontSize: 12,
                          maxWidth: 240,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={row.imageUrl || "No image URL"}
                      >
                        {row.imageUrl || "No image URL"}
                      </p>
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <AdminProductManagementControl
                        productId={row.productId}
                        productName={row.productName}
                        inSeason={row.productInSeason}
                        productActive={row.productActive}
                        categoryId={row.categoryId}
                        imageUrl={row.imageUrl}
                        isBundleEligible={row.isBundleEligible}
                        categories={categoryOptions}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!seasonCatalogue.records.length ? (
          <p style={{ margin: 0, padding: 12, color: "#64748b" }}>No products match the current season filter.</p>
        ) : null}

        <SectionPagination
          params={params}
          pageKey="seasonPage"
          currentPage={seasonPage}
          totalPages={seasonTotalPages}
          totalCount={seasonCatalogue.totalCount}
          startIndex={seasonStartIndex}
          endIndex={seasonEndIndex}
        />
      </section>

      <section
        id="promo-control"
        style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff", marginTop: 16 }}
      >
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Promo Tag Control</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Edit the red top-right storefront ribbon for promos, limited offers, and optional countdowns.
          </p>
        </div>

        {!promoCatalogue.promoSchemaAvailable ? (
          <div
            style={{
              margin: 12,
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              color: "#1d4ed8",
              borderRadius: 8,
              padding: "10px 12px",
            }}
          >
            Promo fields are unavailable until the promo migration is applied.
          </div>
        ) : null}

        <form
          method="GET"
          style={{
            padding: 12,
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <PreservedParams params={params} exclude={["promoPage", "promoPageSize", "promoQ"]} />
          <input type="hidden" name="promoPage" value="1" />
          <input
            type="search"
            name="promoQ"
            defaultValue={promoQuery}
            placeholder="Search product or promo text"
            style={{
              minWidth: 240,
              flex: "1 1 280px",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 14,
            }}
          />
          <select
            name="promoPageSize"
            defaultValue={String(promoPageSize)}
            style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}
          >
            <option value="25">25 rows</option>
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
          </select>
          <button
            type="submit"
            style={{
              border: "1px solid #0f172a",
              borderRadius: 8,
              background: "#0f172a",
              color: "#ffffff",
              padding: "8px 12px",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Filter
          </button>
        </form>

        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: 13 }}>
          Showing {promoCatalogue.totalCount ? `${promoStartIndex}-${promoEndIndex}` : "0"} of {promoCatalogue.totalCount} products.
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1020 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Product</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Current Ribbon</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Update</th>
              </tr>
            </thead>
            <tbody>
              {promoCatalogue.records.map((row) => (
                <tr key={String(row.productId)} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{row.productName}</p>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>Product ID: {row.productId}</p>
                    {!row.productActive ? (
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: 6,
                          background: "#e5e7eb",
                          color: "#374151",
                          borderRadius: 999,
                          padding: "2px 8px",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        Inactive
                      </span>
                    ) : null}
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    {row.promoTagText ? (
                      <>
                        <div
                          style={{
                            position: "relative",
                            width: 220,
                            height: 92,
                            border: "1px solid #e2e8f0",
                            borderRadius: 18,
                            background: "#ffffff",
                            overflow: "hidden",
                          }}
                        >
                          <ProductPromoRibbon
                            text={row.promoTagText}
                            expiresAt={row.promoTagExpiresAt}
                            enabled={row.promoTagEnabled}
                            preview
                          />
                        </div>
                        <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 12 }}>
                          {row.promoTagExpiresAt
                            ? `Expiry: ${adminFormatters.dateTime(row.promoTagExpiresAt)}`
                            : "No expiry set"}
                        </p>
                        <span
                          style={{
                            display: "inline-block",
                            marginTop: 6,
                            background: row.promoTagEnabled ? "#dcfce7" : "#e2e8f0",
                            color: row.promoTagEnabled ? "#166534" : "#334155",
                            borderRadius: 999,
                            padding: "2px 8px",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {row.promoTagEnabled ? "Visible" : "Hidden"}
                        </span>
                        {row.promoIsExpired ? (
                          <span
                            style={{
                              display: "inline-block",
                              marginTop: 6,
                              background: "#fee2e2",
                              color: "#991b1b",
                              borderRadius: 999,
                              padding: "2px 8px",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            Expired
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span style={{ color: "#64748b" }}>No promo ribbon</span>
                    )}
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <AdminProductPromoControl
                      productId={row.productId}
                      productName={row.productName}
                      promoTagText={row.promoTagText}
                      promoTagExpiresAt={row.promoTagExpiresAt}
                      promoTagEnabled={row.promoTagEnabled}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!promoCatalogue.records.length ? (
          <p style={{ margin: 0, padding: 12, color: "#64748b" }}>No products match the current promo filter.</p>
        ) : null}

        <SectionPagination
          params={params}
          pageKey="promoPage"
          currentPage={promoPage}
          totalPages={promoTotalPages}
          totalCount={promoCatalogue.totalCount}
          startIndex={promoStartIndex}
          endIndex={promoEndIndex}
        />
      </section>
    </main>
  );
}
