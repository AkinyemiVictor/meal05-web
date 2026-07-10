import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import BundlePlanActions from "@/components/bundle-plan-actions";
import BundlePlanRatingSection from "@/components/bundle-plan-rating-section";
import { getBundlePlanBySlug } from "@/data/bundle-plans";
import {
  getBundlePlanPricingState,
  resolveBundlePlanIncludedProducts,
} from "@/lib/bundle-plans";
import { buildBundlePlanPageMetadata } from "@/lib/seo/metadata";

const DEFAULT_PACK_FEATURES = [
  "Curated combinations assembled for faster weekly shopping.",
  "Flexible substitutions when availability changes in-season.",
  "Fixed pack-level pricing to simplify checkout decisions.",
];

const createPackFeatures = (plan) => {
  if (Array.isArray(plan?.keyFeatures) && plan.keyFeatures.length) {
    return plan.keyFeatures
      .map((feature) => String(feature || "").trim())
      .filter(Boolean);
  }
  return DEFAULT_PACK_FEATURES;
};

const createPackSpecifications = (plan, resolvedItems) => [
  { label: "Pack ID", value: String(plan?.id || "N/A") },
  { label: "Plan type", value: "Curated pack plan" },
  {
    label: "Current items",
    value: resolvedItems.length
      ? `${resolvedItems.length} item${resolvedItems.length === 1 ? "" : "s"}`
      : "Updating soon",
  },
  { label: "Composition", value: "May adjust by offers and availability" },
];

const createPackGuideTips = (planName) => [
  `Review ${planName} item notes before checkout so substitutions remain acceptable.`,
  "Store perishables immediately after delivery to preserve freshness across the full pack.",
  "Batch-cook core items first, then stretch leftovers across 2 to 3 additional meals.",
];

const createPackFaqItems = (planName) => [
  {
    question: `Can ${planName} items change over time?`,
    answer:
      "Yes. Pack composition can change based on active offers and item availability while keeping the plan intent.",
  },
  {
    question: "Are these prices fixed at the pack level?",
    answer:
      "Yes. Each plan uses a pack-level price. Individual item totals are shown as compare-at guidance when available.",
  },
  {
    question: "Can I reorder this pack quickly later?",
    answer:
      "Yes. You can return to this page and add the same pack to cart again, including your selected quantity.",
  },
];

export async function generateMetadata({ params }) {
  const { planSlug } = (await params) || {};
  return buildBundlePlanPageMetadata(planSlug);
}

export default async function BundlePlanDetailPage({ params }) {
  notFound();
  const { planSlug } = (await params) || {};
  const plan = getBundlePlanBySlug(planSlug);

  if (!plan) {
    notFound();
  }

  const { resolvedItems } = resolveBundlePlanIncludedProducts(plan);
  const pricing = getBundlePlanPricingState(plan);
  const packFeatures = createPackFeatures(plan);
  const packSpecifications = createPackSpecifications(plan, resolvedItems);
  const packGuideTips = createPackGuideTips(plan.name);
  const packFaqItems = createPackFaqItems(plan.name);

  return (
    <main className="bundle-plan-page">
      <nav className="page-breadcrumb" aria-label="Breadcrumb">
        <Link href="/home">Home</Link>
        <span aria-hidden="true" className="page-breadcrumb-divider">
          /
        </span>
        <Link href="/section/bundle-plans">Bundle Plans</Link>
        <span aria-hidden="true" className="page-breadcrumb-divider">
          /
        </span>
        <span className="page-breadcrumb-current">{plan.name}</span>
      </nav>

      <section className="bundle-plan-page__card" aria-labelledby="bundle-plan-title">
        <div className="bundle-plan-page__media">
          <Image
            src={plan.image}
            alt={plan.name}
            width={360}
            height={240}
            sizes="(max-width: 768px) 100vw, 360px"
            priority
          />
        </div>
        <div className="bundle-plan-page__content">
          <h1 id="bundle-plan-title">{plan.name}</h1>
          <dl className="product-detail-meta bundle-plan-page__meta">
            <dt>Plan type</dt>
            <dd>Curated pack</dd>
            <dt>Pack ID</dt>
            <dd>{plan.id}</dd>
            <dt>Current items</dt>
            <dd>{resolvedItems.length ? resolvedItems.length : "Updating"}</dd>
          </dl>

          <section className="bundle-plan-page__section bundle-plan-page__section--price" aria-labelledby="bundle-plan-price-heading">
            <h2 id="bundle-plan-price-heading" className="bundle-plan-page__section-title">
              Pack price
            </h2>
            {pricing.isPending ? (
              <p className="bundle-plan-page__pending">Price coming soon.</p>
            ) : (
              <div className="bundle-plan-page__price" aria-live="polite">
                <p className="bundle-plan-page__price-main">{pricing.bundlePriceLabel}</p>
                {pricing.compareAtLabel ? (
                  <p className="bundle-plan-page__price-compare">
                    {pricing.compareAtLabel}/pack
                  </p>
                ) : null}
                {pricing.savingsLabel ? (
                  <p className="bundle-plan-page__price-saving">
                    You save {pricing.savingsLabel}
                  </p>
                ) : null}
              </div>
            )}
          </section>

          <BundlePlanActions plan={plan} />
        </div>
      </section>

      <section className="product-detail-section" aria-labelledby="bundle-plan-about-heading">
        <h2 id="bundle-plan-about-heading">About this pack</h2>
        <p>{plan.description}</p>
      </section>

      <section className="product-detail-section" aria-labelledby="bundle-plan-specifications-heading">
        <h2 id="bundle-plan-specifications-heading">Specifications</h2>
        <div className="product-specs">
          <div className="product-specs__features">
            <h3>Key features</h3>
            <ul>
              {packFeatures.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </div>
          <div className="product-specs__table">
            <h3>More info</h3>
            <dl>
              {packSpecifications.map((spec) => (
                <div key={spec.label} className="product-specs__row">
                  <dt>{spec.label}</dt>
                  <dd>{spec.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="product-detail-section" aria-labelledby="bundle-plan-items-heading">
        <h2 id="bundle-plan-items-heading">Present included items</h2>
        <p>{plan.compositionNotice}</p>
        {resolvedItems.length ? (
          <div className="bundle-plan-page__item-chips">
            {resolvedItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="bundle-plan-page__item-chip"
                aria-label={`View ${item.name}`}
              >
                {item.name}
              </Link>
            ))}
          </div>
        ) : (
          <p className="bundle-plan-page__pending">
            Current included items will be updated shortly.
          </p>
        )}
      </section>

      <section className="product-detail-section" aria-labelledby="bundle-plan-guide-heading">
        <h2 id="bundle-plan-guide-heading">Buying and storage guide</h2>
        <p>Use these quick tips to get the best value and freshness from this pack.</p>
        <ul className="product-buying-guide">
          {packGuideTips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </section>

      <section className="product-detail-section" aria-labelledby="bundle-plan-faq-heading">
        <h2 id="bundle-plan-faq-heading">Frequently asked questions</h2>
        <p>Common questions shoppers ask before choosing this pack plan.</p>
        <dl className="product-faq-list">
          {packFaqItems.map((item) => (
            <div key={item.question} className="product-faq-item">
              <dt>{item.question}</dt>
              <dd>{item.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <BundlePlanRatingSection planId={plan.id} planName={plan.name} />
    </main>
  );
}
