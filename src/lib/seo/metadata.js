import { toAbsoluteUrl } from "@/lib/seo/schema";
import { getBundlePlanBySlug } from "@/data/bundle-plans";

const SITE_NAME = "Meal05";
const DEFAULT_SOCIAL_IMAGE = "/assets/favicon/android-chrome-512x512.png";
const DEFAULT_SECTION_DESCRIPTION =
  "Discover curated Meal05 selections, from popular packs to seasonal produce and fresh new arrivals.";
const DEFAULT_BUNDLE_PLAN_DESCRIPTION =
  "Explore this Meal05 pack plan. Plan details and pricing are being prepared.";

const SECTION_METADATA = {
  popular: {
    title: "Popular Grocery Picks | Meal05 Best Sellers",
    description:
      "Browse Meal05 best sellers with popular produce, proteins, and pantry staples shoppers reorder most.",
    indexable: true,
  },
  new: {
    title: "New In Stock | Fresh Arrivals at Meal05",
    description:
      "Shop the newest products added to Meal05, including fresh produce and pantry essentials now in stock.",
    indexable: true,
  },
  "in-season": {
    title: "In-Season Produce | Meal05 Seasonal Picks",
    description:
      "Explore in-season fruits and vegetables at Meal05 for peak freshness, flavor, and value.",
    indexable: true,
  },
  "bundle-plans": {
    title: "Bundle Plans | Meal05 Fast Convenience Packs",
    description:
      "Shop Meal05 bundle plans for faster, convenient grocery purchases with curated combo packs.",
    indexable: true,
  },
  "recently-viewed": {
    title: "Recently Viewed Products | Meal05",
    description: "Revisit products you recently checked on Meal05 and add them to cart faster.",
    indexable: false,
  },
  "cross-sell": {
    title: "Suggested For You | Meal05",
    description: "Find complementary grocery picks curated to match items in your Meal05 cart.",
    indexable: false,
  },
};

export const INDEXABLE_SECTION_SLUGS = Object.entries(SECTION_METADATA)
  .filter(([, config]) => config?.indexable)
  .map(([slug]) => slug);

export const buildHomePageMetadata = () => {
  const title = "Meal05 Home | Fresh Groceries, Produce, and Pantry Delivery";
  const description =
    "Shop farm-fresh fruits, vegetables, proteins, and pantry staples with fast delivery from Meal05.";
  const canonicalPath = "/";
  const canonicalUrl = toAbsoluteUrl(canonicalPath);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      type: "website",
      url: canonicalUrl,
      siteName: SITE_NAME,
      title,
      description,
      images: [
        {
          url: DEFAULT_SOCIAL_IMAGE,
          width: 512,
          height: 512,
          alt: "Meal05 home",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_SOCIAL_IMAGE],
    },
  };
};

export const buildHelpCenterPageMetadata = () => {
  const title = "Meal05 Help Center | Orders, Delivery, Payments, and Returns";
  const description =
    "Find support articles for order tracking, payments, delivery, refunds, and account help on Meal05.";
  const canonicalPath = "/help-center";
  const canonicalUrl = toAbsoluteUrl(canonicalPath);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      type: "website",
      url: canonicalUrl,
      siteName: SITE_NAME,
      title,
      description,
      images: [
        {
          url: DEFAULT_SOCIAL_IMAGE,
          width: 512,
          height: 512,
          alt: "Meal05 help center",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_SOCIAL_IMAGE],
    },
  };
};

export const buildCategoryPageMetadata = (category) => {
  const title = category?.label
    ? `${category.label} | Meal05 Categories`
    : "Meal05 Categories | Fresh Groceries by Aisle";
  const description =
    category?.description || "Browse farm-fresh fruits, vegetables, proteins, and pantry staples by category.";
  const canonicalPath = category?.slug ? `/categories/${category.slug}` : "/categories";
  const canonicalUrl = toAbsoluteUrl(canonicalPath);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: "website",
      url: canonicalUrl,
      siteName: SITE_NAME,
      title,
      description,
      images: [
        {
          url: DEFAULT_SOCIAL_IMAGE,
          width: 512,
          height: 512,
          alt: `${SITE_NAME} category`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_SOCIAL_IMAGE],
    },
  };
};

export const buildSearchPageMetadata = () => {
  const title = "Search Meal05 Products | Find Fresh Groceries Fast";
  const description =
    "Search Meal05 for fresh produce, proteins, pantry staples, and everyday essentials.";
  const canonicalPath = "/search";
  const canonicalUrl = toAbsoluteUrl(canonicalPath);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    robots: {
      index: false,
      follow: true,
    },
    openGraph: {
      type: "website",
      url: canonicalUrl,
      siteName: SITE_NAME,
      title,
      description,
      images: [
        {
          url: DEFAULT_SOCIAL_IMAGE,
          width: 512,
          height: 512,
          alt: `${SITE_NAME} search`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_SOCIAL_IMAGE],
    },
  };
};

export const buildSectionPageMetadata = (slug) => {
  const safeSlug = String(slug || "").trim().toLowerCase();
  const sectionConfig = SECTION_METADATA[safeSlug] || null;
  const title = sectionConfig?.title || "Curated Shopping Sections | Meal05";
  const description = sectionConfig?.description || DEFAULT_SECTION_DESCRIPTION;
  const canonicalPath = safeSlug ? `/section/${safeSlug}` : "/section";
  const canonicalUrl = toAbsoluteUrl(canonicalPath);
  const shouldIndex = Boolean(sectionConfig?.indexable);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    robots: {
      index: shouldIndex,
      follow: true,
    },
    openGraph: {
      type: "website",
      url: canonicalUrl,
      siteName: SITE_NAME,
      title,
      description,
      images: [
        {
          url: DEFAULT_SOCIAL_IMAGE,
          width: 512,
          height: 512,
          alt: `${SITE_NAME} section`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_SOCIAL_IMAGE],
    },
  };
};

export const buildBundlePlanPageMetadata = (planSlug) => {
  const plan = getBundlePlanBySlug(planSlug);
  const canonicalPath = plan ? `/bundle-plans/${plan.slug}` : "/bundle-plans";
  const canonicalUrl = toAbsoluteUrl(canonicalPath);
  const title = plan
    ? `${plan.name} | Meal05 Pack Plan`
    : "Pack Plan | Meal05";
  const description = plan
    ? `${plan.description || `${plan.name} by Meal05.`} ${DEFAULT_BUNDLE_PLAN_DESCRIPTION}`
    : DEFAULT_BUNDLE_PLAN_DESCRIPTION;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    robots: {
      index: false,
      follow: true,
    },
    openGraph: {
      type: "website",
      url: canonicalUrl,
      siteName: SITE_NAME,
      title,
      description,
      images: [
        {
          url: DEFAULT_SOCIAL_IMAGE,
          width: 512,
          height: 512,
          alt: `${SITE_NAME} pack plan`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_SOCIAL_IMAGE],
    },
  };
};
