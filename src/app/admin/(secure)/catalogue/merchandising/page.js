import Link from "next/link";
import { adminFormatters, loadProductMerchandisingAdminCatalogue } from "@/lib/admin-dashboard-data";
import {
  normalizeProductMerchandisingFilter,
  PRODUCT_MERCHANDISING_FILTER_OPTIONS,
} from "@/lib/product-merchandising";
import AdminProductMerchandisingControl from "@/components/admin-product-merchandising-control";

export const dynamic = "force-dynamic";

const PAGE_PATH = "/admin/catalogue/merchandising";

const toPositiveInt = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
};

const buildPageHref = (params, updates = {}) => {
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

function PreservedParams({ params, exclude = [] }) {
  return Object.entries(params || {}).map(([key, value]) => {
    if (exclude.includes(key)) return null;
    if (value == null || value === "") return null;
    return <input key={key} type="hidden" name={key} value={String(value)} />;
  });
}

function Pager({ params, page, totalPages }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Link
        href={buildPageHref(params, { page: Math.max(1, page - 1) })}
        style={{
          pointerEvents: page <= 1 ? "none" : "auto",
          opacity: page <= 1 ? 0.5 : 1,
          textDecoration: "none",
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          padding: "6px 10px",
          color: "#0f172a",
          background: "#ffffff",
        }}
      >
        Previous
      </Link>
      <Link
        href={buildPageHref(params, { page: Math.min(totalPages, page + 1) })}
        style={{
          pointerEvents: page >= totalPages ? "none" : "auto",
          opacity: page >= totalPages ? 0.5 : 1,
          textDecoration: "none",
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          padding: "6px 10px",
          color: "#0f172a",
          background: "#ffffff",
        }}
      >
        Next
      </Link>
    </div>
  );
}

const flagTone = (flag) => {
  if (flag === "Hidden") return { bg: "#111827", fg: "#ffffff" };
  if (flag === "Homepage Pick") return { bg: "#dbeafe", fg: "#1d4ed8" };
  if (flag === "Featured") return { bg: "#dcfce7", fg: "#166534" };
  if (flag === "Bestseller") return { bg: "#fef3c7", fg: "#92400e" };
  if (flag === "New Arrival") return { bg: "#fee2e2", fg: "#991b1b" };
  return { bg: "#ede9fe", fg: "#6d28d9" };
};

