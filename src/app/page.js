"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconBasketCheck,
  IconArrowRight,
  IconArrowUpLeft,
  IconCarrot,
  IconCherry,
  IconChefHat,
  IconClock,
  IconFlame,
  IconHelpCircle,
  IconHome,
  IconLayoutGrid,
  IconLeaf,
  IconMapPin,
  IconPackage,
  IconPepper,
  IconShoppingBag,
  IconShoppingCart,
  IconTruckDelivery,
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
import { readCartItems } from "@/lib/cart-storage";
import { AUTH_EVENT, readStoredUser } from "@/lib/auth";
import useCategories from "@/lib/use-categories";
import useProducts from "@/lib/use-products";

const DESKTOP_NAVBAR_HEIGHT = 81;
const QuickAddDrawer = dynamic(() => import("@/components/quick-add-drawer"), { ssr: false });

const filters = [
  { value: "popular", label: "Popular", icon: IconFlame },
  { value: "under-15m", label: "Under 15m", icon: IconClock },
  { value: "bundles", label: "MealKit", icon: IconPackage },
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
    title: "MealKit",
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
    <section className="welcome-banner" aria-labelledby="welcome-banner-title">
      <div className="welcome-banner__wash welcome-banner__wash--top" />
      <div className="welcome-banner__wash welcome-banner__wash--bottom" />
      <div className="welcome-banner__halftone" aria-hidden="true" />
      <span className="welcome-banner__dash welcome-banner__dash--one" aria-hidden="true" />
      <span className="welcome-banner__dash welcome-banner__dash--two" aria-hidden="true" />

      <span className="welcome-banner__float welcome-banner__float--leaf" aria-hidden="true">
        <IconLeaf />
      </span>
      <span className="welcome-banner__float welcome-banner__float--pepper" aria-hidden="true">
        <IconPepper />
      </span>
      <span className="welcome-banner__float welcome-banner__float--carrot" aria-hidden="true">
        <IconCarrot />
      </span>
      <span className="welcome-banner__float welcome-banner__float--cherry" aria-hidden="true">
        <IconCherry />
      </span>

      <div className="welcome-banner__inner">
        <div className="welcome-banner__copy">
          <div className="welcome-banner__topline">
            <span className="welcome-banner__brand-chip">
              <IconChefHat aria-hidden="true" />
              <strong>MEAL<span>05</span></strong>
            </span>
            <span className="welcome-banner__farm-note">fresh from the farm</span>
          </div>

          <p className="welcome-banner__eyebrow">Hello &amp; welcome to</p>
          <h2 id="welcome-banner-title" className="welcome-banner__title">
            MEAL<span>05</span>
          </h2>
          <p className="welcome-banner__accent">Shop super fresh &amp; affordable</p>
          <p className="welcome-banner__description">
            Hand-picked groceries, straight from the farm to you. Quality you can taste, prices you&apos;ll love.
          </p>

          <div className="welcome-banner__actions">
            <Link href="/shop" className="welcome-banner__cta">
              <span><IconArrowRight aria-hidden="true" /></span>
              Start shopping
            </Link>
            <span className="welcome-banner__delivery">
              <IconTruckDelivery aria-hidden="true" />
              Same-day delivery in Ibadan
            </span>
          </div>
        </div>

        <div className="welcome-banner__art" aria-hidden="true">
          <div className="welcome-banner__stamp">
            <strong>100%</strong>
            <span>FARM FRESH</span>
          </div>
          <div className="welcome-banner__frame" />
          <Image
            src="/assets/billboard/welcome-produce.png"
            alt=""
            fill
            priority
            sizes="(max-width: 767px) 0px, (max-width: 1279px) 230px, 300px"
            className="welcome-banner__produce"
          />
          <span className="welcome-banner__picked-note">picked this morning!</span>
          <IconArrowUpLeft className="welcome-banner__note-arrow" />
        </div>
      </div>
    </section>
  );
}

