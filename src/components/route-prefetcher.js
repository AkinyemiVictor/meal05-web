"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const CUSTOMER_PREFETCH_ROUTES = [
  "/shop",
  "/categories",
  "/cart",
  "/checkout",
  "/account",
  "/help-center",
  "/section/popular",
  "/section/new",
  "/section/bundle-plans",
];

const scheduleIdleTask = (callback) => {
  if (typeof window === "undefined") return () => {};
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(callback, { timeout: 2500 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(callback, 1200);
  return () => window.clearTimeout(id);
};

export default function RoutePrefetcher() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (
      pathname === "/sign-in" ||
      pathname === "/signup" ||
      pathname?.startsWith("/auth/") ||
      pathname?.startsWith("/admin")
    ) {
      return undefined;
    }

    return scheduleIdleTask(() => {
      CUSTOMER_PREFETCH_ROUTES.forEach((href) => {
        if (href !== pathname) {
          router.prefetch(href);
        }
      });
    });
  }, [pathname, router]);

  return null;
}
