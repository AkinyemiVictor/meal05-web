"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { IconSearch } from "@tabler/icons-react";

import DeferredLocationPicker from "@/components/deferred-location-picker";
import { shouldShowCommerceHeader } from "@/lib/commerce-chrome";

const LOGO_SRC = "/assets/logo/MEAL05 NEW LOGO-01.png";
const Meal05HeaderActions = dynamic(() => import("@/components/meal05-header-actions"), { ssr: false });

function SearchForm({ id, compact = false }) {
  const router = useRouter();
  const inputRef = useRef(null);

  const handleSubmit = (event) => {
    event.preventDefault();
    const q = inputRef.current?.value?.trim();
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex min-w-0 items-center gap-3 rounded-2xl border border-meal-line bg-meal-paper px-4 text-meal-muted ${compact ? "h-12" : "h-14 shadow-sm"}`}
    >
      <label htmlFor={id} className="sr-only">
        Search products
      </label>
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

  if (!shouldShowCommerceHeader(pathname)) return null;

  return (
    <>
      <header className="meal05-header meal05-header--mobile fixed inset-x-0 top-0 z-50 bg-meal-paper px-5 pb-4 pt-4 shadow-sm md:hidden">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="w-[10.5rem] max-w-[42vw] shrink-0">
            <DeferredLocationPicker mobileHeader />
          </div>
          <Meal05HeaderActions mobile />
        </div>
        <div className="mt-4">
          <SearchForm id="header-search-mobile" compact />
        </div>
      </header>

      <header className="meal05-header meal05-header--desktop fixed inset-x-0 top-0 z-50 hidden min-h-20 border-b border-meal-line bg-meal-paper px-6 py-4 md:block">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4">
          <Link href="/home" aria-label="Meal05 home" prefetch={false}>
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

          <Meal05HeaderActions />
        </div>

        <div className="mx-auto mt-4 max-w-[1440px] lg:hidden">
          <SearchForm id="header-search-tablet" compact />
        </div>
      </header>
      <div aria-hidden="true" className="h-36 md:h-[145px] lg:h-[81px]" />
    </>
  );
}
