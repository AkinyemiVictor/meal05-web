"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  IconHelpCircle,
  IconHome,
  IconLayoutGrid,
  IconShoppingBag,
  IconUser,
} from "@tabler/icons-react";
import { shouldShowMobileBottomNav } from "@/lib/commerce-chrome";
import { prefetchShop } from "@/lib/shop-prefetch";
import useSharedCartCount from "@/lib/use-shared-cart-count";

const items = [
  { label: "Home", icon: IconHome, href: "/home", match: (pathname) => pathname === "/home" },
  { label: "Browse", icon: IconLayoutGrid, href: "/shop", match: (pathname) => pathname === "/shop" || pathname?.startsWith("/categories") || pathname?.startsWith("/products") || pathname?.startsWith("/section") },
  { label: "Cart", icon: IconShoppingBag, href: "/cart", match: (pathname) => pathname === "/cart" || pathname?.startsWith("/checkout") },
  { label: "Help", icon: IconHelpCircle, href: "/help-center", match: (pathname) => pathname === "/help-center" },
  { label: "Profile", icon: IconUser, href: "/account", match: (pathname) => pathname === "/account" },
];

const classNames = (...values) => values.filter(Boolean).join(" ");

export default function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const cartCount = useSharedCartCount();
  const shouldRender = shouldShowMobileBottomNav(pathname);

  if (!shouldRender) return null;

  return (
    <nav className="site-mobile-bottom-nav md:hidden" aria-label="Primary mobile navigation">
      <div className="site-mobile-bottom-nav__inner">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.match(pathname);
          return (
            <Link
              key={item.label}
              href={item.href}
              prefetch={false}
              onPointerEnter={item.href === "/shop" ? () => void prefetchShop(router) : undefined}
              onFocus={item.href === "/shop" ? () => void prefetchShop(router) : undefined}
              onTouchStart={item.href === "/shop" ? () => void prefetchShop(router) : undefined}
              aria-current={isActive ? "page" : undefined}
              className={classNames(
                "site-mobile-bottom-nav__item",
                isActive && "site-mobile-bottom-nav__item--active"
              )}
            >
              <Icon className="site-mobile-bottom-nav__icon" stroke={1.8} aria-hidden="true" />
              {item.label === "Cart" && cartCount > 0 ? (
                <span className="site-mobile-bottom-nav__badge">{cartCount > 99 ? "99+" : cartCount}</span>
              ) : null}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
