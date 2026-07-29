"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconArrowLeft, IconShieldCheck } from "@tabler/icons-react";

export default function CheckoutLayoutShell({ children }) {
  const pathname = usePathname();
  const isPaymentPage = pathname === "/checkout/payment" || pathname?.startsWith("/checkout/payment/");

  return (
    <>
      {!isPaymentPage ? (
        <header className="border-b border-meal-line bg-meal-paper px-5 py-4">
          <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4">
            <Link href="/" aria-label="Meal05 home" className="shrink-0">
              <Image
                src="/assets/logo/MEAL05 NEW LOGO-01.png"
                alt="Meal05"
                width={108}
                height={46}
                priority
                sizes="108px"
                className="h-12 w-auto object-contain"
              />
            </Link>
            <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-meal-text">
              <IconShieldCheck size={18} stroke={1.8} className="shrink-0 text-meal-green" />
              <span className="hidden sm:inline">Secure checkout</span>
            </div>
            <Link
              href="/cart"
              className="flex h-10 shrink-0 items-center gap-2 rounded-2xl border border-meal-line bg-meal-paper px-3 text-sm font-semibold text-meal-text transition hover:border-meal-pepper hover:text-meal-pepper"
            >
              <IconArrowLeft size={17} stroke={1.8} />
              <span className="hidden sm:inline">Back to cart</span>
              <span className="sm:hidden">Cart</span>
            </Link>
          </div>
        </header>
      ) : null}
      {children}
    </>
  );
}
