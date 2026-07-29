import Link from "next/link";
import AdminBannerControl from "@/components/admin-banner-control";
import AdminSiteNotificationControl from "@/components/admin-site-notification-control";
import { adminFormatters, loadBannerAdminData } from "@/lib/admin-dashboard-data";
import { loadSiteNotificationsAdminData } from "@/lib/site-notifications-server";

export const dynamic = "force-dynamic";

const PAGE_PATH = "/admin/campaigns";

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

const statusTone = (status) => {
  if (status === "live") return { bg: "#dcfce7", fg: "#166534" };
  if (status === "scheduled") return { bg: "#fef3c7", fg: "#854d0e" };
  if (status === "expired") return { bg: "#fee2e2", fg: "#991b1b" };
  return { bg: "#e5e7eb", fg: "#374151" };
};

function BannerRecordCard({ banner }) {
  const tone = statusTone(banner.status);

  return (
    <article
      key={String(banner.id)}
      style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", padding: 12 }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <div
            style={{
              position: "relative",
              minHeight: 160,
              borderRadius: 10,
              overflow: "hidden",
              background: banner.accentSoft || "#e2e8f0",
            }}
          >
            {banner.image ? (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `url("${banner.image.replace(/"/g, '\\"')}")`,
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "cover",
                }}
              />
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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
              {banner.statusLabel}
            </span>
            <span style={{ color: "#475569", fontSize: 12 }}>
              Position: {banner.position != null ? adminFormatters.number(banner.position) : "Auto"}
            </span>
          </div>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <div>
              <strong style={{ fontSize: 16 }}>{banner.title || banner.heading?.[0] || `Banner ${banner.id}`}</strong>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>{banner.tag || "No campaign tag"}</p>
            </div>
            <div style={{ color: "#475569", fontSize: 12, textAlign: "right" }}>
              <p style={{ margin: 0 }}>Starts: {banner.startsAt ? adminFormatters.dateTime(banner.startsAt) : "Immediately"}</p>
              <p style={{ margin: "4px 0 0" }}>
                Expires: {banner.expiresAt ? adminFormatters.dateTime(banner.expiresAt) : "No expiry"}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10, color: "#475569", fontSize: 12 }}>
            <span>CTA: {banner.ctaLabel || "None"}</span>
            <span>Target: {banner.href || "None"}</span>
            <span>
              Mobile Image:{" "}
              {banner.mobileImage
                ? banner.mobileImageSource === "inferred"
                  ? "Auto matched from storage"
                  : "Stored on banner"
                : "Fallback / none"}
            </span>
          </div>

          {banner.description ? (
            <p style={{ margin: "0 0 10px", color: "#334155", fontSize: 13, lineHeight: 1.5 }}>{banner.description}</p>
          ) : null}

          <AdminBannerControl
            bannerId={banner.id}
            placement={banner.placement}
            title={banner.title}
            heading={banner.headingText}
            tag={banner.tag}
            description={banner.description}
            imageUrl={banner.image}
            mobileImageUrl={banner.mobileImage}
            alt={banner.alt}
            ctaLabel={banner.ctaLabel}
            ctaHref={banner.href}
            sortOrder={banner.position}
            accent={banner.accent}
            accentSoft={banner.accentSoft}
            startsAt={banner.startsAt}
            expiresAt={banner.expiresAt}
            isActive={banner.isActive !== false}
            submitLabel="Save Changes"
          />
        </div>
      </div>
    </article>
  );
}

function BannerSection({
  title,
  subtitle,
  createTitle,
  createDescription,
  createPlacement,
  createLabel,
  records,
  emptyText,
}) {
  return (
    <>
      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff", marginBottom: 16 }}>
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>{createTitle}</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>{createDescription}</p>
        </div>
        <div style={{ padding: 12 }}>
          <AdminBannerControl placement={createPlacement} submitLabel={createLabel} isActive={false} />
        </div>
      </section>

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff", marginBottom: 16 }}>
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>{title}</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>{subtitle}</p>
        </div>

        <div style={{ padding: 12, display: "grid", gap: 12 }}>
          {records.map((banner) => (
            <BannerRecordCard key={String(banner.id)} banner={banner} />
          ))}
          {!records.length ? <p style={{ margin: 0, color: "#64748b" }}>{emptyText}</p> : null}
        </div>
      </section>
    </>
  );
}

