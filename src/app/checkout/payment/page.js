"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { readPendingCheckoutPayment } from "@/lib/checkout";

const TRANSFER_METHODS = ["moniepoint_transfer", "opay_transfer"];
const MONIEPOINT_LOGO_URL = "/assets/icons/png/thumbnails/bank logos thumbnails/moniepoint logo.png";

const FALLBACK_METHODS = [
  {
    code: "moniepoint_transfer",
    displayName: "Moniepoint",
    available: false,
    displayOrder: 1,
    logoUrl: MONIEPOINT_LOGO_URL,
    description: "Transfer to Meal05's Moniepoint account. We confirm the payment before fulfilment.",
  },
  {
    code: "opay_transfer",
    displayName: "OPay",
    available: false,
    displayOrder: 2,
    logoUrl: "/assets/icons/png/thumbnails/bank logos thumbnails/opay logo.png",
    description: "Transfer from any bank or OPay wallet to the Meal05 OPay account.",
  },
];

const mergeDisplayMethod = (fallback, liveMethod) => ({
  ...fallback,
  available: liveMethod ? liveMethod.available !== false : fallback.available,
  logoUrl: liveMethod?.logoUrl || fallback.logoUrl || "",
  badge: liveMethod?.badge || "",
  description: liveMethod?.customerNotice || fallback.description || "",
});

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
  const [selectedMethod, setSelectedMethod] = useState("moniepoint_transfer");
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    const stored = readPendingCheckoutPayment();
    setAmount(Number(stored?.summary?.total || 0));
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
                displayName: method.code === "moniepoint_transfer" ? "Moniepoint" : method.displayName,
                available: method.available !== false,
              }))
              .sort((a, b) => Number(a.displayOrder || 100) - Number(b.displayOrder || 100))
          : [];
        const merged = FALLBACK_METHODS.map((fallback) =>
          mergeDisplayMethod(fallback, liveMethods.find((method) => method.code === fallback.code))
        );
        setMethods(merged);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (methods.some((method) => method.code === selectedMethod && method.available !== false)) return;
    const firstAvailable = methods.find((method) => method.available !== false);
    if (firstAvailable) setSelectedMethod(firstAvailable.code);
  }, [methods, selectedMethod]);

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

  const activeMethod = methods.find((method) => method.code === selectedMethod && method.available !== false);

  return (
    <main className="checkout-payment-page">
      <section className="checkout-payment-page__panel" aria-labelledby="payment-title">
        <div>
          <p className="checkout-payment-page__eyebrow">Final payable amount</p>
          <h1 id="payment-title">Pay {new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount)}</h1>
        </div>
        <div className="checkout-payment-page__options" role="radiogroup" aria-label="Payment provider">
          {methods.map((method) => {
            const disabled = method.available === false;
            const selected = selectedMethod === method.code;
            return (
              <button
                type="button"
                key={method.code}
                role="radio"
                aria-checked={selected}
                className={`checkout-payment-page__option${selected ? " is-active" : ""}${disabled ? " is-disabled" : ""}`}
                onClick={() => {
                  if (!disabled) setSelectedMethod(method.code);
                }}
                disabled={disabled}
              >
                <ProviderMark method={method} />
                <span>
                  <strong>{method.code === "moniepoint_transfer" ? "Moniepoint" : method.displayName}</strong>
                  <small>{method.description || "Transfer the exact amount to the account shown on the next screen."}</small>
                  {method.badge ? <em>{method.badge}</em> : null}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="checkout-payment-page__submit"
          disabled={!activeMethod}
          onClick={() => activeMethod && router.push(`/checkout/payment/${activeMethod.code}`)}
        >
          Continue
        </button>
      </section>
    </main>
  );
}
