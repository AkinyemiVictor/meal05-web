"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  IconBell,
  IconChevronDown,
  IconHelpCircle,
  IconSparkles,
  IconLogin2,
  IconLogout,
  IconPackage,
  IconSearch,
  IconShoppingBag,
  IconUser,
  IconUserCircle,
} from "@tabler/icons-react";
import { shouldShowCommerceHeader } from "@/lib/commerce-chrome";
import { readCartItems } from "@/lib/cart-storage";
import { AUTH_EVENT, clearStoredUser, readStoredUser } from "@/lib/auth";
import { buildSignInHref } from "@/lib/auth-redirect";
import { ORDERS_EVENT, readUserOrders } from "@/lib/orders";
import {
  NOTIFICATIONS_EVENT,
  getUnreadNotificationCount,
  syncDerivedNotifications,
} from "@/lib/notifications";
import LocationPicker from "@/components/location-picker";

const LOGO_SRC = "/assets/logo/MEAL05 NEW LOGO-01.png";
const ACCOUNT_MENU_ID = "meal05-account-menu";

function useCartCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => {
      const localItems = readCartItems();
      setCount(localItems.reduce((sum, item) => sum + Number(item.quantity || item.orderCount || 0), 0));
      if (!readStoredUser()) return;
      fetch("/api/cart", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((items) => {
          if (!Array.isArray(items)) return;
          const rows = Array.isArray(items) ? items : [];
          setCount(rows.reduce((sum, item) => sum + Number(item.quantity || item.orderCount || 0), 0));
        })
        .catch(() => {});
    };
    update();
    window.addEventListener("storage", update);
    window.addEventListener("cart-updated", update);
    window.addEventListener(AUTH_EVENT, update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("cart-updated", update);
      window.removeEventListener(AUTH_EVENT, update);
    };
  }, []);
  return count;
}

function CartBadge({ count }) {
  if (!count) return null;
  return (
    <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-meal-pepper px-1 text-[10px] font-medium text-meal-paper">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function useUnreadNotificationCount(user) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => {
      const activeUser = readStoredUser();
      syncDerivedNotifications({
        orders: readUserOrders(activeUser),
        cartItems: readCartItems(activeUser),
        user: activeUser,
      });
      setCount(getUnreadNotificationCount(activeUser));
    };

    update();
    window.addEventListener("storage", update);
    window.addEventListener("cart-updated", update);
    window.addEventListener(AUTH_EVENT, update);
    window.addEventListener(ORDERS_EVENT, update);
    window.addEventListener(NOTIFICATIONS_EVENT, update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("cart-updated", update);
      window.removeEventListener(AUTH_EVENT, update);
      window.removeEventListener(ORDERS_EVENT, update);
      window.removeEventListener(NOTIFICATIONS_EVENT, update);
    };
  }, [user]);

  return count;
}

function useHeaderUser() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const update = (event) => {
      setUser(event?.detail?.user ?? readStoredUser());
    };

    update();
    window.addEventListener(AUTH_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(AUTH_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);

  return user;
}

function NavIcon({ href, label, children, cartCount, badgeCount }) {
  const count = badgeCount ?? cartCount;
  return (
    <Link
      href={href}
      aria-label={label}
      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-meal-line bg-meal-paper text-meal-text shadow-sm transition hover:border-meal-pepper hover:text-meal-pepper"
    >
      {children}
      {count != null ? <CartBadge count={count} /> : null}
    </Link>
  );
}

