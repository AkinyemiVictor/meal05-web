"use client";

import Image from "next/image";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  clearPendingCheckoutPayment,
  clearStoredCart,
  readPendingCheckoutPayment,
} from "@/lib/checkout";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";
import {
  buildCheckoutOrderRequest,
  getCheckoutApiErrorMessage,
  logCheckoutApiError,
} from "@/lib/checkout-payload";

const TRANSFER_METHODS = ["moniepoint_transfer", "opay_transfer"];
const MONIEPOINT_LOGO_URL = "/assets/icons/png/thumbnails/bank logos thumbnails/moniepoint logo.png";

const FALLBACK_METHODS = [
  {
    code: "moniepoint_transfer",
    displayName: "Moniepoint",
    available: false,
    displayOrder: 1,
    logoUrl: MONIEPOINT_LOGO_URL,
  },
  {
    code: "opay_transfer",
    displayName: "OPay",
    available: false,
    displayOrder: 2,
    logoUrl: "/assets/icons/png/thumbnails/bank logos thumbnails/opay logo.png",
  },
];

const mergeDisplayMethod = (fallback, liveMethod) => ({
  ...fallback,
  available: liveMethod ? liveMethod.available !== false : fallback.available,
  logoUrl: liveMethod?.logoUrl || fallback.logoUrl || "",
});

const createIdempotencyKey = (prefix = "checkout-payment") => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
};

const getAuthToken = async () => {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ? String(data.session.access_token) : "";
  } catch {
    return "";
  }
};

const buildHeaders = (token, idempotencyKey = "") => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  return headers;
};