const BOTTOM_NAV_ITEMS = [
  { label: "Home", icon: IconHome, href: "/" },
  { label: "Browse", icon: IconLayoutGrid, href: "/shop" },
  { label: "Orders", icon: IconShoppingBag, href: "/account?tab=orders" },
  { label: "Profile", icon: IconUser, href: "/account" },
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
  const [activeCollection, setActiveCollection] = useState("popular");
  const [cartItems, setCartItems] = useState([]);
  const [quickAddProduct, setQuickAddProduct] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddAnchorEl, setQuickAddAnchorEl] = useState(null);
  const { categories } = useCategories();
  const { ordered: products, status: productsStatus } = useProducts();

  useEffect(() => {
    let cancelled = false;
    const updateLocalCart = () => {
      if (!cancelled) setCartItems(readCartItems());
    };
    updateLocalCart();
    const syncServerCart = () => {
      if (!readStoredUser()) return;
      fetch("/api/cart", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((items) => {
          if (!cancelled && Array.isArray(items)) setCartItems(items);
        })
        .catch(() => {
          updateLocalCart();
        });
    };
    syncServerCart();
    window.addEventListener("cart-updated", updateLocalCart);
    window.addEventListener("storage", updateLocalCart);
    window.addEventListener(AUTH_EVENT, syncServerCart);
    return () => {
      cancelled = true;
      window.removeEventListener("cart-updated", updateLocalCart);
      window.removeEventListener("storage", updateLocalCart);
      window.removeEventListener(AUTH_EVENT, syncServerCart);
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

    const measureSidebarHeight = (sidebar) => {
      const previousHeight = sidebar.style.height;
      const previousMaxHeight = sidebar.style.maxHeight;
      const maxHeight = Math.max(0, window.innerHeight - DESKTOP_NAVBAR_HEIGHT);

      sidebar.style.height = "auto";
      sidebar.style.maxHeight = `${maxHeight}px`;
      const height = sidebar.getBoundingClientRect().height;
      sidebar.style.height = previousHeight;
      sidebar.style.maxHeight = previousMaxHeight;

      return height;
    };

    const applyFixed = (sidebar, height) => {
      sidebar.style.position = "fixed";
      sidebar.style.left = "max(1.5rem, calc((100vw - 1440px) / 2 + 1.5rem))";
      sidebar.style.top = `${DESKTOP_NAVBAR_HEIGHT}px`;
      sidebar.style.bottom = "";
      sidebar.style.height = `${height}px`;
      sidebar.style.maxHeight = `${height}px`;
    };

    const applyAbsolute = (sidebar, boundary, height) => {
      const top = Math.max(0, boundary.getBoundingClientRect().height - height);

      sidebar.style.position = "absolute";
      sidebar.style.left = "1.5rem";
      sidebar.style.top = `${top}px`;
      sidebar.style.bottom = "";
      sidebar.style.height = `${height}px`;
      sidebar.style.maxHeight = `${height}px`;
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
          sidebar.style.maxHeight = "";
        }
        return;
      }

      const footerTop = footerBoundary.getBoundingClientRect().top;
      const boundaryHeight = boundary.getBoundingClientRect().height;
      const height = Math.min(measureSidebarHeight(sidebar), boundaryHeight);
      const shouldRelease = footerTop <= DESKTOP_NAVBAR_HEIGHT + height;

      if (shouldRelease) {
        applyAbsolute(sidebar, boundary, height);
      } else {
        applyFixed(sidebar, height);
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

  const handleQuickAddClose = () => {
    setQuickAddOpen(false);
    setQuickAddProduct(null);
    setQuickAddAnchorEl(null);
  };

  const handleQuickAdd = (product, anchorEl) => {
    if (!product) return;
    if (quickAddOpen && quickAddProduct?.id === product.id) {
      handleQuickAddClose();
      return;
    }
    setQuickAddAnchorEl(anchorEl || null);
    setQuickAddProduct(product);
    setQuickAddOpen(true);
  };

  const cartCount = cartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const sidebarStyle = {
    position: "fixed",
    top: DESKTOP_NAVBAR_HEIGHT,
    left: "max(1.5rem, calc((100vw - 1440px) / 2 + 1.5rem))",
    height: `calc(100dvh - ${DESKTOP_NAVBAR_HEIGHT}px)`,
  };

  return (
    <main className="relative z-0 min-h-screen bg-meal-mist text-meal-text">
      <div className="mx-auto max-w-[1440px] pb-24 md:pb-0">
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
          className="home-content-boundary relative z-0 flex overflow-visible lg:pl-72"
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
              onAdd={handleQuickAdd}
              showSeasonBadge={activeCollection !== "in-season"}
            />
          </section>
          </div>
      </div>
      </div>

      <div ref={footerBoundaryRef}>
        <AppComingSoonSection />
      </div>
      <Link
        href="/help-center"
        aria-label="Help Center"
        className="fixed bottom-24 right-5 z-40 grid h-12 w-12 place-items-center rounded-full border border-meal-line bg-meal-paper text-meal-pepper shadow-meal transition hover:border-meal-pepper hover:bg-meal-pepper hover:text-meal-paper md:bottom-6 md:right-6"
      >
        <IconHelpCircle size={24} stroke={1.8} />
      </Link>
      <BottomNav cartCount={cartCount} />
      {quickAddProduct ? (
        <QuickAddDrawer
          product={quickAddProduct}
          isOpen={quickAddOpen}
          onClose={handleQuickAddClose}
          variant="dropdown"
          anchorEl={quickAddAnchorEl}
        />
      ) : null}
    </main>
  );
}