function AccountMenu({ user }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const pathname = usePathname();
  const isSignedIn = Boolean(user);
  const signInHref = buildSignInHref({ tab: "login", next: "/account", hash: "loginForm" });
  const signUpHref = buildSignInHref({ tab: "signup", next: "/account", hash: "signupForm" });
  const protect = (href) => (isSignedIn ? href : buildSignInHref({ tab: "login", next: href, hash: "loginForm" }));
  const displayName = user?.fullName || user?.name || user?.email?.split("@")[0] || "Meal05 account";
  const items = [
    { label: "My Account", href: protect("/account"), icon: IconUserCircle },
    { label: "Orders", href: protect("/account?tab=orders"), icon: IconPackage },
    { label: "Wishlist", href: protect("/account?tab=wishlist"), icon: IconSparkles },
    { label: "Help", href: "/help-center", icon: IconHelpCircle },
  ];

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleLogout = () => {
    clearStoredUser();
    setIsOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={isOpen}
        aria-controls={ACCOUNT_MENU_ID}
        onClick={() => setIsOpen((current) => !current)}
        className={`flex h-11 shrink-0 items-center gap-2 rounded-2xl border bg-meal-paper px-3 text-sm font-extrabold text-meal-text shadow-sm transition hover:border-meal-pepper hover:text-meal-pepper focus-visible:border-meal-pepper focus-visible:outline-none ${
          isOpen ? "border-meal-pepper text-meal-pepper" : "border-meal-line"
        }`}
      >
        <IconUser size={21} stroke={1.8} aria-hidden="true" />
        <span className="hidden xl:inline">Account</span>
        <IconChevronDown
          size={16}
          stroke={2}
          aria-hidden="true"
          className={`hidden transition sm:block ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      <div
        id={ACCOUNT_MENU_ID}
        className={`absolute right-0 top-[calc(100%+0.75rem)] z-[70] w-64 overflow-hidden rounded-2xl border border-meal-line bg-meal-paper p-3 shadow-[0_22px_48px_rgba(26,26,46,0.16)] transition ${
          isOpen ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
        }`}
      >
        <div className="border-b border-meal-line px-1 pb-3">
          <p className="truncate text-sm font-extrabold text-meal-text">{isSignedIn ? displayName : "Welcome to Meal05"}</p>
          <p className="mt-1 text-xs font-medium text-meal-muted">
            {isSignedIn ? "Manage orders and saved details." : "Sign in to manage orders faster."}
          </p>
        </div>

        <Link
          href={isSignedIn ? "/account" : signInHref}
          onClick={() => setIsOpen(false)}
          className="mt-3 flex h-11 items-center justify-center gap-2 rounded-xl bg-meal-pepper px-4 text-sm font-extrabold text-meal-paper shadow-soft transition hover:bg-meal-ink focus-visible:bg-meal-ink focus-visible:outline-none"
        >
          <IconLogin2 size={18} stroke={2} aria-hidden="true" />
          <span>{isSignedIn ? "Open Account" : "Sign In"}</span>
        </Link>

        {!isSignedIn ? (
          <Link
            href={signUpHref}
            onClick={() => setIsOpen(false)}
            className="mt-2 flex h-10 items-center justify-center rounded-xl border border-meal-line px-4 text-sm font-extrabold text-meal-text transition hover:border-meal-green hover:text-meal-green focus-visible:border-meal-green focus-visible:text-meal-green focus-visible:outline-none"
          >
            Create account
          </Link>
        ) : null}

        <div className="mt-3 flex flex-col gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold text-meal-text transition hover:bg-meal-mist hover:text-meal-pepper focus-visible:bg-meal-mist focus-visible:text-meal-pepper focus-visible:outline-none"
              >
                <Icon size={20} stroke={1.8} aria-hidden="true" className="shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {isSignedIn ? (
            <button
              type="button"
              onClick={handleLogout}
              className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-red-600 transition hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-none"
            >
              <IconLogout size={20} stroke={1.8} aria-hidden="true" className="shrink-0" />
              <span>Logout</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SearchForm({ id, compact = false }) {
  const router = useRouter();
  const inputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const q = inputRef.current?.value?.trim();
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex min-w-0 items-center gap-3 rounded-2xl border border-meal-line bg-meal-paper px-4 text-meal-muted ${compact ? "h-12" : "h-14 shadow-sm"}`}
    >
      <label htmlFor={id} className="sr-only">Search products</label>
      <IconSearch size={20} stroke={1.8} aria-hidden="true" />
      <input
        id={id}
        ref={inputRef}
        name="q"
        type="search"
        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-meal-text outline-none placeholder:text-meal-muted"
        placeholder="Search tomatoes, yam, fish..."
        autoComplete="off"
      />
      <button
        type="submit"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-meal-ink text-meal-paper transition hover:bg-meal-pepper focus-visible:bg-meal-pepper focus-visible:outline-none"
        aria-label="Search"
      >
        <IconSearch size={17} stroke={2} aria-hidden="true" />
      </button>
    </form>
  );
}

export default function Meal05Header() {
  const pathname = usePathname();
  const cartCount = useCartCount();
  const user = useHeaderUser();
  const unreadNotifications = useUnreadNotificationCount(user);

  if (!shouldShowCommerceHeader(pathname)) return null;

  return (
    <>
      {/* Mobile header */}
      <header className="meal05-header meal05-header--mobile fixed inset-x-0 top-0 z-50 bg-meal-paper px-5 pb-4 pt-4 shadow-sm md:hidden">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Meal05 home">
            <Image
              src={LOGO_SRC}
              alt="Meal05"
              width={108}
              height={46}
              priority
              sizes="108px"
              className="h-12 w-auto shrink-0 object-contain"
            />
          </Link>
          <div className="flex items-center gap-2">
            <NavIcon href="/notifications" label={`Notifications - ${unreadNotifications} unread`} badgeCount={unreadNotifications}>
              <IconBell size={22} stroke={1.8} />
            </NavIcon>
            <NavIcon href="/cart" label={`Cart - ${cartCount} item${cartCount === 1 ? "" : "s"}`} cartCount={cartCount}>
              <IconShoppingBag size={22} stroke={1.8} />
            </NavIcon>
          </div>
        </div>
        <div className="mt-4">
          <SearchForm id="header-search-mobile" compact />
        </div>
      </header>

      {/* Desktop / tablet header */}
      <header className="meal05-header meal05-header--desktop fixed inset-x-0 top-0 z-50 hidden min-h-20 border-b border-meal-line bg-meal-paper px-6 py-4 md:block">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4">
          <Link href="/" aria-label="Meal05 home">
            <Image
              src={LOGO_SRC}
              alt="Meal05"
              width={108}
              height={46}
              priority
              sizes="108px"
              className="h-12 w-auto shrink-0 object-contain"
            />
          </Link>

          <div className="hidden flex-1 lg:block">
            <SearchForm id="header-search-desktop" compact />
          </div>

          <div className="flex flex-1 items-center justify-end gap-3 lg:flex-none">
            <LocationPicker />

            <NavIcon href="/notifications" label={`Notifications - ${unreadNotifications} unread`} badgeCount={unreadNotifications}>
              <IconBell size={21} stroke={1.8} />
            </NavIcon>

            <NavIcon href="/cart" label={`Cart - ${cartCount} item${cartCount === 1 ? "" : "s"}`} cartCount={cartCount}>
              <IconShoppingBag size={21} stroke={1.8} />
            </NavIcon>

            <AccountMenu user={user} />
          </div>
        </div>

        {/* Tablet search row, hidden on desktop */}
        <div className="mx-auto mt-4 max-w-[1440px] lg:hidden">
          <SearchForm id="header-search-tablet" compact />
        </div>
      </header>
      <div aria-hidden="true" className="h-32 md:h-[145px] lg:h-[81px]" />
    </>
  );
}

