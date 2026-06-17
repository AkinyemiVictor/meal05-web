const BUNDLE_PLAN_DEFINITIONS = [
  {
    id: "bundle-smart-starter-pack",
    slug: "smart-starter-pack",
    name: "Smart Starter Pack",
    description:
      "A practical starter pack for small households and first-time weekly shoppers.",
    keyFeatures: [
      "Balanced mix of weekly staples for one to two people.",
      "Designed for fast breakfast, lunch, and dinner prep.",
      "A simple entry point for first-time Meal05 shoppers.",
    ],
  },
  {
    id: "bundle-family-essentials",
    slug: "family-essentials",
    name: "Family Essentials",
    description:
      "Everyday staples curated for family-size cooking across multiple meals.",
    keyFeatures: [
      "Core staples selected for daily family cooking.",
      "Sized to support batch prep and repeat meals.",
      "Helps reduce multiple small top-up shopping trips.",
    ],
  },
  {
    id: "bundle-family-soup-pack",
    slug: "family-soup-pack",
    name: "Family Soup Pack",
    description:
      "Soup-focused ingredients selected for rich, home-style family soup recipes.",
    keyFeatures: [
      "Soup-first combinations for rich, homestyle recipes.",
      "Includes commonly paired fresh and dry ingredients.",
      "Optimized for hearty family-sized servings.",
    ],
  },
  {
    id: "bundle-premium-kitchen",
    slug: "premium-kitchen",
    name: "Premium Kitchen",
    description:
      "An upgraded selection with premium kitchen staples for elevated home cooking.",
    keyFeatures: [
      "Upgraded staples curated for elevated home cooking.",
      "Great for hosting, entertaining, and weekend menus.",
      "Focused on quality, consistency, and convenience.",
    ],
  },
  {
    id: "bundle-value-saver-pack",
    slug: "value-saver-pack",
    name: "Value Saver Pack",
    description:
      "Budget-friendly combinations designed to maximize value without compromising quality.",
    keyFeatures: [
      "Value-focused combinations for weekly savings.",
      "Designed to lower basket cost without cutting quality.",
      "Built to stretch across multiple family meals.",
    ],
  },
];

export const BUNDLE_PLAN_IMAGE = "/assets/img/product-placeholder.svg";
export const BUNDLE_PLAN_COMPOSITION_NOTICE =
  "Items in this pack may change based on offers and availability. The products listed below are the present included items.";

export const BUNDLE_PLANS = BUNDLE_PLAN_DEFINITIONS.map((plan) => ({
  ...plan,
  image: BUNDLE_PLAN_IMAGE,
  ctaLabel: "View pack",
  compositionNotice: BUNDLE_PLAN_COMPOSITION_NOTICE,
  includedProductIds: [],
  bundlePriceNgn: null,
  compareAtPriceNgn: null,
}));

const BUNDLE_PLANS_BY_SLUG = new Map(
  BUNDLE_PLANS.map((plan) => [plan.slug, plan])
);

export const getBundlePlanBySlug = (slug) => {
  const safeSlug = String(slug || "").trim().toLowerCase();
  return BUNDLE_PLANS_BY_SLUG.get(safeSlug) || null;
};

export default BUNDLE_PLANS;
