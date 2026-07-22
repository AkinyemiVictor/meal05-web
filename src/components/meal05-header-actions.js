"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  IconBell,
  IconChevronDown,
  IconLogin2,
  IconLogout,
  IconPackage,
  IconShoppingBag,
  IconSparkles,
  IconUser,
  IconUserCircle,
  IconWallet,
} from "@tabler/icons-react";

import DeferredLocationPicker from "@/components/deferred-location-picker";
import { AUTH_EVENT, clearStoredUser, readStoredUser } from "@/lib/auth";
import { buildSignInHref } from "@/lib/auth-redirect";
import { readCartItems } from "@/lib/cart-storage";
import { ORDERS_EVENT, readUserOrders } from "@/lib/orders";
import {
  NOTIFICATIONS_EVENT,
  getUnreadNotificationCount,
  syncDerivedNotifications,
} from "@/lib/notifications";

const ACCOUNT_MENU_ID = "meal05-account-menu";
const WALLET_REFRESH_EVENT = "meal05:wallet-refresh";

const formatMoney = (amount, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: String(currency || "NGN").toUpperCase(),
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);

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
          setCount(items.reduce((sum, item) => sum + Number(item.quantity || item.orderCount || 0), 0));
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

function useWalletBalance(user) {
  const [wallet, setWallet] = useState({ balance: 0, currencyCode: "NGN", status: "idle" });

  useEffect(() => {
    let cancelled = false;

    const update = async (event) => {
      if (!readStoredUser()) {
        if (!cancelled) setWallet({ balance: 0, currencyCode: "NGN", status: "idle" });
        return;
      }

      const detail = event?.detail;
      if (detail && typeof detail === "object" && "balance" in detail) {
        setWallet({
          balance: Number(detail.balance) || 0,
          currencyCode: detail.currencyCode || detail.currency_code || "NGN",
          status: "ready",
        });
        return;
      }

      setWallet((current) => ({ ...current, status: "loading" }));
      try {
        const response = await fetch("/api/wallet", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setWallet((current) => ({ ...current, status: "error" }));
          return;
        }
        setWallet({
          balance: Number(payload?.balance) || 0,
          currencyCode: payload?.currencyCode || "NGN",
          status: "ready",
        });
      } catch {
        if (!cancelled) setWallet((current) => ({ ...current, status: "error" }));
      }
    };

    update();
    window.addEventListener(AUTH_EVENT, update);
    window.addEventListener("storage", update);
    window.addEventListener(WALLET_REFRESH_EVENT, update);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_EVENT, update);
      window.removeEventListener("storage", update);
      window.removeEventListener(WALLET_REFRESH_EVENT, update);
    };
  }, [user]);

  return wallet;
}

function WalletBalancePill({ user, wallet, compact = false }) {
  if (!user || wallet.status !== "ready") return null;

  const amount = formatMoney(wallet.balance, wallet.currencyCode);
  return (
    <Link
      href="/account/wallet"
      aria-label={`Meal05 Balance ${amount}`}
      className={`flex h-11 shrink min-w-0 items-center gap-2 rounded-2xl border border-meal-line bg-meal-paper text-sm font-extrabold text-meal-text shadow-sm transition hover:border-meal-pepper hover:text-meal-pepper focus-visible:border-meal-pepper focus-visible:text-meal-pepper focus-visible:outline-none ${
        compact ? "max-w-[7.25rem] px-2.5" : "px-3"
      }`}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-meal-pepper/10 text-meal-pepper">
        <IconWallet size={18} stroke={2} aria-hidden="true" />
      </span>
      <span className="min-w-0 truncate">{amount}</span>
    </Link>
  );
}

function CartBadge({ count }) {
  if (!count) return null;
  return (
    <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-meal-pepper px-1 text-[10px] font-medium text-meal-paper">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function NavIcon({ href, label, children, count }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-meal-line bg-meal-paper text-meal-text shadow-sm transition hover:border-meal-pepper hover:text-meal-pepper"
    >
      {children}
      <CartBadge count={count} />
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
    { label: "Orders", href: protect("/account/orders"), icon: IconPackage },
    { label: "Wishlist", href: protect("/account/wishlist"), icon: IconSparkles },
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

export default function Meal05HeaderActions({ mobile = false }) {
  const cartCount = useCartCount();
  const user = useHeaderUser();
  const unreadNotifications = useUnreadNotificationCount(user);
  const wallet = useWalletBalance(user);

  if (mobile) {
    return (
      <div className="flex items-center gap-2">
        <WalletBalancePill user={user} wallet={wallet} compact />
        <NavIcon href="/notifications" label={`Notifications - ${unreadNotifications} unread`} count={unreadNotifications}>
          <IconBell size={22} stroke={1.8} />
        </NavIcon>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-end gap-3 lg:flex-none">
      <DeferredLocationPicker />

      <WalletBalancePill user={user} wallet={wallet} />

      <NavIcon href="/notifications" label={`Notifications - ${unreadNotifications} unread`} count={unreadNotifications}>
        <IconBell size={21} stroke={1.8} />
      </NavIcon>

      <NavIcon href="/cart" label={`Cart - ${cartCount} item${cartCount === 1 ? "" : "s"}`} count={cartCount}>
        <IconShoppingBag size={21} stroke={1.8} />
      </NavIcon>

      <AccountMenu user={user} />
    </div>
  );
}
