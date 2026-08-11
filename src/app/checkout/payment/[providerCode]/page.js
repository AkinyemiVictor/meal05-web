"use client";

import Image from "next/image";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconBuildingBank, IconMoodSmile } from "@tabler/icons-react";

import {
  clearPendingCheckoutPayment,
  clearStoredCart,
  clearStoredPromo,
  readPendingCheckoutPayment,
} from "@/lib/checkout";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";
import {
  buildCheckoutOrderRequest,
  getCheckoutApiErrorMessage,
  logCheckoutApiError,
} from "@/lib/checkout-payload";

const MONIEPOINT_CODE = "moniepoint_transfer";
const MONIEPOINT_LOGO_URL = "/assets/icons/png/thumbnails/bank logos thumbnails/moniepoint logo.png";

const FALLBACK_PROVIDER = {
  code: MONIEPOINT_CODE,
  displayName: "Moniepoint",
  available: false,
  displayOrder: 1,
  logoUrl: MONIEPOINT_LOGO_URL,
};

const mergeDisplayProvider = (liveProvider) => ({
  ...FALLBACK_PROVIDER,
  ...liveProvider,
  displayName: "Moniepoint",
  available: Boolean(liveProvider) && liveProvider.available !== false,
  logoUrl: MONIEPOINT_LOGO_URL,
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

function ProviderLogo({ provider }) {
  return (
    <Image
      src={encodeURI(provider?.logoUrl || MONIEPOINT_LOGO_URL)}
      alt="Moniepoint"
      width={72}
      height={72}
      sizes="72px"
      className="checkout-transfer-screen__provider-logo"
    />
  );
}

function TransferShell({ children, onBack }) {
  return (
    <main className="checkout-transfer-screen">
      <header className="checkout-transfer-screen__topbar">
        <button type="button" onClick={onBack} aria-label="Back to checkout">
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

function PaymentHero({ amount }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  const copyAmount = async () => {
    const ok = await copyToClipboard(Math.round(Number(amount) || 0));
    if (!ok) return;
    setCopied(true);
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="checkout-transfer-screen__hero">
      <span className="checkout-transfer-screen__bank-icon" aria-hidden="true">
        <IconBuildingBank />
      </span>
      <h1>
        Pay{" "}
        <button type="button" onClick={copyAmount} className="checkout-transfer-screen__amount-button" aria-label="Copy payment amount">
          {formatTransferAmount(amount)}
        </button>
      </h1>
      <p className="checkout-transfer-screen__copy-feedback" aria-live="polite">
        {copied ? "Copied" : "Tap amount to copy"}
      </p>
    </section>
  );
}

function AccountDetailsStep({ provider, details, pending, busy, message, onSubmit }) {
  const payment = details?.payment || {};
  const activeProvider = { ...(provider || {}), ...(details?.provider || {}), logoUrl: MONIEPOINT_LOGO_URL };
  const amount = Number(payment.amount ?? details?.order?.summary?.total ?? pending?.summary?.total ?? 0) || 0;

  return (
    <div className="checkout-transfer-screen__content">
      <PaymentHero amount={amount} />

      <section className="checkout-transfer-screen__exact">
        Transfer exactly <strong>{formatTransferAmount(amount)}</strong> to the bank account below.
      </section>

      <section className="checkout-transfer-screen__account-card" aria-labelledby="transfer-bank-name">
        <ProviderLogo provider={activeProvider} />
        <h2 id="transfer-bank-name">{activeProvider.bankName || "Moniepoint Microfinance Bank"}</h2>
        <button
          type="button"
          onClick={() => copyToClipboard(activeProvider.accountNumber)}
          className="checkout-transfer-screen__account-number"
          aria-label="Copy Moniepoint account number"
        >
          <span>{activeProvider.accountNumber || "Unavailable"}</span>
        </button>
        <p>{activeProvider.accountName || "Meal05 LTD"}</p>
        <div className="checkout-transfer-screen__account-note">
          <i className="fa-solid fa-circle-info" aria-hidden="true" />
          <span>Transfer only the exact amount.</span>
        </div>
      </section>

      <p className="checkout-transfer-screen__confirmation">
        You will get a confirmation once we receive your payment.
      </p>

      {message ? <p className="checkout-transfer-screen__message" role="alert">{message}</p> : null}
      <button type="button" className="checkout-transfer-screen__sent" onClick={onSubmit} disabled={busy}>
        {busy ? "Submitting..." : "I’ve sent the money"}
      </button>

      <TransferFooter />
    </div>
  );
}

function TransferFooter() {
  return (
    <footer className="checkout-transfer-screen__footer">
      <div>
        <Link href="/checkout">Cancel</Link>
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

function PendingConfirmationDialog({ onCancel }) {
  return (
    <div className="checkout-transfer-pending" role="alertdialog" aria-modal="true" aria-labelledby="transfer-pending-title" aria-describedby="transfer-pending-message">
      <section className="checkout-transfer-pending__dialog">
        <span className="checkout-transfer-pending__smile" aria-hidden="true">
          <IconMoodSmile />
        </span>
        <h1 id="transfer-pending-title">Payment received</h1>
        <p id="transfer-pending-message">
          We are confirming your payment. You will receive a notification upon confirmation.
        </p>
        <button type="button" onClick={onCancel}>Cancel</button>
      </section>
    </div>
  );
}

export default function ProviderPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const providerCode = String(params?.providerCode || "");
  if (providerCode !== MONIEPOINT_CODE) notFound();

  const startedRef = useRef(false);
  const [pending, setPending] = useState(null);
  const [provider, setProvider] = useState(FALLBACK_PROVIDER);
  const [providerStatus, setProviderStatus] = useState("loading");
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [transferDetails, setTransferDetails] = useState(null);

  useEffect(() => {
    const stored = readPendingCheckoutPayment();
    setPending(stored);
    setStatus(stored ? "preparing" : "missing");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/payment-methods", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Unable to load Moniepoint."))))
      .then((payload) => {
        const liveProvider = Array.isArray(payload?.methods)
          ? payload.methods.find((method) => method?.code === MONIEPOINT_CODE)
          : null;
        setProvider(mergeDisplayProvider(liveProvider));
        setProviderStatus("ready");
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setProviderStatus("error");
      });
    return () => controller.abort();
  }, []);

  const createOrderAndPayment = useCallback(async () => {
    if (!pending || !provider || provider.available === false) return;

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
          paymentMethod: MONIEPOINT_CODE,
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
        headers: buildHeaders(token, `${pending.orderIdempotencyKey || orderId}:payment`),
        body: JSON.stringify({ orderId, providerCode: MONIEPOINT_CODE }),
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
        provider: { ...transferPayload.provider, logoUrl: MONIEPOINT_LOGO_URL },
      });
      setStatus("details");
    } catch (error) {
      setMessage(error?.message || "Unable to continue to payment.");
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }, [pending, provider]);

  useEffect(() => {
    if (status !== "preparing" || !pending) return;
    if (providerStatus === "error") {
      setMessage("Unable to load Moniepoint. Please try again.");
      setStatus("error");
      return;
    }
    if (providerStatus !== "ready") return;
    if (!provider || provider.available === false) {
      setMessage("Moniepoint transfer is not available right now.");
      setStatus("error");
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    void createOrderAndPayment();
  }, [createOrderAndPayment, pending, provider, providerStatus, status]);

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
      clearStoredPromo();
      clearPendingCheckoutPayment();
      setStatus("submitted");
    } catch (error) {
      setMessage(error?.message || "Unable to submit payment.");
    } finally {
      setBusy(false);
    }
  };

  if (status === "submitted") {
    return (
      <main className="checkout-transfer-screen checkout-transfer-screen--submitted">
        <PendingConfirmationDialog onCancel={() => router.replace("/account/orders")} />
      </main>
    );
  }

  if (status === "loading" || status === "preparing") {
    return (
      <TransferShell onBack={() => router.push("/checkout")}>
        <div className="checkout-transfer-screen__content" role="status">
          <p className="checkout-transfer-screen__confirmation">Preparing your Moniepoint transfer...</p>
        </div>
      </TransferShell>
    );
  }

  if (status === "missing") {
    return (
      <TransferShell onBack={() => router.push("/checkout")}>
        <div className="checkout-transfer-screen__content">
          <section className="checkout-payment-page__panel">
            <h1>Payment unavailable</h1>
            <p>Return to checkout and confirm your delivery details first.</p>
            <Link href="/checkout" className="checkout-payment-page__submit">Return to checkout</Link>
          </section>
        </div>
      </TransferShell>
    );
  }

  if (status === "error") {
    return (
      <TransferShell onBack={() => router.push("/checkout")}>
        <div className="checkout-transfer-screen__content checkout-transfer-screen__content--error">
          <section className="checkout-payment-page__panel">
            <h1>Payment unavailable</h1>
            <p role="alert">{message}</p>
            <button
              type="button"
              className="checkout-payment-page__submit"
              onClick={() => {
                startedRef.current = false;
                setMessage("");
                setStatus("preparing");
              }}
            >
              Try again
            </button>
          </section>
        </div>
      </TransferShell>
    );
  }

  return (
    <TransferShell onBack={() => router.push("/checkout")}>
      <AccountDetailsStep
        provider={provider}
        details={transferDetails}
        pending={pending}
        busy={busy}
        message={message}
        onSubmit={submitTransfer}
      />
    </TransferShell>
  );
}
