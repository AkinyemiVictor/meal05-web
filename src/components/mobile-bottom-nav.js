"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  IconHome,
  IconLayoutGrid,
  IconShoppingBag,
  IconUser,
} from "@tabler/icons-react";
import { shouldShowMobileBottomNav } from "@/lib/commerce-chrome";

const items = [
  { label: "Home", icon: IconHome, href: "/home", match: (pathname) => pathname === "/home" },
  { label: "Browse", icon: IconLayoutGrid, href: "/shop", match: (pathname) => pathname === "/shop" || pathname?.startsWith("/categories") || pathname?.startsWith("/products") || pathname?.startsWith("/section") },
  { label: "Orders", icon: IconShoppingBag, href: "/account?tab=orders", match: (pathname, searchParams) => pathname === "/account" && searchParams?.get("tab") === "orders" },
  { label: "Profile", icon: IconUser, href: "/account", match: (pathname, searchParams) => pathname === "/account" && searchParams?.get("tab") !== "orders" },
];

const classNames = (...values) => values.filter(Boolean).join(" ");

export default function MobileBottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!shouldShowMobileBottomNav(pathname)) return null;

  return (
    <nav className="site-mobile-bottom-nav md:hidden" aria-label="Primary mobile navigation">
      <div className="site-mobile-bottom-nav__inner">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.match(pathname, searchParams);
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={classNames(
                "site-mobile-bottom-nav__item",
                isActive && "site-mobile-bottom-nav__item--active"
              )}
            >
              <Icon className="site-mobile-bottom-nav__icon" stroke={1.8} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
