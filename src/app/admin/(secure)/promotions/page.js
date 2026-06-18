import Link from "next/link";
import AdminPromoCodeControl from "@/components/admin-promo-code-control";
import { adminFormatters, loadPromoCodeAdminData } from "@/lib/admin-dashboard-data";

export const dynamic = "force-dynamic";

const PAGE_PATH = "/admin/promotions";

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

export default async function AdminPromotionsPage({ searchParams }) {
  const params = (await searchParams) || {};
  const query = String(params?.q || "").trim();
  const pageSize = Math.max(10, Math.min(100, toPositiveInt(params?.pageSize, 25)));
  const requestedPage = toPositiveInt(params?.page, 1);
  const promoCodes = await loadPromoCodeAdminData({ page: requestedPage, pageSize, query });
  const currentPage = promoCodes.page;
  const totalPages = promoCodes.totalPages;
  const startIndex = promoCodes.totalCount ? (currentPage - 1) * pageSize + 1 : 0;
  const endIndex = Math.min(promoCodes.totalCount, currentPage * pageSize);

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: "0 16px 40px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 6px" }}>Promotions</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Manage voucher and promo codes that customers can apply in cart and checkout.
        </p>
      </header>

      {promoCodes.warnings.length ? (
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
          <strong>Some promotion data is partial.</strong>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {promoCodes.warnings.map((warning) => (
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
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Total Codes</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(promoCodes.totalCount)}</p>
        </article>
        <article style={{ border: "1px solid #dcfce7", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#166534", fontSize: 12 }}>Active Now</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#166534" }}>{adminFormatters.number(promoCodes.activeCount)}</p>
        </article>
        <article style={{ border: "1px solid #fef3c7", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#854d0e", fontSize: 12 }}>Scheduled</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#854d0e" }}>{adminFormatters.number(promoCodes.scheduledCount)}</p>
        </article>
        <article style={{ border: "1px solid #fee2e2", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#991b1b", fontSize: 12 }}>Expired</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#991b1b" }}>{adminFormatters.number(promoCodes.expiredCount)}</p>
        </article>
      </section>

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff", marginBottom: 16 }}>
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Create Promo Code</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Use uppercase codes like <code>FRESHSAVE</code> or <code>SHIPFREE</code>.
          </p>
        </div>
        <div style={{ padding: 12 }}>
          <AdminPromoCodeControl submitLabel="Create Code" />
        </div>
      </section>

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Existing Promo Codes</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Showing {promoCodes.totalCount ? `${startIndex}-${endIndex}` : "0"} of {promoCodes.totalCount} codes.
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
          <PreservedParams params={params} exclude={["page", "pageSize", "q"]} />
          <input type="hidden" name="page" value="1" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search code or description"
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
            name="pageSize"
            defaultValue={String(pageSize)}
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

        <div style={{ padding: 12, display: "grid", gap: 12 }}>
          {promoCodes.records.map((promo) => {
            const tone = promo.expired
              ? { bg: "#fee2e2", fg: "#991b1b", label: "Expired" }
              : promo.scheduled
                ? { bg: "#fef3c7", fg: "#854d0e", label: "Scheduled" }
                : promo.isActive
                  ? { bg: "#dcfce7", fg: "#166534", label: "Active" }
                  : { bg: "#e5e7eb", fg: "#374151", label: "Inactive" };

            return (
              <article
                key={String(promo.id)}
                style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", padding: 12 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 16 }}>{promo.code}</strong>
                      <span
                        style={{
                          background: tone.bg,
                          color: tone.fg,
                          borderRadius: 999,
                          padding: "3px 8px",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {tone.label}
                      </span>
                    </div>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
                      {promo.description || "No description"}
                    </p>
                  </div>
                  <div style={{ color: "#475569", fontSize: 12 }}>
                    <p style={{ margin: 0 }}>Used: {adminFormatters.number(promo.usageCount || 0)}</p>
                    <p style={{ margin: "4px 0 0" }}>
                      Limit: {promo.usageLimit != null ? adminFormatters.number(promo.usageLimit) : "No limit"}
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10, color: "#475569", fontSize: 12 }}>
                  <span>Type: {promo.discountType}</span>
                  <span>
                    Value: {promo.discountType === "percent" ? `${promo.discountValue}%` : adminFormatters.currency(promo.discountValue)}
                  </span>
                  <span>
                    Minimum: {promo.minSubtotal != null ? adminFormatters.currency(promo.minSubtotal) : "None"}
                  </span>
                  <span>
                    Max: {promo.maxDiscount != null ? adminFormatters.currency(promo.maxDiscount) : "None"}
                  </span>
                  <span>Starts: {promo.startsAt ? adminFormatters.dateTime(promo.startsAt) : "Now"}</span>
                  <span>Expires: {promo.expiresAt ? adminFormatters.dateTime(promo.expiresAt) : "No expiry"}</span>
                </div>

                <AdminPromoCodeControl
                  promoId={promo.id}
                  code={promo.code}
                  description={promo.description}
                  discountType={promo.discountType}
                  discountValue={promo.discountValue}
                  minSubtotal={promo.minSubtotal}
                  maxDiscount={promo.maxDiscount}
                  startsAt={promo.startsAt}
                  expiresAt={promo.expiresAt}
                  usageLimit={promo.usageLimit}
                  isActive={promo.isActive}
                  submitLabel="Save Changes"
                />
              </article>
            );
          })}

          {!promoCodes.records.length ? (
            <p style={{ margin: 0, color: "#64748b" }}>No promo codes match the current filter.</p>
          ) : null}
        </div>

        {totalPages > 1 ? (
          <div
            style={{
              padding: "10px 12px",
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: "#64748b", fontSize: 13 }}>
              Page {currentPage} of {totalPages}
            </span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {currentPage > 1 ? (
                <Link
                  href={buildPageHref(params, { page: currentPage - 1 })}
                  style={{
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    padding: "6px 10px",
                    textDecoration: "none",
                    color: "#0f172a",
                  }}
                >
                  Previous
                </Link>
              ) : null}
              {currentPage < totalPages ? (
                <Link
                  href={buildPageHref(params, { page: currentPage + 1 })}
                  style={{
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    padding: "6px 10px",
                    textDecoration: "none",
                    color: "#0f172a",
                  }}
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