export default async function AdminCampaignsPage({ searchParams }) {
  const params = (await searchParams) || {};
  const query = String(params?.q || "").trim();
  const pageSize = Math.max(10, Math.min(100, toPositiveInt(params?.pageSize, 20)));
  const requestedPage = toPositiveInt(params?.page, 1);

  const [heroBanners, advertBanners, siteNotifications] = await Promise.all([
    loadBannerAdminData({ page: requestedPage, pageSize, query, placement: "hero" }),
    loadBannerAdminData({ page: 1, pageSize: 25, query, placement: "advert" }),
    loadSiteNotificationsAdminData({ limit: 25 }),
  ]);

  const warnings = Array.from(new Set([
    ...(heroBanners.warnings || []),
    ...(advertBanners.warnings || []),
    ...(siteNotifications.warnings || []),
  ]));
  const currentPage = heroBanners.page;
  const totalPages = heroBanners.totalPages;
  const startIndex = heroBanners.totalCount ? (currentPage - 1) * pageSize + 1 : 0;
  const endIndex = Math.min(heroBanners.totalCount, currentPage * pageSize);

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: "0 16px 40px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 6px" }}>Campaigns</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Manage homepage hero banners, sponsored ads, target links, and schedule windows.
        </p>
      </header>

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
          <strong>Some campaign data is partial.</strong>
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
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Hero Banners</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(heroBanners.totalCount)}</p>
        </article>
        <article style={{ border: "1px solid #dcfce7", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#166534", fontSize: 12 }}>Hero Live Now</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#166534" }}>{adminFormatters.number(heroBanners.liveCount)}</p>
        </article>
        <article style={{ border: "1px solid #fef3c7", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#854d0e", fontSize: 12 }}>Hero Scheduled</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#854d0e" }}>{adminFormatters.number(heroBanners.scheduledCount)}</p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Sponsored Ads</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(advertBanners.totalCount)}</p>
        </article>
        <article style={{ border: "1px solid #dcfce7", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#166534", fontSize: 12 }}>Sponsored Live</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#166534" }}>{adminFormatters.number(advertBanners.liveCount)}</p>
        </article>
      </section>

      <form
        method="GET"
        style={{
          padding: 12,
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          background: "#ffffff",
          marginBottom: 16,
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
          placeholder="Search title, heading, CTA, or image"
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
          <option value="20">20 hero rows</option>
          <option value="50">50 hero rows</option>
          <option value="100">100 hero rows</option>
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

      <AdminSiteNotificationControl records={siteNotifications.records} />

      <BannerSection
        createTitle="Create Hero Banner"
        createDescription="Homepage hero banners can be scheduled ahead of time and pointed to any storefront route."
        createPlacement="hero"
        createLabel="Create Hero Banner"
        title="Existing Hero Campaigns"
        subtitle={`Showing ${heroBanners.totalCount ? `${startIndex}-${endIndex}` : "0"} of ${heroBanners.totalCount} hero banners.`}
        records={heroBanners.records}
        emptyText="No hero banners match the current filter."
      />

      {totalPages > 1 ? (
        <section
          style={{
            padding: "10px 12px",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            background: "#ffffff",
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ color: "#64748b", fontSize: 13 }}>
            Hero page {currentPage} of {totalPages}
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
        </section>
      ) : null}

      <BannerSection
        createTitle="Create Sponsored Ad"
        createDescription="This controls the single sponsored ad block shown on the homepage below the bundle plans section."
        createPlacement="advert"
        createLabel="Create Sponsored Ad"
        title="Existing Sponsored Ads"
        subtitle={`Showing ${advertBanners.totalCount} sponsored ad creative${advertBanners.totalCount === 1 ? "" : "s"}.`}
        records={advertBanners.records}
        emptyText="No sponsored ads match the current filter."
      />
    </main>
  );
}
