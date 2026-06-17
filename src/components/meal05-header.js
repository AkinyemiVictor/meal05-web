"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  IconBell,
  IconMapPin,
  IconSearch,
  IconShoppingBag,
  IconUser,
} from "@tabler/icons-react";

const LOGO_SRC = "/assets/logo/MEAL05 NEW LOGO-01.png";

function useCartCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => {
      fetch("/api/cart", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : []))
        .then((items) => {
          const rows = Array.isArray(items) ? items : [];
          setCount(rows.reduce((sum, item) => sum + Number(item.quantity || item.orderCount || 0), 0));
        })
        .catch(() => setCount(0));
    };
    update();
    window.addEventListener("storage", update);
    window.addEventListener("cart-updated", update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("cart-updated", update);
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

function NavIcon({ href, label, children, cartCount }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-meal-line bg-meal-paper text-meal-text shadow-sm transition hover:border-meal-pepper hover:text-meal-pepper"
    >
      {children}
      {cartCount != null ? <CartBadge count={cartCount} /> : null}
    </Link>
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
      <button type="submit" className="sr-only">Search</button>
    </form>
  );
}

export default function Meal05Header() {
  const pathname = usePathname();
  const cartCount = useCartCount();

  const hidden =
    pathname === "/sign-in" ||
    pathname === "/signup" ||
    pathname?.startsWith("/auth/") ||
    pathname?.startsWith("/admin");

  if (hidden) return null;

  return (
    <>
      {/* Mobile header */}
      <header className="fixed inset-x-0 top-0 z-50 bg-meal-paper px-5 pb-4 pt-4 shadow-sm md:hidden">
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
          <NavIcon href="/cart" label={`Cart - ${cartCount} item${cartCount === 1 ? "" : "s"}`} cartCount={cartCount}>
            <IconShoppingBag size={22} stroke={1.8} />
          </NavIcon>
        </div>
        <div className="mt-4">
          <SearchForm id="header-search-mobile" compact />
        </div>
      </header>

      {/* Desktop / tablet header */}
      <header className="fixed inset-x-0 top-0 z-50 hidden min-h-20 border-b border-meal-line bg-meal-paper px-6 py-4 md:block">
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
            <Link
              href="/account?tab=addresses"
              className="flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-meal-line bg-meal-paper px-4 text-sm font-extrabold text-meal-text shadow-sm transition hover:border-meal-pepper hover:text-meal-pepper"
            >
              <IconMapPin size={18} stroke={1.8} className="text-meal-pepper" />
              <span className="hidden sm:inline">Bodija, Ibadan</span>
              <span className="sm:hidden">Bodija</span>
            </Link>

            <NavIcon href="/account" label="Notifications">
              <IconBell size={21} stroke={1.8} />
            </NavIcon>

            <NavIcon href="/cart" label={`Cart - ${cartCount} item${cartCount === 1 ? "" : "s"}`} cartCount={cartCount}>
              <IconShoppingBag size={21} stroke={1.8} />
            </NavIcon>

            <NavIcon href="/sign-in" label="Sign in / Profile">
              <IconUser size={21} stroke={1.8} />
            </NavIcon>
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

