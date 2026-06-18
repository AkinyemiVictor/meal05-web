"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconBasketCheck,
  IconChefHat,
  IconClock,
  IconFlame,
  IconHome,
  IconLayoutGrid,
  IconLeaf,
  IconMapPin,
  IconPackage,
  IconShoppingBag,
  IconShoppingCart,
  IconUser,
} from "@tabler/icons-react";
import {
  pickInSeasonProducts,
  pickMostPopularProducts,
  pickNewestProducts,
  resolveStockClass,
} from "@/lib/catalogue";
import AppComingSoonSection from "@/components/app-coming-soon-section";
import {
  DesktopCategorySidebar,
  MobileCategories,
  TabletCategoryTabs,
} from "@/components/home-category-navigation";
import FilterChips from "@/components/filter-chips";
import HomeProductCollection from "@/components/home-product-collection";

const DESKTOP_NAVBAR_HEIGHT = 81;

const filters = [
  { value: "popular", label: "Popular", icon: IconFlame },
  { value: "under-15m", label: "Under 15m", icon: IconClock },
  { value: "bundles", label: "Bundles", icon: IconPackage },
  { value: "chef-choice", label: "Chef Choice", icon: IconChefHat },
  { value: "fresh-in-stock", label: "Fresh In Stock", icon: IconBasketCheck },
  { value: "in-season", label: "In Season", icon: IconLeaf },
];

const COLLECTION_COPY = {
  popular: {
    eyebrow: "Top picks",
    title: "Popular Items",
    emptyMessage: "No popular products are available yet.",
    seeAllHref: "/section/popular",
  },
  "under-15m": {
    eyebrow: "Quick picks",
    title: "Under 15m",
    emptyMessage: "No under-15m products or bundles are available yet.",
  },
  bundles: {
    eyebrow: "Curated packs",
    title: "Bundles",
    emptyMessage: "No bundle products are available yet.",
    seeAllHref: "/section/bundle-plans",
  },
  "chef-choice": {
    eyebrow: "Chef picks",
    title: "Chef Choice",
    emptyMessage: "No chef choice products are available yet.",
  },
  "fresh-in-stock": {
    eyebrow: "Fresh arrivals",
    title: "Fresh In Stock",
    emptyMessage: "No fresh in-stock products are available yet.",
    seeAllHref: "/section/new",
  },
  "in-season": {
    eyebrow: "Seasonal picks",
    title: "In Season",
    emptyMessage: "No in-season products are available yet.",
    seeAllHref: "/section/in-season",
  },
};

const classNames = (...items) => items.filter(Boolean).join(" ");

// MobileHeader and TopNav are now in src/components/meal05-header.js (rendered by layout)

function PromoBanner() {
  return (
    <section className="relative z-10 overflow-hidden rounded-[28px] bg-meal-green p-8 text-meal-paper shadow-meal md:min-h-56 md:p-10">
      <div className="absolute inset-y-0 right-0 hidden w-1/2 skew-x-[-18deg] bg-meal-paper/10 md:block" />
      <div className="relative z-10 max-w-sm">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-meal-paper/80">Flash deal</p>
        <h2 className="mt-4 text-3xl font-bold uppercase italic leading-tight md:text-4xl">
          50% off your first kit
        </h2>
        <button className="mt-5 rounded-2xl bg-meal-paper px-7 py-3 text-sm font-medium text-meal-green">
          Claim now
        </button>
      </div>
      <IconShoppingCart
        aria-hidden="true"
        size={126}
        stroke={1.2}
        className="absolute bottom-6 right-6 text-meal-paper/25 md:right-12 md:top-1/2 md:-translate-y-1/2"
      />
    </section>
  );
}

const BOTTOM_NAV_ITEMS = [
  { label: "Home", icon: IconHome, href: "/" },
  { label: "Browse", icon: IconLayoutGrid, href: "/shop" },
  { label: "Orders", icon: IconShoppingBag, href: "/account?tab=orders" },
  { label: "Profile", icon: IconUser, href: "/sign-in" },
];

