import Link from "next/link";
import { adminFormatters, loadProductDataQualityReport } from "@/lib/admin-dashboard-data";
import {
  getProductDataQualityIssueLabel,
  normalizeProductDataQualityFilter,
  PRODUCT_DATA_QUALITY_FILTER_OPTIONS,
  PRODUCT_DATA_QUALITY_ISSUES,
} from "@/lib/product-data-quality";

export const dynamic = "force-dynamic";

const PAGE_PATH = "/admin/products/quality";

const toPositiveInt = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return fallback;
  return Math.floor(numeric);
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

const issueTone = (issue) => {
  if (issue === "missing_image") return { bg: "#dbeafe", fg: "#1d4ed8" };
  if (issue === "missing_unit") return { bg: "#dcfce7", fg: "#166534" };
  if (issue === "missing_packaging_type") return { bg: "#ede9fe", fg: "#6d28d9" };
  if (issue === "no_active_variant") return { bg: "#fee2e2", fg: "#991b1b" };
  if (issue === "no_price") return { bg: "#fef3c7", fg: "#92400e" };
  if (issue === "no_season_value") return { bg: "#fff7ed", fg: "#9a3412" };
  return { bg: "#e5e7eb", fg: "#334155" };
};

const formatBooleanStatus = (value, labels) => {
  if (value === true) return labels.trueLabel;
  if (value === false) return labels.falseLabel;
  return labels.unknownLabel;
};

export default async function AdminProductQualityPage({ searchParams }) {
  const params = (await searchParams) || {};
  const query = String(params?.q || "").trim();
  const issue = normalizeProductDataQualityFilter(params?.issue);
  const pageSize = Math.max(10, Math.min(100, toPositiveInt(params?.pageSize, 25)));
  const page = toPositiveInt(params?.page, 1);

  const data = await loadProductDataQualityReport({ page, pageSize, query, issue });
  const warnings = Array.from(new Set(data.warnings || []));
  const recordStart = data.totalCount ? (data.page - 1) * data.pageSize + 1 : 0;
  const recordEnd = Math.min(data.totalCount, data.page * data.pageSize);

  return (
    <main style={{ maxWidth: 1240, margin: "24px auto", padding: "0 16px 40px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 6px" }}>Product Data Quality</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Surface missing media, packaging, season, price, variant, and promo-state gaps directly from the database.
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
        <strong>Price, season, and merchandising edits stay on the product admin screens.</strong>{" "}
        <Link href="/admin/products" style={{ color: "#1d4ed8", fontWeight: 700, textDecoration: "underline" }}>
          Return to Products
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
          <strong>Some quality checks are partial.</strong>
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
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Tracked Products</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(data.totalProducts)}</p>
        </article>
        <article style={{ border: "1px solid #fee2e2", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#991b1b", fontSize: 12 }}>Flagged Products</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#991b1b" }}>{adminFormatters.number(data.flaggedProducts)}</p>
        </article>
        {PRODUCT_DATA_QUALITY_ISSUES.map((qualityIssue) => (
          <article
            key={qualityIssue.value}
            style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}
          >
            <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>{qualityIssue.label}</p>
            <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(data.countsByIssue?.[qualityIssue.value] || 0)}</p>
          </article>
        ))}
      </section>

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Quality Warning Queue</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Filter the current warning backlog and review each product&apos;s missing operational data.
          </p>
        </div>

        <form
          method="GET"
          style={{ padding: 12, borderBottom: "1px solid #e2e8f0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
        >
          <PreservedParams params={params} exclude={["page", "pageSize", "q", "issue"]} />
          <input type="hidden" name="page" value="1" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search product name or issue"
            style={{ minWidth: 240, flex: "1 1 280px", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}
          />
          <select name="issue" defaultValue={issue} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
            {PRODUCT_DATA_QUALITY_FILTER_OPTIONS.map((option) => (
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
          Showing {data.totalCount ? `${recordStart}-${recordEnd}` : "0"} of {data.totalCount} flagged products.
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Product</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Issues</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Current Coverage</th>
              </tr>
            </thead>
            <tbody>
              {data.records.map((row) => (
                <tr key={String(row.productId)} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{row.productName}</p>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>Product ID: {row.productId}</p>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {!row.productActive ? (
                        <span
                          style={{
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
                      {row.productInSeason === true ? (
                        <span
                          style={{
                            background: "#dcfce7",
                            color: "#166534",
                            borderRadius: 999,
                            padding: "2px 8px",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          In Season
                        </span>
                      ) : null}
                      {row.productInSeason === false ? (
                        <span
                          style={{
                            background: "#fee2e2",
                            color: "#991b1b",
                            borderRadius: 999,
                            padding: "2px 8px",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          Out Of Season
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {row.issueCodes.map((issueCode) => {
                        const tone = issueTone(issueCode);
                        return (
                          <span
                            key={`${row.productId}-${issueCode}`}
                            style={{
                              background: tone.bg,
                              color: tone.fg,
                              borderRadius: 999,
                              padding: "3px 8px",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            {getProductDataQualityIssueLabel(issueCode)}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top", fontSize: 13 }}>
                    <p style={{ margin: 0 }}>
                      Variants: <strong>{adminFormatters.number(row.activeVariantCount)}</strong> active /{" "}
                      <strong>{adminFormatters.number(row.variantCount)}</strong> total
                    </p>
                    <p style={{ margin: "4px 0 0" }}>
                      Image: <strong>{formatBooleanStatus(row.hasImage, { trueLabel: "Present", falseLabel: "Missing", unknownLabel: "Unknown" })}</strong>
                    </p>
                    <p style={{ margin: "4px 0 0" }}>
                      Unit: <strong>{formatBooleanStatus(row.hasUnit, { trueLabel: "Present", falseLabel: "Missing", unknownLabel: "Unknown" })}</strong>
                    </p>
                    <p style={{ margin: "4px 0 0" }}>
                      Packaging:{" "}
                      <strong>{formatBooleanStatus(row.hasPackaging, { trueLabel: "Present", falseLabel: "Missing", unknownLabel: "Unknown" })}</strong>
                    </p>
                    <p style={{ margin: "4px 0 0" }}>
                      Price: <strong>{formatBooleanStatus(row.hasPrice, { trueLabel: "Present", falseLabel: "Missing", unknownLabel: "Unknown" })}</strong>
                    </p>
                    <p style={{ margin: "4px 0 0" }}>
                      Promo State:{" "}
                      <strong>
                        {formatBooleanStatus(row.promoStateKnown, { trueLabel: "Tracked", falseLabel: "Missing", unknownLabel: "Unavailable" })}
                      </strong>
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!data.records.length ? <p style={{ margin: 0, padding: 12, color: "#64748b" }}>No products match the current quality filters.</p> : null}

        <div style={{ padding: "10px 12px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: "#64748b", fontSize: 13 }}>Page {data.page} of {data.totalPages}</span>
          <Pager params={params} page={data.page} totalPages={data.totalPages} />
        </div>
      </section>
    </main>
  );
}
