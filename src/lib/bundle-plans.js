import { getProductById, getProductHref } from "@/lib/products";
import { formatMoney } from "@/lib/region";

const toPositiveAmount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
};

const toProductIds = (value) => {
  if (!Array.isArray(value)) return [];
  const dedup = new Set();
  value.forEach((entry) => {
    const numeric = Number(entry);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    dedup.add(Math.round(numeric));
  });
  return Array.from(dedup);
};

export const formatBundlePriceNgn = (value) => {
  const amount = toPositiveAmount(value);
  if (amount == null) return "";
  return formatMoney(amount);
};

export const resolveBundlePlanIncludedProducts = (plan) => {
  const ids = toProductIds(plan?.includedProductIds);
  const resolvedItems = [];
  const unresolvedIds = [];

  ids.forEach((id) => {
    const product = getProductById(id);
    if (!product) {
      unresolvedIds.push(id);
      return;
    }
    resolvedItems.push({
      id: Number(id),
      name: product.name || "Product",
      href: getProductHref(product),
      unitPriceNgn: Number(product.price) || 0,
    });
  });

  return {
    resolvedItems,
    unresolvedIds,
  };
};

export const getBundlePlanPricingState = (plan) => {
  const bundlePrice = toPositiveAmount(plan?.bundlePriceNgn);
  const explicitCompareAt = toPositiveAmount(plan?.compareAtPriceNgn);
  const { resolvedItems } = resolveBundlePlanIncludedProducts(plan);
  const inferredCompareAt = resolvedItems.reduce((sum, item) => {
    const amount = Number(item?.unitPriceNgn);
    if (!Number.isFinite(amount) || amount <= 0) return sum;
    return sum + amount;
  }, 0);
  const compareAt = inferredCompareAt > 0 ? inferredCompareAt : explicitCompareAt;
  const compareAtLabel = compareAt ? formatMoney(compareAt) : "";

  if (bundlePrice == null) {
    return {
      isPending: true,
      bundlePriceLabel: "",
      compareAtLabel,
      savingsLabel: "",
      savingsAmountNgn: 0,
      individualTotalLabel: compareAtLabel,
      individualTotalNgn: compareAt || 0,
    };
  }

  const hasCompareAt = compareAt != null && compareAt > bundlePrice;
  const savings = hasCompareAt ? compareAt - bundlePrice : null;

  return {
    isPending: false,
    bundlePriceLabel: formatMoney(bundlePrice),
    compareAtLabel,
    savingsLabel: savings ? formatMoney(savings) : "",
    savingsAmountNgn: savings || 0,
    individualTotalLabel: compareAtLabel,
    individualTotalNgn: compareAt || 0,
  };
};
