"use client";


const CLICKS_KEY = "meal05_click_counts";
export const RECENTLY_VIEWED_KEY = "meal05_recently_viewed";

const safeParse = (raw) => {
  try {
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
};

export const recordProductClick = (productId) => {
  if (typeof window === "undefined") return;
  const key = String(productId || "");
  if (!key) return;
  try {
    const current = safeParse(window.localStorage.getItem(CLICKS_KEY));
    current[key] = (Number(current[key]) || 0) + 1;
    window.localStorage.setItem(CLICKS_KEY, JSON.stringify(current));
  } catch {}
};

export const readClickCounts = () => {
  if (typeof window === "undefined") return {};
  return safeParse(window.localStorage.getItem(CLICKS_KEY));
};

export const recordProductView = (productId, max = 32) => {
  if (typeof window === "undefined") return;
  const id = String(productId || "");
  if (!id) return;
  try {
    const raw = window.localStorage.getItem(RECENTLY_VIEWED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(list) ? list.map(String) : [];
    const without = arr.filter((x) => x !== id);
    without.unshift(id);
    const trimmed = without.slice(0, max);
    window.localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(trimmed));
  } catch {}
};

export const readPurchaseCounts = () => {
  // Aggregate purchase quantities from the current user's local orders
  const totals = {};
  try {
    const orders = [];
    for (const order of orders) {
      const items = Array.isArray(order?.items) ? order.items : [];
      for (const item of items) {
        const id = String(item?.id ?? item?.productId ?? "");
        if (!id) continue;
        const qty = Number(item?.quantity ?? item?.orderCount ?? item?.orderSize ?? 1) || 1;
        totals[id] = (Number(totals[id]) || 0) + qty;
      }
    }
  } catch {}
  return totals;
};

export const pickMostPurchasedProducts = (list, limit = 6) => {
  const purchases = readPurchaseCounts();

  const purchased = list
    .map((product) => ({
      product,
      count: Number(purchases[String(product?.id)]) || 0,
    }))
    .filter((entry) => entry.count > 0);

  if (!purchased.length) return [];

  return purchased
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.product.name.localeCompare(b.product.name);
    })
    .slice(0, limit)
    .map((entry) => entry.product);
};

export const pickTopEngagedProducts = (list, limit = 6) => {
  const clicks = readClickCounts();
  const purchases = readPurchaseCounts();

  const scored = list.map((product) => {
    const id = String(product.id);
    const clickScore = Number(clicks[id]) || 0;
    const purchaseScore = Number(purchases[id]) || 0;
    // Weight purchases higher than clicks
    const score = purchaseScore * 3 + clickScore;
    return { product, score };
  });

  // If no engagement, return an empty array (caller can fallback)
  const any = scored.some((s) => s.score > 0);
  if (!any) return [];

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.product.name.localeCompare(b.product.name);
    })
    .slice(0, limit)
    .map((s) => s.product);
};

const engagement = {
  recordProductClick,
  readClickCounts,
  readPurchaseCounts,
  pickMostPurchasedProducts,
  pickTopEngagedProducts,
};

export default engagement;
