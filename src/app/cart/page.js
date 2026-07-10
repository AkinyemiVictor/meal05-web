"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "./cart.module.css";

import CategoryCarouselSkeleton from "@/components/category-carousel-skeleton";
import PageBreadcrumbs from "@/components/page-breadcrumbs";
import ProductCard from "@/components/product-card";
import copy from "@/data/copy";
import useProducts from "@/lib/use-products";
import categories, { getCategoryHref } from "@/data/categories";
import {
  pickMostPopularProducts,
} from "@/lib/catalogue";
import { pickTopEngagedProducts, RECENTLY_VIEWED_KEY } from "@/lib/engagement";

import { readCartItems, writeCartItems } from "@/lib/cart-storage";
import { readStoredUser, AUTH_EVENT } from "@/lib/auth";
import { buildSignInHref } from "@/lib/auth-redirect";
import { trackBeginCheckout } from "@/lib/analytics";
import { resolveProductImage } from "@/lib/product-image";
import {
  applyStoredPromoToSummary,
  clearStoredPromo,
  readStoredPromo,
  writeStoredPromo,
} from "@/lib/checkout";
import { computeOrderSummary } from "@/lib/order-pricing";
import { requestPromoCodeValidation } from "@/lib/promo-code-client";
import { getDeliverySummaryConfig } from "@/lib/delivery-settings";
import useDeliverySettings from "@/lib/use-delivery-settings";

const CategoryCarousel = dynamic(() => import("@/components/category-carousel"), {
  loading: () => <CategoryCarouselSkeleton />,
});
const QuickAddDrawer = dynamic(() => import("@/components/quick-add-drawer"), {
  ssr: false,
});

const RECENTLY_VIEWED_STORAGE_KEY = RECENTLY_VIEWED_KEY;
const RECENTLY_VIEWED_LIMIT = 6;
const MIN_ORDER_SIZE = 1;
const ORDER_COUNT_STEP = 1;

const normaliseOrderSize = (value, fallback = MIN_ORDER_SIZE) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.max(MIN_ORDER_SIZE, Math.round(numeric));
};

const normaliseOrderCount = (value, fallback = 1) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.max(1, Math.round(numeric));
};

const computeQuantity = (orderSize, orderCount) => orderSize * orderCount;

const formatOrderSize = (value) => {
  const size = normaliseOrderSize(value, 0);
  if (!size) return "0";
  return size.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

const formatOrderCount = (value) => {
  const count = normaliseOrderCount(value, 0);
  return count.toLocaleString();
};

const hydrateCartItem = (item) => {
  if (!item || typeof item !== "object") return null;
  const draft = { ...item };
  const productId = draft.productId || draft.id;
  const variantId = draft.variantId || null;
  const lineId = variantId || draft.id || productId;
  const storedCount = normaliseOrderCount(draft.orderCount ?? 0, 1);
  const fallbackCount = normaliseOrderCount(draft.quantity ?? 0, 0);
  const derivedCount = normaliseOrderCount(storedCount > 0 ? storedCount : fallbackCount, 1);
  const orderSize = MIN_ORDER_SIZE;
  const quantity = computeQuantity(orderSize, derivedCount);

  return {
    ...draft,
    id: lineId,
    productId,
    variantId,
    orderSize,
    orderCount: derivedCount,
    quantity,
  };
};

const hydrateCartItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map(hydrateCartItem).filter(Boolean);
};

const getCartItemsSignature = (items) => {
  if (!Array.isArray(items) || items.length === 0) return "[]";
  try {
    return JSON.stringify(items);
  } catch {
    return String(items.length);
  }
};

const pickDefaultVariant = (variations) => {
  if (!Array.isArray(variations) || variations.length === 0) return null;
  const explicit = variations.find((v) => v && v.is_default === true);
  if (explicit) return explicit;
  const withPrice = variations
    .filter((v) => v && v.price != null && Number.isFinite(Number(v.price)))
    .sort((a, b) => Number(a.price) - Number(b.price));
  if (withPrice.length) return withPrice[0];
  return variations[0] || null;
};

const readCartFromStorage = () => hydrateCartItems(readCartItems());

