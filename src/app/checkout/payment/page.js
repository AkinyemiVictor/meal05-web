"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { readPendingCheckoutPayment } from "@/lib/checkout";

const TRANSFER_METHODS = ["moniepoint_transfer", "opay_transfer"];

const FALLBACK_METHODS = [
  {
    code: "moniepoint_transfer",
    displayName: "Monie Point",
    customerNotice: "Pay by bank transfer with Monie Point.",
    available: true,
    displayOrder: 1,
  },
  {
    code: "opay_transfer",
    displayName: "OPay",
    customerNotice: "Pay by bank transfer with OPay.",
    available: true,
    displayOrder: 2,
    logoUrl: "/assets/icons/png/thumbnails/bank logos thumbnails/opay logo.png",
  },
];

function ProviderMark({ method }) {
  if (method.logoUrl) {
    return (
      <Image
        src={encodeURI(method.logoUrl)}
        alt=""
        width={42}
        height={42}
        sizes="42px"
        className="checkout-payment-page__logo"
      />
    );
  }

  return (
    <span className="checkout-payment-page__mark" aria-hidden="true">
      {String(method.displayName || "M5").slice(0, 2).toUpperCase()}
    </span>
  );
}

export default function CheckoutPaymentPage() {
  const router = useRouter();
  const [methods, setMethods] = useState(FALLBACK_METHODS);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    const stored = readPendingCheckoutPayment();
    setStatus(stored ? "ready" : "missing");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/payment-methods", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const liveMethods = Array.isArray(payload?.methods)
          ? payload.methods
              .filter((method) => TRANSFER_METHODS.includes(method?.code))
              .map((method) => ({
                ...method,
                displayName: method.code === "moniepoint_transfer" ? "Monie Point" : method.displayName,
                available: method.available !== false,
              }))
              .sort((a, b) => Number(a.displayOrder || 100) - Number(b.displayOrder || 100))
          : [];
        const merged = FALLBACK_METHODS.map((fallback) => ({
          ...fallback,
          ...(liveMethods.find((method) => method.code === fallback.code) || {}),
        }));
        setMethods(merged);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (status === "loading") {
    return (
      <main className="checkout-payment-page" role="status">
        <p>Loading payment...</p>
      </main>
    );
  }

  if (status === "missing") {
    return (
      <main className="checkout-payment-page">
        <section className="checkout-payment-page__panel">
          <h1>Payment unavailable</h1>
          <p>Return to checkout and confirm your delivery details first.</p>
          <Link href="/checkout" className="checkout-payment-page__submit">
            Return to checkout
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="checkout-payment-page">
      <section className="checkout-payment-page__panel" aria-labelledby="payment-title">
        <h1 id="payment-title">Choose payment option</h1>
        <div className="checkout-payment-page__options">
          {methods.map((method) => {
            const disabled = method.available === false;
            return (
              <button
                type="button"
                key={method.code}
                className={`checkout-payment-page__option${disabled ? " is-disabled" : ""}`}
                onClick={() => router.push(`/checkout/payment/${method.code}`)}
                disabled={disabled}
              >
                <ProviderMark method={method} />
                <span>
                  <strong>{method.code === "moniepoint_transfer" ? "Monie Point" : method.displayName}</strong>
                  <small>{method.customerNotice || "Bank transfer"}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