function BottomNav({ cartCount }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-meal-line bg-meal-paper px-5 py-2 shadow-meal md:hidden">
      <div className="grid grid-cols-4 overflow-hidden">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isHome = item.href === "/";
          return (
            <Link
              key={item.label}
              href={item.href}
              className={classNames(
                "relative flex min-w-0 flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-medium",
                isHome ? "text-meal-pepper" : "text-meal-muted"
              )}
            >
              <Icon size={22} stroke={1.8} />
              <span className="truncate">{item.label}</span>
              {item.label === "Orders" && cartCount ? (
                <span className="absolute right-5 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-meal-pepper px-1 text-[9px] text-meal-paper">
                  {cartCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function Home() {
  const contentBoundaryRef = useRef(null);
  const footerBoundaryRef = useRef(null);
  const sidebarRef = useRef(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [productsStatus, setProductsStatus] = useState("loading");
  const [activeCollection, setActiveCollection] = useState("popular");
  const [cartItems, setCartItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cart", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((items) => {
        if (!cancelled) setCartItems(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (!cancelled) setCartItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/categories", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled) return;
        const nextCategories = Array.isArray(payload?.categories) ? payload.categories : [];
        setCategories(nextCategories);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/products", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled) return;
        const nextProducts = Array.isArray(payload?.flat) ? payload.flat : [];
        setProducts(nextProducts);
        setProductsStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setProductsStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    return categories.reduce((next, category) => {
      next[category.slug] = Number(
        category.product_count ?? category.available_product_count ?? category.count ?? 0
      ) || 0;
      return next;
    }, {});
  }, [categories]);

  useEffect(() => {
    let frame = null;
    let lastMode = "";

    const sidebarHeight = () => `calc(100dvh - ${DESKTOP_NAVBAR_HEIGHT}px)`;

    const applyFixed = (sidebar) => {
      sidebar.style.position = "fixed";
      sidebar.style.left = "max(1.5rem, calc((100vw - 1440px) / 2 + 1.5rem))";
      sidebar.style.top = `${DESKTOP_NAVBAR_HEIGHT}px`;
      sidebar.style.bottom = "";
      sidebar.style.height = sidebarHeight();
      lastMode = "fixed";
    };

    const applyAbsolute = (sidebar, boundary) => {
      const boundaryTop = boundary.getBoundingClientRect().top + window.scrollY;
      const top = Math.max(0, window.scrollY + DESKTOP_NAVBAR_HEIGHT - boundaryTop);

      sidebar.style.position = "absolute";
      sidebar.style.left = "1.5rem";
      sidebar.style.top = `${top}px`;
      sidebar.style.bottom = "";
      sidebar.style.height = sidebarHeight();
      lastMode = "absolute";
    };

    const updateSidebarMode = () => {
      frame = null;
      const sidebar = sidebarRef.current;
      const boundary = contentBoundaryRef.current;
      const footerBoundary = footerBoundaryRef.current;

      if (!sidebar || !boundary || !footerBoundary || window.innerWidth < 1024) {
        if (sidebar) {
          sidebar.style.position = "";
          sidebar.style.left = "";
          sidebar.style.top = "";
          sidebar.style.bottom = "";
          sidebar.style.height = "";
        }
        lastMode = "";
        return;
      }

      const footerTop = footerBoundary.getBoundingClientRect().top;
      const shouldRelease = footerTop <= window.innerHeight;

      if (shouldRelease) {
        if (lastMode !== "absolute") applyAbsolute(sidebar, boundary);
      } else if (lastMode !== "fixed") {
        applyFixed(sidebar);
      }
    };

    const scheduleSidebarMode = () => {
      if (frame != null) return;
      frame = window.requestAnimationFrame(updateSidebarMode);
    };

    updateSidebarMode();
    window.addEventListener("scroll", scheduleSidebarMode, { passive: true });
    window.addEventListener("resize", scheduleSidebarMode);

    const observer = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          lastMode = "";
          scheduleSidebarMode();
        })
      : null;
    if (observer && contentBoundaryRef.current) observer.observe(contentBoundaryRef.current);
    if (observer && footerBoundaryRef.current) observer.observe(footerBoundaryRef.current);

    return () => {
      if (frame != null) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("scroll", scheduleSidebarMode);
      window.removeEventListener("resize", scheduleSidebarMode);
    };
  }, []);

  const availableProducts = useMemo(
    () => products.filter((product) => resolveStockClass(product.stock) !== "is-unavailable"),
    [products]
  );

  const collectionProducts = useMemo(() => {
    if (activeCollection === "popular") {
      const databasePopular = availableProducts.filter(
        (product) => product.isPopular || product.isBestseller || product.isHomepagePick || product.isFeatured
      );
      return databasePopular.length ? databasePopular : pickMostPopularProducts(availableProducts, new Set(), 12);
    }
    if (activeCollection === "fresh-in-stock") {
      const databaseFresh = availableProducts.filter((product) => product.isNewArrival);
      return databaseFresh.length ? databaseFresh : pickNewestProducts(availableProducts, new Set(), 12);
    }
    if (activeCollection === "in-season") {
      return pickInSeasonProducts(availableProducts.filter((product) => product.inSeason === true), new Set(), 12);
    }
    if (activeCollection === "bundles") {
      return availableProducts.filter((product) => product.isBundleEligible);
    }
    if (activeCollection === "chef-choice") {
      return availableProducts.filter(
        (product) => product.isChefChoice || product.collectionSlug === "chef-choice"
      );
    }
    if (activeCollection === "under-15m") {
      return availableProducts.filter(
        (product) =>
          product.isUnder15m ||
          product.isUnder15Minutes ||
          product.collectionSlug === "under-15m" ||
          (Number.isFinite(Number(product.prepMinutes)) && Number(product.prepMinutes) <= 15)
      );
    }
    return [];
  }, [activeCollection, availableProducts]);

  const activeCollectionCopy = COLLECTION_COPY[activeCollection] || COLLECTION_COPY.popular;

  const handleAdd = async (product) => {
    const key = String(product.variantId || product.id);
    const response = await fetch("/api/cart", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: product.id,
        variant_id: key,
        variant_name: product.variantName || product.unit || "Default",
        product_name: product.name,
        unit_price_at_add: Number(product.price || 0),
        quantity: 1,
      }),
    });
    if (!response.ok) return;
    const cartResponse = await fetch("/api/cart", { cache: "no-store" });
    const items = cartResponse.ok ? await cartResponse.json() : [];
    setCartItems(Array.isArray(items) ? items : []);
    window.dispatchEvent(new Event("cart-updated"));
  };

  const cartCount = cartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const sidebarStyle = {
    position: "fixed",
    top: DESKTOP_NAVBAR_HEIGHT,
    left: "max(1.5rem, calc((100vw - 1440px) / 2 + 1.5rem))",
    height: `calc(100dvh - ${DESKTOP_NAVBAR_HEIGHT}px)`,
  };

  return (
    <main className="relative z-0 min-h-screen bg-meal-mist pb-24 text-meal-text md:pb-0">
      <div className="mx-auto max-w-[1440px]">
        {/* Mobile hero visible below the shared fixed header */}
        <section className="px-5 pb-4 pt-3 md:hidden" aria-label="Meal05 homepage hero">
          <div className="flex items-center gap-2 text-left text-xs font-medium uppercase tracking-[0.18em] text-meal-pepper">
            <IconMapPin size={15} stroke={1.8} />
            Delivery to
          </div>
          <p className="mt-1 text-[15px] font-medium text-meal-text">Office, 456 Culinary Blvd</p>
          <h1 className="mt-5 max-w-[15rem] text-4xl font-bold leading-[0.98] tracking-tight text-meal-text">
            Fresh food, fast delivery.
          </h1>
        </section>

        <TabletCategoryTabs
          categories={categories}
          activeCategory=""
          counts={counts}
        />

        <div
          ref={contentBoundaryRef}
          className="relative z-0 flex overflow-visible lg:pl-72"
          style={{ minHeight: `calc(100dvh - ${DESKTOP_NAVBAR_HEIGHT}px)` }}
        >
          <DesktopCategorySidebar
            categories={categories}
            activeCategory=""
            counts={counts}
            sidebarRef={sidebarRef}
            style={sidebarStyle}
          />

          <div className="relative z-10 min-w-0 flex-1 overflow-hidden">
            <div className="md:hidden">
              <MobileCategories
                categories={categories}
                activeCategory=""
                counts={counts}
              />
            </div>

          <section className="px-5 pt-5 md:px-6 md:py-8 lg:pl-8 lg:pr-8">
            <div className="md:hidden">
              <FilterChips filters={filters} activeValue={activeCollection} onSelect={setActiveCollection} />
            </div>

            <div className="mt-1 md:mt-0">
              <PromoBanner />
            </div>

            <div className="hidden md:mt-6 md:block">
              <FilterChips filters={filters} activeValue={activeCollection} onSelect={setActiveCollection} />
            </div>

            <HomeProductCollection
              eyebrow={activeCollectionCopy.eyebrow}
              title={activeCollectionCopy.title}
              products={collectionProducts}
              status={productsStatus}
              emptyMessage={activeCollectionCopy.emptyMessage}
              seeAllHref={activeCollectionCopy.seeAllHref}
              onAdd={handleAdd}
            />
          </section>
          </div>
      </div>
      </div>

      <div ref={footerBoundaryRef}>
        <AppComingSoonSection />
      </div>
      <BottomNav cartCount={cartCount} />
    </main>
  );
}