const CATEGORY_CARDS = categories.map((category) => ({
  slug: category.slug,
  label: category.label,
  icon: category.icon,
  href: getCategoryHref(category),
}));
const CATEGORY_LABELS = new Map(categories.map((category) => [category.slug, category.label]));

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

function CartProductSection({ title, eyebrow, ctaLabel = "See all", ctaHref, headingId, variant = "plain", children }) {
  const sectionClasses = ["home-section", styles.productSection];
  if (variant && variant !== "plain") {
    sectionClasses.push(`home-section--${variant}`);
  }

  return (
    <section className={sectionClasses.join(" ")} aria-labelledby={headingId}>
      <div className="home-section__inner">
        <header className="home-section__header">
          <div className="home-section__titles">
            {eyebrow ? <span className="home-section__eyebrow">{eyebrow}</span> : null}
            <h2 className="home-section__title" id={headingId}>
              {title}
            </h2>
          </div>
          {ctaHref ? (
            <Link href={ctaHref} className="home-section__cta">
              {ctaLabel}
            </Link>
          ) : (
            <button type="button" className="home-section__cta">{ctaLabel}</button>
          )}
        </header>

        <div className="home-section__rail">
          <div className="home-section__viewport">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function CartPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { ordered: catalogueList, index: productIndex } = useProducts();
  const { settings: deliverySettings } = useDeliverySettings();
  // Prevent hydration mismatches by deferring client-only computations
  // (like reading localStorage-driven engagement) until after mount.
  const [isClient, setIsClient] = useState(false);

  const [cartItems, setCartItems] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [promoInput, setPromoInput] = useState(() => {
    if (typeof window === "undefined") return "";
    return String(readStoredPromo()?.promo?.code || readStoredPromo()?.code || "").trim();
  });
  const [promoMessage, setPromoMessage] = useState({ text: "", tone: "neutral" });
  const [activePromo, setActivePromo] = useState(() => (typeof window !== "undefined" ? readStoredPromo() : null));
  const [promoBusy, setPromoBusy] = useState(false);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [quickAddProduct, setQuickAddProduct] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddAnchorRect, setQuickAddAnchorRect] = useState(null);
  const [quickAddAnchorEl, setQuickAddAnchorEl] = useState(null);
  const cartEventSourceRef = useRef(Symbol("cart-page"));
  const defaultVariantCacheRef = useRef(new Map());
  const cartReturnPath = useMemo(() => {
    const base = pathname || "/cart";
    const query = searchParams?.toString();
    return query ? `${base}?${query}` : base;
  }, [pathname, searchParams]);
  const signInRedirectHref = useMemo(
    () => buildSignInHref({ tab: "login", next: cartReturnPath, hash: "loginForm" }),
    [cartReturnPath]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const history = (() => {
      try {
        const stored = window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed.map((id) => String(id)) : [];
      } catch (error) {
        console.warn("Unable to read recently viewed history", error);
        return [];
      }
    })();

    const uniqueHistory = history.filter((id, index) => history.indexOf(id) === index);
    const picked = [];

    uniqueHistory.forEach((id) => {
      if (picked.length >= RECENTLY_VIEWED_LIMIT) return;
      const product = productIndex.get(String(id));
      if (product) picked.push(product);
    });

    setRecentlyViewed(picked.slice(0, RECENTLY_VIEWED_LIMIT));
  }, [catalogueList, productIndex]);

  const handleQuickAddClose = () => {
    setQuickAddOpen(false);
    setQuickAddProduct(null);
    setQuickAddAnchorRect(null);
    setQuickAddAnchorEl(null);
  };

  const handleQuickAdd = (product, anchorEl) => {
    if (!product) return;
    if (quickAddOpen && quickAddProduct?.id === product.id) {
      handleQuickAddClose();
      return;
    }
    const rect = anchorEl?.getBoundingClientRect ? anchorEl.getBoundingClientRect() : null;
    setQuickAddAnchorEl(anchorEl || null);
    setQuickAddAnchorRect(rect);
    setQuickAddProduct(product);
    setQuickAddOpen(true);
  };

  useEffect(() => {
    if (!quickAddOpen || !quickAddAnchorEl?.getBoundingClientRect) return;
    const updateAnchor = () => {
      try {
        setQuickAddAnchorRect(quickAddAnchorEl.getBoundingClientRect());
      } catch {
        setQuickAddAnchorRect(null);
      }
    };
    updateAnchor();
    window.addEventListener("scroll", updateAnchor, true);
    window.addEventListener("resize", updateAnchor);
    return () => {
      window.removeEventListener("scroll", updateAnchor, true);
      window.removeEventListener("resize", updateAnchor);
    };
  }, [quickAddOpen, quickAddAnchorEl]);

  const persistCart = useCallback((items) => {
    try {
      const normalised = hydrateCartItems(items);
      writeCartItems(normalised, undefined, { source: cartEventSourceRef.current });
    } catch (error) {
      console.warn("Unable to persist cart", error);
    }
  }, []);

  const resolveDefaultVariant = useCallback(
    async (productId) => {
      const cache = defaultVariantCacheRef.current;
      const key = String(productId || "");
      if (!key) return null;
      if (cache.has(key)) {
        const cached = cache.get(key);
        if (cached instanceof Promise) return cached.catch(() => null);
        return cached;
      }
      const promise = (async () => {
        try {
          const res = await fetch(`/api/products/${key}`);
          if (!res.ok) return null;
          const json = await res.json();
          const variations = Array.isArray(json?.variations) ? json.variations : [];
          return pickDefaultVariant(variations);
        } catch {
          return null;
        }
      })();
      cache.set(key, promise);
      const result = await promise;
      cache.set(key, result);
      return result;
    },
    []
  );

  const upgradeLegacyCartItems = useCallback(
    async (items) => {
      if (!Array.isArray(items) || !items.some((item) => item && !item.variantId)) {
        return;
      }

      const upgraded = await Promise.all(
        items.map(async (item) => {
          if (!item || item.variantId) return item;
          const productId = item.productId || item.id;
          if (!productId) return item;
          const variant = await resolveDefaultVariant(productId);
          if (!variant) return item;
          const variantId = variant.variationId || variant.id;
          if (!variantId) return item;
          return {
            ...item,
            id: variantId,
            productId,
            variantId,
            variantName: variant.name || variant.ripeness || variant.size || variant.packaging,
            price: variant.price ?? item.price,
            unit: variant.unit || item.unit,
            stock: variant.stock ?? item.stock,
            image: resolveProductImage(variant.image, item.image),
          };
        })
      );

      setCartItems(upgraded);
      persistCart(upgraded);
    },
    [persistCart, resolveDefaultVariant]
  );

  useEffect(() => {
    const updateCart = (event) => {
      if (event?.type === "cart-updated") {
        const source = event instanceof CustomEvent ? event.detail?.source : undefined;
        if (source === cartEventSourceRef.current) {
          return;
        }
      }

      const next = readCartFromStorage();
      setCartItems((current) =>
        getCartItemsSignature(current) === getCartItemsSignature(next) ? current : next
      );
      setHydrated(true);
      upgradeLegacyCartItems(next);
    };

    updateCart();

    if (typeof window === "undefined") {
      return undefined;
    }
    setIsClient(true);

    window.addEventListener("storage", updateCart);
    window.addEventListener("cart-updated", updateCart);

    return () => {
      window.removeEventListener("storage", updateCart);
      window.removeEventListener("cart-updated", updateCart);
    };
  }, [upgradeLegacyCartItems]);

  // Optional: hydrate cart from backend (Supabase-based API)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!readStoredUser()) return;
    const controller = new AbortController();
    fetch(`/api/cart`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(() => {
        // This endpoint returns rows in Supabase shape.
        // Leaving local cart as source of truth for now unless product mapping is added.
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Track auth state so we can gate checkout when not signed in
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Initial read
    setCurrentUser(readStoredUser());

    const onAuthChanged = (evt) => {
      try {
        const user = evt?.detail?.user ?? readStoredUser();
        setCurrentUser(user || null);
      } catch (_) {
        setCurrentUser(readStoredUser());
      }
    };
    window.addEventListener(AUTH_EVENT, onAuthChanged);
    return () => window.removeEventListener(AUTH_EVENT, onAuthChanged);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    persistCart(cartItems);
  }, [cartItems, hydrated, persistCart]);

  const cartIdSet = useMemo(
    () => new Set(cartItems.map((item) => String(item.productId || item.id))),
    [cartItems]
  );

  const cartCategories = useMemo(() => {
    const cats = new Set();
    for (const item of cartItems) {
      const prod = productIndex.get(String(item.productId || item.id));
      if (prod?.category) cats.add(prod.category);
    }
    return cats;
  }, [cartItems, productIndex]);

  const crossSellProducts = useMemo(() => {
    const pool = catalogueList.filter((p) => !cartIdSet.has(p.id));
    let base = isClient ? pickTopEngagedProducts(pool, 12) : [];
    if (!base.length) {
      base = pickMostPopularProducts(pool, new Set(), 12);
    }
    base.sort((a, b) => {
      const aBoost = cartCategories.has(a.category) ? 1 : 0;
      const bBoost = cartCategories.has(b.category) ? 1 : 0;
      if (aBoost !== bBoost) return bBoost - aBoost;
      return a.name.localeCompare(b.name);
    });
    return base.slice(0, 6);
  }, [catalogueList, cartIdSet, cartCategories, isClient]);

  const stockStatus = useMemo(() => {
    const statuses = cartItems.map((item) => {
      const product = productIndex.get(String(item.productId || item.id));
      const stockLabel = product?.stock ?? item.stock ?? "";
      const normalised = String(stockLabel).toLowerCase();
      let level = "ok";
      let message = "";
      const variantMissing = !item.variantId;

      if (!product) {
        level = "error";
        message = copy.cart.unavailableMessage;
      } else if (normalised.includes("out") || normalised.includes("sold")) {
        level = "error";
        message = copy.cart.unavailableMessage;
      } else if (variantMissing) {
        level = "warning";
        message = "Select a specific option for this item to continue.";
      } else if (normalised.includes("limited") || normalised.includes("low")) {
        level = "warning";
        message = copy.cart.limitedMessage;
      }

      return {
        id: item.id,
        stockLabel: stockLabel || "In stock",
        level,
        message,
      };
    });

    return {
      map: new Map(statuses.map((status) => [status.id, status])),
      hasError: statuses.some((status) => status.level === "error"),
      hasWarning: statuses.some((status) => status.level === "warning"),
    };
  }, [cartItems, productIndex]);

  const hasCheckoutBlocker = stockStatus.hasError;
  const deliverySummaryConfig = useMemo(() => getDeliverySummaryConfig(deliverySettings), [deliverySettings]);
  const pricingItems = useMemo(
    () =>
      cartItems.map((item) => {
        const product = productIndex.get(String(item.productId || item.id || ""));
        return {
          ...item,
          category: item.category || product?.category || "",
          categorySlug: item.categorySlug || product?.categorySlug || "",
          packaging: item.packaging || product?.packaging || "",
        };
      }),
    [cartItems, productIndex]
  );
  const baseSummary = useMemo(
    () =>
      computeOrderSummary(pricingItems, deliverySummaryConfig),
    [pricingItems, deliverySummaryConfig]
  );

  const summary = useMemo(() => {
    const merged = applyStoredPromoToSummary(baseSummary, activePromo);
    return {
      ...merged,
      packaging: merged.packagingFee,
      discount: merged.discountTotal,
      delivery: merged.deliveryFee,
    };
  }, [activePromo, baseSummary]);

  const setPromoFeedback = useCallback((text, tone = "neutral") => {
    setPromoMessage({ text, tone });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!cartItems.length) {
      setActivePromo(null);
      clearStoredPromo();
      return;
    }

    const code = String(activePromo?.promo?.code || activePromo?.code || "").trim();
    if (!code) return;

    const controller = new AbortController();
    const run = async () => {
      try {
        const result = await requestPromoCodeValidation({
          code,
          subtotal: baseSummary.subtotal,
          itemsCount: baseSummary.itemsCount,
          deliveryFee: baseSummary.deliveryFee,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (!result.ok) {
          setActivePromo(null);
          clearStoredPromo();
          setPromoFeedback(result.payload?.error || "This promo code no longer applies to the current cart.", "error");
          return;
        }

        const nextPromo = {
          code,
          promo: result.payload?.promo || null,
          message: result.payload?.message || "",
          totals: result.payload?.totals || null,
          validatedAt: new Date().toISOString(),
        };
        setActivePromo(nextPromo);
        writeStoredPromo(nextPromo);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn("Unable to refresh promo", error);
      }
    };

    run();
    return () => controller.abort();
  }, [activePromo?.code, activePromo?.promo?.code, baseSummary.deliveryFee, baseSummary.itemsCount, baseSummary.subtotal, cartItems.length, hydrated, setPromoFeedback]);

  const handleQtyChange = useCallback((id, delta) => {
  setCartItems((prev) =>
    prev.map((item) => {
      if (item.id !== id) return item;
      const orderSize = normaliseOrderSize(item.orderSize, MIN_ORDER_SIZE);
      const currentCount = normaliseOrderCount(item.orderCount, 1);
      const nextCount = Math.max(currentCount + delta, 1);
      return {
        ...item,
        orderSize,
        orderCount: nextCount,
        quantity: computeQuantity(orderSize, nextCount),
      };
    })
  );
}, []);

  const handleRemove = useCallback((id) => {
    setCartItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleApplyPromo = useCallback(async () => {
    const code = promoInput.trim().toUpperCase();

    if (!code) {
      setActivePromo(null);
      clearStoredPromo();
      setPromoFeedback("Enter a promo code to apply a discount.");
      return;
    }

    if (!baseSummary.itemsCount || baseSummary.subtotal <= 0) {
      setActivePromo(null);
      clearStoredPromo();
      setPromoFeedback("Add items to your cart before applying a promo code.", "error");
      return;
    }

    setPromoBusy(true);
    try {
      const result = await requestPromoCodeValidation({
        code,
        subtotal: baseSummary.subtotal,
        itemsCount: baseSummary.itemsCount,
        deliveryFee: baseSummary.deliveryFee,
      });

      if (!result.ok) {
        setActivePromo(null);
        clearStoredPromo();
        setPromoFeedback(result.payload?.error || "That promo code could not be applied.", "error");
        return;
      }

      const nextPromo = {
        code,
        promo: result.payload?.promo || null,
        message: result.payload?.message || "",
        totals: result.payload?.totals || null,
        validatedAt: new Date().toISOString(),
      };
      setActivePromo(nextPromo);
      writeStoredPromo(nextPromo);
      setPromoFeedback(nextPromo.message || "Discount applied.", "success");
    } catch (error) {
      console.warn("Promo validation failed", error);
      setPromoFeedback("Network error. Try again.", "error");
    } finally {
      setPromoBusy(false);
    }
  }, [baseSummary.deliveryFee, baseSummary.itemsCount, baseSummary.subtotal, promoInput, setPromoFeedback]);

  const handleCheckout = useCallback(() => {
    if (!cartItems.length || hasCheckoutBlocker) {
      return;
    }

    trackBeginCheckout(cartItems, {
      value: summary.total,
      coupon: activePromo?.code || "",
    });

    const user = readStoredUser();
    if (!user) {
      // No prompt — go straight to sign-in
      persistCart(cartItems);
      router.push(signInRedirectHref);
      return;
    }

    persistCart(cartItems);
    router.push("/checkout");
  }, [activePromo?.code, cartItems, hasCheckoutBlocker, persistCart, router, signInRedirectHref, summary.total]);

  const promoToneClass = useMemo(() => {
    switch (promoMessage.tone) {
      case "success":
        return styles.promoMessageSuccess;
      case "error":
        return styles.promoMessageError;
      default:
        return styles.promoMessageNeutral;
    }
  }, [promoMessage.tone]);

  const totalOrderCount = normaliseOrderCount(summary.itemsCount, 0);
  const formattedItemsCount = formatOrderCount(totalOrderCount);
  const itemLabel = totalOrderCount === 1 ? "item" : "items";
  const cartIsEmpty = cartItems.length === 0;

  return (
    <>
    <div className={styles.page}>

      <div className={styles.pageInner}>
        <PageBreadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Cart" },
          ]}
        />

        <div className={styles.cartLayout}>
          <section className={styles.cartBoard} aria-labelledby="cart-title">
            <header className={styles.cartHeader}>
              <div className={styles.cartTitleGroup}>
                <p className={styles.cartSubtitle}>Your Basket</p>
                <h1 id="cart-title" className={styles.cartTitle}>
                  Shopping Cart
                </h1>
              </div>
              <span className={styles.cartTag}>
                {formattedItemsCount} {itemLabel} · ready for delivery
              </span>
            </header>

            <div className={styles.cartMain}>
              {cartIsEmpty ? (
                <div className={styles.placeholderCard}>
                  {copy.cart.emptyMessage}
                </div>
              ) : (
                cartItems.map((item) => {
                  const product = productIndex.get(String(item.productId || item.id));
                  const status = stockStatus.map.get(item.id);
                  const orderSize = normaliseOrderSize(item.orderSize, MIN_ORDER_SIZE);
                  const orderCount = normaliseOrderCount(item.orderCount, 1);
                  const quantity = computeQuantity(orderSize, orderCount);
                  const price = Number(item.price) || 0;
                  const lineTotal = price * quantity;
                  const productCategory = product?.category || item.category || "";
                  const categoryLabel = CATEGORY_LABELS.get(productCategory) || productCategory || "Produce";
                  const unitLabel = item.unit ? String(item.unit).replace(/^per\s+/i, "") : "";
                  const priceLabel = unitLabel ? `${formatCurrency(price)}/${unitLabel}` : formatCurrency(price);
                  const oldPrice = Number(product?.oldPrice || item.oldPrice || 0);
                  const hasOldPrice = oldPrice > price;
                  const lineClassNames = [styles.cartLine];
                  if (status?.level === "error") {
                    lineClassNames.push(styles.cartLineUnavailable);
                  } else if (status?.level === "warning") {
                    lineClassNames.push(styles.cartLineWarning);
                  }

                  return (
                    <article key={item.id} className={lineClassNames.join(" ")}>
                      <div className={styles.cartThumbnail}>
                        <Image
                          src={resolveProductImage(item.image)}
                          alt={item.name}
                          width={96}
                          height={96}
                          sizes="96px"
                          loading="lazy"
                        />
                      </div>
                      <div className={styles.cartInfo}>
                        <span className={styles.cartCategory}>{categoryLabel}</span>
                        <h3>{item.name}</h3>
                        <div className={styles.cartPriceRow}>
                          <span className={styles.cartPrice}>{priceLabel}</span>
                          {hasOldPrice ? <span className={styles.cartOldPrice}>{formatCurrency(oldPrice)}</span> : null}
                        </div>
                        {status?.message ? (
                          <p
                            className={`${styles.cartWarning} ${status.level === "error" ? styles.cartWarningAlert : ""}`.trim()}
                            role={status.level === "error" ? "alert" : "status"}
                          >
                            {status.message}
                          </p>
                        ) : null}
                        {item.note ? <small>{item.note}</small> : null}
                      </div>
                      <div className={styles.cartControls}>
                        <div className={styles.qtyControl}>
                          <button
                            type="button"
                            className={styles.qtyButton}
                            onClick={() => handleQtyChange(item.id, -ORDER_COUNT_STEP)}
                            aria-label={`Decrease order count for ${item.name}`}
                          >
                            -
                          </button>
                          <span className={styles.qtyValue}>
                            <span className={styles.qtyNumber}>{formatOrderCount(orderCount)}</span>
                          </span>
                          <button
                            type="button"
                            className={styles.qtyButton}
                            onClick={() => handleQtyChange(item.id, ORDER_COUNT_STEP)}
                            aria-label={`Increase order count for ${item.name}`}
                          >
                            +
                          </button>
                        </div>
                        <div className={styles.cartControlsMeta}>
                          <div className={styles.cartLineSummary}>
                            <span className={styles.cartLineTotal}>{formatCurrency(lineTotal)}</span>
                          </div>
                          <button
                            type="button"
                            className={styles.removeButton}
                            onClick={() => handleRemove(item.id)}
                          >
                            <i className="fa-regular fa-circle-xmark" aria-hidden="true"></i>
                            Remove
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

          </section>

          <aside className={styles.summaryCard} aria-labelledby="summary-heading">
            <div className={styles.summaryHeader}>
              <h2 id="summary-heading">Order summary</h2>
            </div>
            <div className={styles.summaryBlock}>
              <div className={styles.promoGroup}>
                <input
                  id="promo-code"
                  className={styles.promoInput}
                  value={promoInput}
                  onChange={(event) => setPromoInput(event.target.value)}
                  placeholder="Promo code"
                  aria-label="Promo code"
                />
                <button type="button" className={styles.promoApply} onClick={handleApplyPromo} disabled={promoBusy}>
                  {promoBusy ? "Checking..." : "Apply"}
                </button>
              </div>
              {promoMessage.text ? (
                <p className={`${styles.promoMessage} ${promoToneClass}`.trim()} aria-live="polite">
                  {promoMessage.text}
                </p>
              ) : null}
            </div>
            <div className={styles.summaryRows}>
              <div className={styles.summaryRow}>
                <span>Subtotal</span>
                <span>{formatCurrency(summary.subtotal)}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Packaging fee</span>
                <span>{summary.packaging === 0 ? "Free" : formatCurrency(summary.packaging)}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Delivery fee</span>
                <span>{formatCurrency(summary.delivery)}</span>
              </div>
              {summary.discount > 0 ? (
                <div className={`${styles.summaryRow} ${styles.summaryRowSavings}`.trim()}>
                  <span><i className="fa-solid fa-tag" aria-hidden="true"></i> Savings</span>
                  <span>-{formatCurrency(summary.discount)}</span>
                </div>
              ) : null}
              <div className={`${styles.summaryRow} ${styles.summaryRowStrong}`.trim()}>
                <span>Total</span>
                <span>{formatCurrency(summary.total)}</span>
              </div>
            </div>

            {stockStatus.hasError ? (
              <p className={`${styles.summaryAlert} ${styles.summaryAlertError}`.trim()} role="alert">
                {copy.cart.removeUnavailableMessage}
              </p>
            ) : null}
            {!stockStatus.hasError && stockStatus.hasWarning ? (
              <p className={styles.summaryAlert} role="status">
                {copy.cart.limitedNotice}
              </p>
            ) : null}

            <button
              type="button"
              className={styles.checkoutButton}
              onClick={handleCheckout}
              disabled={cartIsEmpty || hasCheckoutBlocker}
            >
              Checkout <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </button>
            <p className={styles.summaryHint}>
              <i className="fa-solid fa-lock" aria-hidden="true"></i> Secure checkout · Free returns within 24h
            </p>
          </aside>
        </div>
      </div>

      {recentlyViewed.length ? (
        <CartProductSection title={copy.cart.recentlyViewedTitle} eyebrow={copy.cart.recentlyViewedEyebrow} headingId="recently-heading" ctaHref="/section/recently-viewed">
          <div className={styles.productRailGrid} id="cartRecentlyViewedGrid">
            {recentlyViewed.map((product) => (
              <div key={product.variantId || product.id} className={styles.productCardShell}>
                <ProductCard product={product} onQuickAdd={handleQuickAdd} />
              </div>
            ))}
          </div>
        </CartProductSection>
      ) : null}

      {crossSellProducts.length ? (
        <CartProductSection title={copy.cart.crossSellTitle} eyebrow={copy.cart.crossSellEyebrow} headingId="crossSell-heading" ctaHref="/section/cross-sell">
          <div className={styles.productRailGrid} id="cartCrossSellGrid">
            {crossSellProducts.map((product) => (
              <div key={product.variantId || product.id} className={styles.productCardShell}>
                <ProductCard product={product} onQuickAdd={handleQuickAdd} />
              </div>
            ))}
          </div>
        </CartProductSection>
      ) : null}

      {/* Category aisle */}
      <CategoryCarousel
        cards={CATEGORY_CARDS}
        heading="Browse categories"
        eyebrow="Shop by aisle"
        className="category-carousel--compact"
      />
    </div>
    {quickAddProduct ? (
      <QuickAddDrawer
        product={quickAddProduct}
        isOpen={quickAddOpen}
        onClose={handleQuickAddClose}
        variant="dropdown"
        anchorRect={quickAddAnchorRect}
        anchorEl={quickAddAnchorEl}
      />
    ) : null}
  </>
  );
}

export default function CartPage() {
  return (
    <Suspense fallback={<main className={styles.cartPage}>Loading cart...</main>}>
      <CartPageContent />
    </Suspense>
  );
}
