import { resolveStockClass } from "@/lib/catalogue";
import { toCategorySlug } from "@/lib/categories-server";

const DEFAULT_SITE_URL = "http://localhost:3000";
const DEFAULT_SITE_NAME = "Meal05";
const DEFAULT_CURRENCY = process.env.NEXT_PUBLIC_CURRENCY_CODE || "NGN";
const ORGANIZATION_FRAGMENT = "#organization";
const WEBSITE_FRAGMENT = "#website";
const DEFAULT_ORGANIZATION_LOGO = "/assets/logo/MEAL05 NEW LOGO-01.png";
// Product review data is not a verified launch data source yet. Keep aggregate
// rating structured data disabled until genuine customer reviews are wired in.
const PRODUCT_RATINGS_SCHEMA_ENABLED = false;

const normaliseToken = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const formatCategoryLabel = (value) =>
  String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const resolveBaseUrl = () => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL);
  } catch {
    return new URL(DEFAULT_SITE_URL);
  }
};

const toFiniteNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const resolveStockAvailability = (stockValue) => {
  const stockClass = resolveStockClass(stockValue);
  if (stockClass === "is-unavailable") return "https://schema.org/OutOfStock";
  if (stockClass === "is-limited") return "https://schema.org/LimitedAvailability";
  return "https://schema.org/InStock";
};

const buildProductImages = (product) => {
  const images = new Set();
  const gallery = Array.isArray(product?.galleryImageUrls) ? product.galleryImageUrls : [];
  const fallback = product?.mainImageUrl || product?.image || "";

  [...gallery, fallback].forEach((image) => {
    if (!image) return;
    images.add(toAbsoluteUrl(image));
  });

  return Array.from(images);
};

const buildSku = (productId) => {
  const text = String(productId || "").trim();
  if (!text) return "";
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return `MK-${text}`;
  return `MK-${String(Math.trunc(numeric)).padStart(4, "0")}`;
};

export const resolveSiteUrlObject = () => resolveBaseUrl();

export const resolveSiteUrl = () => resolveBaseUrl().toString().replace(/\/$/, "");

export const toAbsoluteUrl = (pathOrUrl = "/") => {
  if (!pathOrUrl) return resolveSiteUrl();

  try {
    const url = /^https?:\/\//i.test(String(pathOrUrl))
      ? new URL(String(pathOrUrl))
      : new URL(String(pathOrUrl), resolveBaseUrl());
    return url.toString();
  } catch {
    return resolveSiteUrl();
  }
};

export const resolveCategorySchemaData = (value) => {
  const token = normaliseToken(value);
  if (!token) return null;

  const slug = toCategorySlug(value);

  return {
    name: formatCategoryLabel(value),
    slug,
    path: slug ? `/categories/${slug}` : "",
  };
};

export const buildOrganizationSchema = ({
  siteName = DEFAULT_SITE_NAME,
  siteUrl = resolveSiteUrl(),
} = {}) => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${siteUrl}${ORGANIZATION_FRAGMENT}`,
  name: siteName,
  url: siteUrl,
  logo: toAbsoluteUrl(DEFAULT_ORGANIZATION_LOGO),
});

export const buildWebSiteSchema = ({
  siteName = DEFAULT_SITE_NAME,
  siteUrl = resolveSiteUrl(),
  searchPath = "/search",
} = {}) => {
  const safeSearchPath = String(searchPath || "/search").startsWith("/")
    ? String(searchPath || "/search")
    : `/${String(searchPath || "search")}`;

  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}${WEBSITE_FRAGMENT}`,
    url: siteUrl,
    name: siteName,
    publisher: {
      "@id": `${siteUrl}${ORGANIZATION_FRAGMENT}`,
    },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}${safeSearchPath}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
};

export const buildProductSchema = ({
  product,
  productPath,
  description = "",
  categoryName = "",
  ratings = null,
  siteName = DEFAULT_SITE_NAME,
  currency = DEFAULT_CURRENCY,
} = {}) => {
  if (!product || !product.name) return null;

  const productUrl = toAbsoluteUrl(productPath || "/");
  const images = buildProductImages(product);
  const price = toFiniteNumber(product.price);
  const averageRating = PRODUCT_RATINGS_SCHEMA_ENABLED ? toFiniteNumber(ratings?.average) : null;
  const totalRatings = PRODUCT_RATINGS_SCHEMA_ENABLED ? toFiniteNumber(ratings?.totalRatings) : null;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${productUrl}#product`,
    url: productUrl,
    name: String(product.name),
    brand: {
      "@type": "Brand",
      name: siteName,
    },
  };

  if (images.length) {
    schema.image = images;
  }

  if (description) {
    schema.description = String(description);
  }

  if (categoryName) {
    schema.category = String(categoryName);
  }

  const sku = buildSku(product.id);
  if (sku) {
    schema.sku = sku;
  }

  if (price != null) {
    schema.offers = {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: currency,
      price,
      availability: resolveStockAvailability(product.stock),
      itemCondition: "https://schema.org/NewCondition",
    };
  }

  if (averageRating != null && totalRatings != null && totalRatings > 0) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(averageRating.toFixed(1)),
      reviewCount: Math.round(totalRatings),
    };
  }

  return schema;
};

export const buildBreadcrumbSchema = (items = []) => {
  if (!Array.isArray(items) || !items.length) return null;

  const entries = items
    .filter((item) => item && item.name)
    .map((item, index) => {
      const entry = {
        "@type": "ListItem",
        position: index + 1,
        name: String(item.name),
      };

      if (item.url) {
        entry.item = toAbsoluteUrl(item.url);
      }

      return entry;
    });

  if (!entries.length) return null;

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: entries,
  };
};

export const buildFaqSchema = (items = []) => {
  if (!Array.isArray(items) || !items.length) return null;

  const entities = items
    .filter((item) => item && item.question && item.answer)
    .map((item) => ({
      "@type": "Question",
      name: String(item.question),
      acceptedAnswer: {
        "@type": "Answer",
        text: String(item.answer),
      },
    }));

  if (!entities.length) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entities,
  };
};
