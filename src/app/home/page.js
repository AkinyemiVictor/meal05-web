"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconBasketCheck,
  IconChefHat,
  IconClock,
  IconFlame,
  IconHelpCircle,
  IconLeaf,
} from "@tabler/icons-react";
import {
  pickInSeasonProducts,
  pickMostPopularProducts,
  pickNewestProducts,
  resolveStockClass,
} from "@/lib/catalogue";
import AppComingSoonSection from "@/components/app-coming-soon-section";
import { shouldShowSeasonBadge } from "@/lib/season-badge";
import {
  DesktopCategorySidebar,
  MobileCategories,
  TabletCategoryTabs,
} from "@/components/home-category-navigation";
import FilterChips from "@/components/filter-chips";
import HomeProductCollection from "@/components/home-product-collection";
import useCategories from "@/lib/use-categories";
import { useCatalogProducts } from "@/lib/use-catalog-products";

const DESKTOP_NAVBAR_HEIGHT = 81;
const FOOTER_SCROLL_ROOM_PX = 112;
const QuickAddDrawer = dynamic(() => import("@/components/quick-add-drawer"), { ssr: false });

const filters = [
  { value: "popular", label: "Popular", icon: IconFlame },
  { value: "under-15m", label: "Under 15m", icon: IconClock },
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
    emptyMessage: "No under-15m products are available yet.",
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

// MobileHeader and TopNav are now in src/components/meal05-header.js (rendered by layout)

function PromoBanner() {
  return (
    <section className="welcome-banner" aria-labelledby="welcome-banner-title">
      <div className="welcome-banner__halftone" aria-hidden="true" />

      <span className="welcome-banner__float welcome-banner__float--leaf" aria-hidden="true">
        <IconLeaf />
      </span>
      <span className="welcome-banner__float welcome-banner__float--leaf-two" aria-hidden="true">
        <IconLeaf />
      </span>
      <span className="welcome-banner__float welcome-banner__float--leaf-three" aria-hidden="true">
        <IconLeaf />
      </span>
      <span className="welcome-banner__float welcome-banner__float--leaf-four" aria-hidden="true">
        <IconLeaf />
      </span>

      <div className="welcome-banner__inner">
        <div className="welcome-banner__copy">
          <div className="welcome-banner__topline">
            <span className="welcome-banner__brand-chip">
              <IconChefHat aria-hidden="true" />
              <strong>MEAL<span>05</span></strong>
            </span>
          </div>

          <h2 id="welcome-banner-title" className="welcome-banner__title">
            MEAL<span>05</span>
          </h2>
          <p className="welcome-banner__accent">Fresh groceries. Fair prices.</p>
          <p className="welcome-banner__microcopy">Fresh-picked daily in Ibadan.</p>
        </div>

        <div className="welcome-banner__art" aria-hidden="true">
          <div className="welcome-banner__stamp">
            <strong>100%</strong>
            <span>MARKET FRESH</span>
          </div>
          <div className="welcome-banner__frame">
            <div className="welcome-banner__produce-slot">
              <Image
                src="/assets/billboard/welcome-produce.png"
                alt=""
                fill
                priority
                sizes="(max-width: 767px) 0px, (max-width: 1279px) 230px, 300px"
                className="welcome-banner__produce"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const contentBoundaryRef = useRef(null);
  const footerBoundaryRef = useRef(null);
  const sidebarRef = useRef(null);
  const [activeCollection, setActiveCollection] = useState("popular");
  const [quickAddProduct, setQuickAddProduct] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddAnchorEl, setQuickAddAnchorEl] = useState(null);
  const { categories } = useCategories();
  const { ordered: products, status: productsStatus } = useCatalogProducts("/api/catalog/home?limit=72");
  const { ordered: under15Products, status: under15Status } = useCatalogProducts(
    "/api/catalog/under-15m?limit=120"
  );

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

  useEffect(() => {
    let lastTouchY = null;
    const isPastFooterScrollLimit = () => {
      const footer = document.querySelector(".site-footer--primary");
      if (footer) {
        const rect = footer.getBoundingClientRect();
        return rect.bottom <= window.innerHeight - FOOTER_SCROLL_ROOM_PX;
      }

      const scroller = document.scrollingElement || document.documentElement;
      return scroller.scrollTop + window.innerHeight >= scroller.scrollHeight - FOOTER_SCROLL_ROOM_PX;
    };

    const blockForwardScrollAtFooter = (event) => {
      if (event.deltaY > 0 && isPastFooterScrollLimit()) {
        event.preventDefault();
      }
    };

    const onTouchStart = (event) => {
      lastTouchY = event.touches?.[0]?.clientY ?? null;
    };

    const onTouchMove = (event) => {
      const currentTouchY = event.touches?.[0]?.clientY ?? null;
      if (lastTouchY == null || currentTouchY == null) return;

      const swipingUpToScrollDown = currentTouchY < lastTouchY;
      if (swipingUpToScrollDown && isPastFooterScrollLimit()) {
        event.preventDefault();
      }
      lastTouchY = currentTouchY;
    };

    window.addEventListener("wheel", blockForwardScrollAtFooter, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      window.removeEventListener("wheel", blockForwardScrollAtFooter);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  const availableProducts = useMemo(
    () => products.filter((product) => resolveStockClass(product.stock) !== "is-unavailable"),
    [products]
  );

  const availableUnder15Products = useMemo(
    () => under15Products.filter((product) => resolveStockClass(product.stock) !== "is-unavailable"),
    [under15Products]
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
      return pickInSeasonProducts(
        availableProducts.filter((product) => product.inSeason === true && shouldShowSeasonBadge(product)),
        new Set(),
        12
      );
    }
    if (activeCollection === "chef-choice") {
      return availableProducts.filter(
        (product) => product.isChefChoice || product.collectionSlug === "chef-choice"
      );
    }
    if (activeCollection === "under-15m") {
      return availableUnder15Products;
    }
    return [];
  }, [activeCollection, availableProducts, availableUnder15Products]);

  const activeCollectionCopy = COLLECTION_COPY[activeCollection] || COLLECTION_COPY.popular;
  const activeCollectionStatus = activeCollection === "under-15m" ? under15Status : productsStatus;

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

  const sidebarStyle = {
    position: "fixed",
    top: DESKTOP_NAVBAR_HEIGHT,
    left: "max(1.5rem, calc((100vw - 1440px) / 2 + 1.5rem))",
    height: `calc(100dvh - ${DESKTOP_NAVBAR_HEIGHT}px)`,
  };

  return (
    <main className="meal05-home-page relative min-h-screen bg-meal-mist text-meal-text">
      <div className="mx-auto max-w-[1440px] pb-24 md:pb-0">
        {/* Mobile hero visible below the shared fixed header */}
        <section className="px-5 pb-4 pt-3 md:hidden" aria-label="Meal05 homepage hero">
          <h1 className="max-w-[15rem] text-4xl font-bold leading-[0.98] tracking-tight text-meal-text">
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
              status={activeCollectionStatus}
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
        className="fixed bottom-6 right-6 z-40 hidden h-12 w-12 place-items-center rounded-full border border-meal-line bg-meal-paper text-meal-pepper shadow-meal transition hover:border-meal-pepper hover:bg-meal-pepper hover:text-meal-paper md:grid"
      >
        <IconHelpCircle size={24} stroke={1.8} />
      </Link>
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