export default async function AdminCatalogueMerchandisingPage({ searchParams }) {
  const params = (await searchParams) || {};
  const query = String(params?.q || "").trim();
  const filter = normalizeProductMerchandisingFilter(params?.filter);
  const pageSize = Math.max(10, Math.min(100, toPositiveInt(params?.pageSize, 25)));
  const page = toPositiveInt(params?.page, 1);

  const data = await loadProductMerchandisingAdminCatalogue({ page, pageSize, query, filter });
  const warnings = Array.from(new Set(data.warnings || []));
  const recordStart = data.totalCount ? (data.page - 1) * data.pageSize + 1 : 0;
  const recordEnd = Math.min(data.totalCount, data.page * data.pageSize);

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: "0 16px 40px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 6px" }}>Product Merchandising Flags</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Manage featured placement, hidden status, bestseller labels, new arrivals, homepage picks, and bundle eligibility.
        </p>
      </header>

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
        <strong>Price, season, and promo edits stay on the main catalogue screen.</strong>{" "}
        <Link href="/admin/catalogue" style={{ color: "#1d4ed8", fontWeight: 700, textDecoration: "underline" }}>
          Return to Catalogue
        </Link>
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
          <strong>Some merchandising data is partial.</strong>
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
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Tracked Products</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(data.totalProducts)}</p>
        </article>
        <article style={{ border: "1px solid #dbeafe", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#1d4ed8", fontSize: 12 }}>Flagged Products</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#1d4ed8" }}>{adminFormatters.number(data.flaggedCount)}</p>
        </article>
        <article style={{ border: "1px solid #111827", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#111827", fontSize: 12 }}>Hidden</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#111827" }}>{adminFormatters.number(data.hiddenCount)}</p>
        </article>
        <article style={{ border: "1px solid #dcfce7", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#166534", fontSize: 12 }}>Featured</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#166534" }}>{adminFormatters.number(data.featuredCount)}</p>
        </article>
        <article style={{ border: "1px solid #fef3c7", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#92400e", fontSize: 12 }}>Bestseller</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#92400e" }}>{adminFormatters.number(data.bestsellerCount)}</p>
        </article>
        <article style={{ border: "1px solid #fee2e2", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#991b1b", fontSize: 12 }}>New Arrival</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#991b1b" }}>{adminFormatters.number(data.newArrivalCount)}</p>
        </article>
        <article style={{ border: "1px solid #dbeafe", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#1d4ed8", fontSize: 12 }}>Homepage Pick</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#1d4ed8" }}>{adminFormatters.number(data.homepagePickCount)}</p>
        </article>
        <article style={{ border: "1px solid #ede9fe", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#6d28d9", fontSize: 12 }}>Bundle Eligible</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#6d28d9" }}>{adminFormatters.number(data.bundleEligibleCount)}</p>
        </article>
      </section>

      {!data.schemaAvailable ? (
        <section
          style={{
            marginBottom: 16,
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            color: "#1d4ed8",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          Merchandising controls will appear here after the merchandising migration is applied.
        </section>
      ) : null}

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Merchandising Queue</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Search products and filter by merchandising state to manage storefront curation.
          </p>
        </div>

        <form
          method="GET"
          style={{ padding: 12, borderBottom: "1px solid #e2e8f0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
        >
          <PreservedParams params={params} exclude={["page", "pageSize", "q", "filter"]} />
          <input type="hidden" name="page" value="1" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search product"
            style={{ minWidth: 240, flex: "1 1 280px", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}
          />
          <select name="filter" defaultValue={filter} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
            {PRODUCT_MERCHANDISING_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select name="pageSize" defaultValue={String(pageSize)} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
            <option value="25">25 rows</option>
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
          </select>
          <button
            type="submit"
            style={{ border: "1px solid #0f172a", borderRadius: 8, background: "#0f172a", color: "#ffffff", padding: "8px 12px", fontSize: 14, fontWeight: 600 }}
          >
            Filter
          </button>
        </form>

        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: 13 }}>
          Showing {data.totalCount ? `${recordStart}-${recordEnd}` : "0"} of {data.totalCount} products.
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1060 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Product</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Visibility</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Flags</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Update</th>
              </tr>
            </thead>
            <tbody>
              {data.records.map((row) => (
                <tr key={String(row.productId)} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{row.productName}</p>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>Product ID: {row.productId}</p>
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <span
                      style={{
                        display: "inline-block",
                        background: row.productActive ? "#dcfce7" : "#e5e7eb",
                        color: row.productActive ? "#166534" : "#374151",
                        borderRadius: 999,
                        padding: "3px 8px",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {row.productActive ? "Active" : "Inactive"}
                    </span>
                    <span
                      style={{
                        display: "inline-block",
                        marginLeft: 6,
                        background: row.isHidden ? "#111827" : "#e2e8f0",
                        color: row.isHidden ? "#ffffff" : "#334155",
                        borderRadius: 999,
                        padding: "3px 8px",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {row.isHidden ? "Hidden" : "Visible"}
                    </span>
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    {row.activeFlagLabels.length ? (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {row.activeFlagLabels.map((flag) => {
                          const tone = flagTone(flag);
                          return (
                            <span
                              key={flag}
                              style={{
                                background: tone.bg,
                                color: tone.fg,
                                borderRadius: 999,
                                padding: "3px 8px",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              {flag}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span style={{ color: "#64748b", fontSize: 13 }}>No merchandising flags</span>
                    )}
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <AdminProductMerchandisingControl
                      productId={row.productId}
                      productName={row.productName}
                      is_featured={row.isFeatured}
                      is_hidden={row.isHidden}
                      is_bestseller={row.isBestseller}
                      is_new_arrival={row.isNewArrival}
                      is_homepage_pick={row.isHomepagePick}
                      is_bundle_eligible={row.isBundleEligible}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!data.records.length ? (
          <p style={{ margin: 0, padding: 12, color: "#64748b" }}>No products match the current merchandising filter.</p>
        ) : null}

        <div style={{ padding: "10px 12px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: "#64748b", fontSize: 13 }}>Page {data.page} of {data.totalPages}</span>
          <Pager params={params} page={data.page} totalPages={data.totalPages} />
        </div>
      </section>
    </main>
  );
}
