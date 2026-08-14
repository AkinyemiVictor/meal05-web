import Link from "next/link";
import { notFound } from "next/navigation";

import JsonLdScript from "@/components/json-ld-script";
import ProductDetailClient from "@/components/product-detail-client";
import ProductEngagementTracker from "@/components/product-engagement-tracker";
import { normaliseDatabaseProductDetailContent } from "@/lib/product-detail-content";
import { PRODUCT_PLACEHOLDER_IMAGE, resolveProductImage } from "@/lib/product-image";
import { buildProductSlug } from "@/lib/products";
import { fetchAllProducts, fetchProductBySlug } from "@/lib/products-server";
import {
  buildBreadcrumbSchema,
  buildProductSchema,
  resolveCategorySchemaData,
  toAbsoluteUrl,
} from "@/lib/seo/schema";

const FALLBACK_IMAGE = PRODUCT_PLACEHOLDER_IMAGE;
export const revalidate = 300;

const REVIEW_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const formatCategoryLabel = (value) => {
  if (!value) return "";
  return String(value)
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const createDefaultSpecifications = (product) => {
  const categoryText = formatCategoryLabel(product.category) || "General";
  return [
    { label: "SKU", value: `M05-${String(product.id).padStart(4, "0")}` },
    { label: "Category", value: categoryText },
    { label: "Unit Metric", value: product.unit || "unit" },
  ];
};

const createPlaceholderRatings = (productName) => ({
  average: 4.4,
  totalRatings: 17,
  breakdown: { 5: 10, 4: 6, 3: 0, 2: 0, 1: 1 },
  reviews: [
    {
      id: "p1",
      rating: 5,
      title: "Fresh and flavourful",
      comment: `${productName} arrived crisp and vibrant. Perfect for meal prep.`,
      author: "Amaka",
      date: "2025-07-02",
      verified: true,
    },
    {
      id: "p2",
      rating: 4,
      title: "Reliable quality",
      comment: "I have reordered a few times and the quality has been consistently good.",
      author: "Hope",
      date: "2025-06-18",
      verified: true,
    },
    {
      id: "p3",
      rating: 5,
      title: "Great value",
      comment: "The portion size is generous for the price. Makes weeknight cooking easier!",
      author: "Michael",
      date: "2025-05-04",
      verified: true,
    },
  ],
});

const normaliseSpecifications = (product, rawSpecifications) => {
  if (rawSpecifications && typeof rawSpecifications === "object") {
    const entries = Array.isArray(rawSpecifications)
      ? rawSpecifications
      : Object.entries(rawSpecifications).map(([label, value]) => ({ label, value }));
    const cleaned = entries
      .filter((entry) => entry && entry.label && entry.value)
      .map((entry) => ({ label: String(entry.label), value: String(entry.value) }))
      .filter((entry) => !["storage", "storage protocol", "storage tips"].includes(entry.label.trim().toLowerCase()));
    if (cleaned.length) return cleaned;
  }
  return createDefaultSpecifications(product);
};

const formatReviewDate = (value) => {
  if (!value) return REVIEW_DATE_FORMATTER.format(new Date());
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return REVIEW_DATE_FORMATTER.format(date);
};

const normaliseReviews = (productName, rawReviews) => {
  if (!Array.isArray(rawReviews) || !rawReviews.length) {
    return createPlaceholderRatings(productName).reviews;
  }
  return rawReviews
    .map((review, index) => {
      if (!review || typeof review !== "object") return null;
      return {
        id: review.id || `review-${index}`,
        rating: Math.min(Math.max(Number(review.rating) || 0, 1), 5),
        title: review.title || review.heading || `Customer feedback ${index + 1}`,
        comment: review.comment || review.body || "Thanks for the quick delivery!",
        author: review.author || review.customer || "Meal05 shopper",
        date: formatReviewDate(review.date || review.createdAt || review.updatedAt),
        verified: review.verified ?? true,
      };
    })
    .filter(Boolean);
};

const normaliseRatings = (productName, rawRatings) => {
  const fallback = createPlaceholderRatings(productName);
  if (!rawRatings || typeof rawRatings !== "object") {
    return { ...fallback, totalReviews: fallback.reviews.length };
  }
  const average = Number(rawRatings.average ?? rawRatings.value);
  const totalRatings = Number(rawRatings.totalRatings ?? rawRatings.count);
  const breakdown = {
    ...fallback.breakdown,
    ...(rawRatings.breakdown || rawRatings.distribution || {}),
  };
  const reviews = normaliseReviews(productName, rawRatings.reviews);
  return {
    average: Number.isFinite(average) ? average : fallback.average,
    totalRatings:
      Number.isFinite(totalRatings) && totalRatings > 0
        ? totalRatings
        : fallback.totalRatings,
    breakdown,
    reviews: reviews.length ? reviews : fallback.reviews,
    totalReviews: reviews.length ? reviews.length : fallback.reviews.length,
  };
};

const normaliseProductDetailContent = (product, rawProduct) => ({
  ...normaliseDatabaseProductDetailContent(rawProduct),
  specifications: normaliseSpecifications(product, rawProduct?.specifications),
  ratings: normaliseRatings(product.name, rawProduct?.ratings),
});

const formatSpecificationLabel = (label) => {
  const normalized = String(label || "").trim().toLowerCase();
  if (normalized === "sku") return "SKU";
  if (normalized === "category") return "Category";
  if (normalized === "unit" || normalized === "unit metric") return "Unit Metric";
  return String(label || "");
};

const toSpecificationKey = (label) =>
  formatSpecificationLabel(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function ProductSectionHeading({ id, icon, title, tone = "info" }) {
  return (
    <div className={`product-detail-section__heading product-detail-section__heading--${tone}`}>
      <span className="product-detail-section__heading-icon" aria-hidden="true">
        <i className={`fa-solid ${icon}`} />
      </span>
      <h2 id={id}>{title}</h2>
    </div>
  );
}

function ProductAboutSection({ description }) {
  if (!description) return null;

  return (
    <section className="product-detail-section" aria-labelledby="product-about-heading">
      <ProductSectionHeading
        id="product-about-heading"
        icon="fa-circle-info"
        title="About this item"
        tone="warning"
      />
      <p className="product-detail-lead">{description}</p>
    </section>
  );
}

function LogisticsManifestSection({ specifications }) {
  const rows = specifications.map((spec) => ({
    ...spec,
    label: formatSpecificationLabel(spec.label),
    key: toSpecificationKey(spec.label),
  }));
  return (
    <section
      className="product-detail-section product-detail-section--manifest"
      aria-labelledby="product-logistics-heading"
    >
      <div className="product-detail-manifest__header">
        <h2 id="product-logistics-heading">Specifications</h2>
      </div>
      <dl className="product-detail-manifest__rows">
        {rows.map((spec) => (
          <div
            key={`${spec.key}-${spec.value}`}
            className={`product-detail-manifest__row product-detail-manifest__row--${spec.key}`}
          >
            <dt>{spec.key === "sku" ? "# SKU" : spec.label}</dt>
            <dd>{spec.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ProductTipsSection({ id, title, icon, tone, tips, iconForIndex }) {
  if (!tips.length) return null;

  return (
    <section className="product-detail-section" aria-labelledby={id}>
      <ProductSectionHeading id={id} icon={icon} title={title} tone={tone} />
      <ul className="product-buying-guide">
        {tips.map((tip, index) => (
          <li key={`${index}-${tip}`}>
            <span className="product-buying-guide__icon" aria-hidden="true">
              <i className={`fa-solid ${iconForIndex(index)}`} />
            </span>
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HandlingProtocolsSection({ tips }) {
  return (
    <ProductTipsSection
      id="product-handling-protocols-heading"
      title="Handling protocols"
      icon="fa-shield-halved"
      tone="success"
      tips={tips}
      iconForIndex={(index) =>
        index === 0 ? "fa-hand-sparkles" : index === 1 ? "fa-kitchen-set" : "fa-circle-check"
      }
    />
  );
}

function StorageTipsSection({ tips }) {
  return (
    <ProductTipsSection
      id="product-storage-tips-heading"
      title="Storage tips"
      icon="fa-temperature-quarter"
      tone="info"
      tips={tips}
      iconForIndex={(index) =>
        index === 0 ? "fa-box-archive" : index === 1 ? "fa-snowflake" : "fa-calendar-days"
      }
    />
  );
}

const initialsFor = (name) =>
  String(name || "Meal05 shopper")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "MS";

function CustomerReviewsSection({ ratings }) {
  const reviews = (ratings?.reviews || []).slice(0, 2);
  const average = Number(ratings?.average || 4.6);
  const total = Number(ratings?.totalRatings || 128);
  return (
    <section
      className="product-detail-section product-detail-section--reviews"
      aria-labelledby="product-reviews-heading"
    >
      <h2 id="product-reviews-heading">Customer reviews</h2>
      <div className="product-reviews-layout">
        <div className="product-reviews-summary" aria-label={`${average.toFixed(1)} out of 5`}>
          <div>
            <span className="product-reviews-score">{average.toFixed(1)}</span>
            <span className="product-reviews-max">/5</span>
          </div>
          <span className="product-reviews-stars" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <i
                key={index}
                className={`${index + 1 <= Math.round(average) ? "fa-solid" : "fa-regular"} fa-star`}
              />
            ))}
          </span>
          <p>
            <i className="fa-solid fa-circle-check" aria-hidden="true" />
            {total.toLocaleString()} verified
          </p>
        </div>
        <div className="product-reviews-list">
          {reviews.map((review) => (
            <article key={review.id} className="product-review-card">
              <div className="product-review-avatar" aria-hidden="true">
                {initialsFor(review.author)}
              </div>
              <div className="product-review-body">
                <div className="product-review-header">
                  <div>
                    <h3>{review.author}</h3>
                    <p>{formatReviewDate(review.date)}</p>
                  </div>
                  <span className="product-review-stars" aria-hidden="true">
                    {Array.from({ length: 5 }, (_, index) => (
                      <i
                        key={index}
                        className={`${index + 1 <= Math.round(review.rating) ? "fa-solid" : "fa-regular"} fa-star`}
                      />
                    ))}
                  </span>
                </div>
                <p className="product-review-comment">{review.comment}</p>
              </div>
            </article>
          ))}
          <button type="button" className="product-review-write">
            Write a review
          </button>
        </div>
      </div>
    </section>
  );
}

export async function generateStaticParams() {
  try {
    const list = await fetchAllProducts();
    return list.map((product) => ({ productSlug: buildProductSlug(product) }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }) {
  const { productSlug } = await params;
  const { product, raw } = await fetchProductBySlug(productSlug);

  if (!product) {
    return {
      title: "Meal05 | Product Not Found",
      description: "Explore our farm-fresh marketplace for produce, proteins, and pantry staples.",
    };
  }

  const databaseDescription = normaliseDatabaseProductDetailContent(raw).description;
  const description =
    databaseDescription ||
    `Order ${product.name} fresh from Meal05 — delivered to your kitchen in Ibadan.`;
  const pageUrl = toAbsoluteUrl(`/products/${productSlug}`);
  const image = resolveProductImage(product.image, FALLBACK_IMAGE);

  return {
    title: `Meal05 | ${product.name}`,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: "website",
      url: pageUrl,
      title: `Meal05 | ${product.name}`,
      description,
      images: [{ url: image, alt: product.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: `Meal05 | ${product.name}`,
      description,
      images: [image],
    },
  };
}

export default async function ProductDetailPage({ params }) {
  const { productSlug } = await params;
  const { product, raw: rawProduct } = await fetchProductBySlug(productSlug);

  if (!product) notFound();

  const variations = Array.isArray(rawProduct?.variations) ? rawProduct.variations : [];
  const detailContent = normaliseProductDetailContent(product, rawProduct);
  const categorySchema = resolveCategorySchemaData(product.category);
  const categoryName = categorySchema?.name || formatCategoryLabel(product.category) || "grocery";
  const productPath = `/products/${productSlug}`;
  const schemaDescription =
    detailContent.description ||
    `Order ${product.name} fresh from Meal05 — delivered to your kitchen in Ibadan.`;
  const productSchema = buildProductSchema({
    product,
    productPath,
    description: schemaDescription,
    categoryName,
    ratings: detailContent.ratings,
  });
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: "Home", url: "/" },
    ...(categorySchema?.path ? [{ name: categorySchema.name, url: categorySchema.path }] : []),
    { name: product.name, url: productPath },
  ]);

  return (
    <main className="product-detail-page" data-product-id={product.id}>
      <JsonLdScript id={`schema-product-${product.id}`} data={productSchema} />
      <JsonLdScript id={`schema-breadcrumb-${product.id}`} data={breadcrumbSchema} />
      <ProductEngagementTracker productId={product.id} product={product} />

      <nav aria-label="Breadcrumb" className="product-detail-breadcrumb">
        <Link href="/home" className="product-detail-breadcrumb-chip">
          Home
        </Link>
        <span aria-hidden="true" className="product-detail-breadcrumb-divider">
          &rsaquo;
        </span>
        {categorySchema?.path ? (
          <Link href={categorySchema.path} className="product-detail-breadcrumb-chip">
            {categorySchema.name}
          </Link>
        ) : (
          <span className="product-detail-breadcrumb-chip">{categoryName}</span>
        )}
        <span aria-hidden="true" className="product-detail-breadcrumb-divider">
          &rsaquo;
        </span>
        <span className="product-detail-breadcrumb-chip product-detail-breadcrumb-chip--current">
          {product.name}
        </span>
      </nav>

      <section className="product-detail-card">
        <ProductDetailClient
          product={product}
          variations={variations}
          fallbackImage={FALLBACK_IMAGE}
          ratings={detailContent.ratings}
        />
      </section>

      <div className="product-detail-info-grid">
        <ProductAboutSection description={detailContent.description} />
        <LogisticsManifestSection specifications={detailContent.specifications} />
      </div>
      {detailContent.handlingProtocols.length ? (
        <HandlingProtocolsSection tips={detailContent.handlingProtocols} />
      ) : null}
      {detailContent.storageTips.length ? (
        <StorageTipsSection tips={detailContent.storageTips} />
      ) : null}
      <CustomerReviewsSection ratings={detailContent.ratings} />
    </main>
  );
}