const formatTransferAmount = (amount) =>
  `NGN ${(Number(amount) || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const copyToClipboard = async (value) => {
  const text = String(value ?? "").trim();
  if (!text || typeof window === "undefined") return false;
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {}
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch (_) {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
};

function ProviderLogo({ method, large = false }) {
  if (method?.logoUrl) {
    const size = large ? 58 : 42;
    return (
      <Image
        src={encodeURI(method.logoUrl)}
        alt=""
        width={size}
        height={size}
        sizes={`${size}px`}
        className="checkout-transfer-screen__provider-logo"
      />
    );
  }

  return (
    <span className={`checkout-transfer-screen__provider-mark${large ? " checkout-transfer-screen__provider-mark--large" : ""}`}>
      {String(method?.displayName || "M5").slice(0, 2).toUpperCase()}
    </span>
  );
}

function TransferShell({ children, onBack }) {
  return (
    <main className="checkout-transfer-screen">
      <header className="checkout-transfer-screen__topbar">
        <button type="button" onClick={onBack} aria-label="Back to payment options">
          <i className="fa-solid fa-chevron-left" aria-hidden="true" />
        </button>
        <strong>Payment</strong>
        <Link href="/checkout" aria-label="Close payment">
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </Link>
      </header>
      {children}
    </main>
  );
}

function PaymentHero({ provider, amount }) {
  const [copied, setCopied] = useState(false);
  const copyAmount = async () => {
    const ok = await copyToClipboard(Math.round(Number(amount) || 0));
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="checkout-transfer-screen__hero">
      <ProviderLogo method={provider} large />
      <i className="fa-solid fa-building-columns checkout-transfer-screen__bank-icon" aria-hidden="true" />
      <h1>
        Pay <span>{formatTransferAmount(amount)}</span>
        <button type="button" onClick={copyAmount} className="checkout-transfer-screen__copy-amount" aria-label="Copy payment amount">
          <i className={copied ? "fa-solid fa-check" : "fa-regular fa-copy"} aria-hidden="true" />
        </button>
      </h1>
      <p className="checkout-transfer-screen__copy-feedback" aria-live="polite">
        {copied ? "Copied" : "Copy amount"}
      </p>
    </section>
  );
}

function AgreementStep({ provider, amount, agreed, setAgreed, onContinue, busy, message }) {
  return (
    <div className="checkout-transfer-screen__content">
      <PaymentHero provider={provider} amount={amount} />
      <h2>Before you make this transfer</h2>

      <section className="checkout-transfer-screen__rules">
        <div className="checkout-transfer-screen__rule">
          <span aria-hidden="true">
            <i className="fa-solid fa-check" />
          </span>
          <p>
            <strong>Transfer only the exact amount</strong>
            <small>Do not transfer an incorrect amount.</small>
          </p>
        </div>

        <label className="checkout-transfer-screen__agree">
          <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
          <span>I understand this instruction.</span>
        </label>

        <button
          type="button"
          className="checkout-transfer-screen__continue"
          onClick={onContinue}
          disabled={!agreed || busy}
        >
          {busy ? "Preparing..." : "I understand and continue"}
        </button>
        {message ? <p className="checkout-transfer-screen__message">{message}</p> : null}
      </section>

      <TransferFooter />
    </div>
  );
}

function AccountDetailsStep({ provider, details, pending, busy, message, onSubmit }) {
  const payment = details?.payment || {};
  const activeProvider = { ...(provider || {}), ...(details?.provider || {}) };
  const amount = Number(payment.amount ?? details?.order?.summary?.total ?? pending?.summary?.total ?? 0) || 0;

  const copyText = (value) => copyToClipboard(value);

  return (
    <div className="checkout-transfer-screen__content">
      <PaymentHero provider={activeProvider} amount={amount} />

      <section className="checkout-transfer-screen__exact">
        Transfer exactly <strong>{formatTransferAmount(amount)}</strong> to the bank account below.
      </section>

      <section className="checkout-transfer-screen__account-card" aria-labelledby="transfer-bank-name">
        <span className="checkout-transfer-screen__bank-dot" aria-hidden="true" />
        <h2 id="transfer-bank-name">{activeProvider.bankName || activeProvider.displayName || "Bank transfer"}</h2>
        <button type="button" onClick={() => copyText(activeProvider.accountNumber)} className="checkout-transfer-screen__account-number">
          <span>{activeProvider.accountNumber || "Unavailable"}</span>
          {activeProvider.accountNumber ? <i className="fa-regular fa-copy" aria-hidden="true" /> : null}
        </button>
        <p>{activeProvider.accountName || "Meal05"}</p>
        <div className="checkout-transfer-screen__account-note">
          <i className="fa-solid fa-circle-info" aria-hidden="true" />
          <span>Transfer only the exact amount.</span>
        </div>
      </section>

      <p className="checkout-transfer-screen__confirmation">
        You will get a confirmation once we receive your payment.
      </p>

      {message ? <p className="checkout-transfer-screen__message">{message}</p> : null}
      <button type="button" className="checkout-transfer-screen__sent" onClick={onSubmit} disabled={busy}>
        {busy ? "Submitting..." : "I've sent the money"}
      </button>

      <TransferFooter />
    </div>
  );
}

function TransferFooter() {
  return (
    <footer className="checkout-transfer-screen__footer">
      <div>
        <Link href="/checkout/payment">Cancel</Link>
        <span aria-hidden="true" />
        <Link href="/contact-us">Help?</Link>
      </div>
      <p>
        <i className="fa-solid fa-lock" aria-hidden="true" />
        Secured
      </p>
    </footer>
  );
}

export default function ProviderPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const providerCode = String(params?.providerCode || "");
  if (!TRANSFER_METHODS.includes(providerCode)) notFound();

  const [pending, setPending] = useState(null);
  const [methods, setMethods] = useState(FALLBACK_METHODS);
  const [status, setStatus] = useState("loading");
  const [agreed, setAgreed] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [transferDetails, setTransferDetails] = useState(null);

  useEffect(() => {
    const stored = readPendingCheckoutPayment();
    setPending(stored);
    setStatus(stored ? "agreement" : "missing");
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
        setMethods(FALLBACK_METHODS.map((fallback) =>
          mergeDisplayMethod(fallback, liveMethods.find((method) => method.code === fallback.code))
        ));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const provider = useMemo(
    () => methods.find((method) => method.code === providerCode) || FALLBACK_METHODS.find((method) => method.code === providerCode),
    [methods, providerCode]
  );

  const amount = Number(pending?.summary?.total ?? 0) || 0;

  const createOrderAndPayment = async () => {
    if (!pending || busy) return;
    if (!provider || provider.available === false) {
      setMessage("Choose an available payment option.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Your login session has expired. Please sign in again to continue checkout.");

      const form = pending.form || {};
      const orderResponse = await fetch("/api/orders", {
        method: "POST",
        cache: "no-store",
        headers: buildHeaders(token, pending.orderIdempotencyKey || createIdempotencyKey("checkout-order")),
        body: JSON.stringify(buildCheckoutOrderRequest({
          form,
          items: pending.cartItems || pending.items || [],
          fulfillmentType: pending.fulfillmentType,
          pickupLocationId: pending.pickupLocationId,
          deliveryPartnerId: pending.selectedDispatchOptionId,
          deliveryLatitude: pending.deliveryLocation?.latitude,
          deliveryLongitude: pending.deliveryLocation?.longitude,
          paymentMethod: provider.code,
          promoCode: pending.promoCode,
        })),
      });
      const orderPayload = await orderResponse.json().catch(() => ({}));
      if (!orderResponse.ok) {
        logCheckoutApiError("/api/orders", orderResponse, orderPayload);
        throw new Error(getCheckoutApiErrorMessage(orderPayload, "Unable to create order."));
      }

      const orderId = orderPayload?.order?.id;
      if (!orderId) throw new Error("Unable to create order.");

      const transferResponse = await fetch("/api/payments/bank-transfer/initialize", {
        method: "POST",
        cache: "no-store",
        headers: buildHeaders(token, createIdempotencyKey("checkout-payment-init")),
        body: JSON.stringify({ orderId, providerCode: provider.code }),
      });
      const transferPayload = await transferResponse.json().catch(() => ({}));
      if (!transferResponse.ok) {
        logCheckoutApiError("/api/payments/bank-transfer/initialize", transferResponse, transferPayload);
        throw new Error(getCheckoutApiErrorMessage(transferPayload, "Payment could not be initialized. Please try again."));
      }

      setTransferDetails({
        order: {
          orderId: String(orderId),
          summary: orderPayload.summary || pending.summary,
        },
        payment: transferPayload.payment,
        provider: transferPayload.provider,
      });
      setStatus("details");
    } catch (error) {
      setMessage(error?.message || "Unable to continue to payment.");
    } finally {
      setBusy(false);
    }
  };

  const submitTransfer = async () => {
    if (!transferDetails?.payment?.id || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Your login session has expired. Please sign in again.");
      const response = await fetch("/api/payments/bank-transfer/submit", {
        method: "POST",
        cache: "no-store",
        headers: buildHeaders(token, `${transferDetails.payment.id}:submit`),
        body: JSON.stringify({
          paymentId: transferDetails.payment.id,
          payerAccountName: pending?.form?.fullName || "Meal05 customer",
          payerBankName: "Customer bank",
          customerTransactionReference: "",
          exactAmountConfirmed: true,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to submit payment.");
      clearStoredCart();
      clearPendingCheckoutPayment();
      setMessage(payload?.message || "Payment submitted. Meal05 will verify your transfer.");
    } catch (error) {
      setMessage(error?.message || "Unable to submit payment.");
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading") {
    return (
      <TransferShell onBack={() => router.push("/checkout/payment")}>
        <div className="checkout-transfer-screen__content" role="status">
          <p className="checkout-transfer-screen__confirmation">Loading payment...</p>
        </div>
      </TransferShell>
    );
  }

  if (status === "missing") {
    return (
      <TransferShell onBack={() => router.push("/checkout/payment")}>
        <div className="checkout-transfer-screen__content">
          <section className="checkout-payment-page__panel">
            <h1>Payment unavailable</h1>
            <p>Return to checkout and confirm your delivery details first.</p>
            <Link href="/checkout" className="checkout-payment-page__submit">
              Return to checkout
            </Link>
          </section>
        </div>
      </TransferShell>
    );
  }

  return (
    <TransferShell onBack={() => router.push("/checkout/payment")}>
      {status === "details" ? (
        <AccountDetailsStep
          provider={provider}
          details={transferDetails}
          pending={pending}
          busy={busy}
          message={message}
          onSubmit={submitTransfer}
        />
      ) : (
        <AgreementStep
          provider={provider}
          amount={amount}
          agreed={agreed}
          setAgreed={setAgreed}
          onContinue={createOrderAndPayment}
          busy={busy}
          message={message}
        />
      )}
    </TransferShell>
  );
}
