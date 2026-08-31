"use client";

import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconChecklist, IconMoodSmile, IconShieldLock } from "@tabler/icons-react";

import ManualTransferConfirmationForm from "@/components/manual-transfer-confirmation-form";
import {
  clearPendingCheckoutPayment,
  clearStoredCart,
  clearStoredPromo,
} from "@/lib/checkout";
import {
  clearManualTransferConfirmation,
  readManualTransferConfirmation,
} from "@/lib/payments/manual-transfer-confirmation-storage";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";
import {
  getCheckoutApiErrorMessage,
  logCheckoutApiError,
  logCheckoutNetworkError,
} from "@/lib/checkout-payload";
import { fetchWithNetworkRetry, getNetworkErrorMessage } from "@/lib/fetch-with-network-retry";

const MONIEPOINT_CODE = "moniepoint_transfer";

const formatAmount = (amount, currency = "NGN") =>
  `${String(currency || "NGN").toUpperCase()} ${(Number(amount) || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const getAuthToken = async () => {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ? String(data.session.access_token) : "";
  } catch {
    return "";
  }
};

function ConfirmationTopbar({ onBack }) {
  return (
    <header className="checkout-transfer-confirm-page__topbar">
      <button type="button" onClick={onBack} aria-label="Back to payment details">
        <i className="fa-solid fa-chevron-left" aria-hidden="true" />
      </button>
      <strong>Confirm transfer</strong>
      <Link href="/checkout" aria-label="Close transfer confirmation">
        <i className="fa-solid fa-xmark" aria-hidden="true" />
      </Link>
    </header>
  );
}

function SubmittedDialog({ onContinue, leaving = false }) {
  return (
    <div className="checkout-transfer-pending" role="alertdialog" aria-modal="true" aria-labelledby="transfer-pending-title" aria-describedby="transfer-pending-message">
      <section className="checkout-transfer-pending__dialog">
        <span className="checkout-transfer-pending__smile" aria-hidden="true">
          <IconMoodSmile />
        </span>
        <h1 id="transfer-pending-title">Transfer submitted</h1>
        <p id="transfer-pending-message">
          We are confirming your transfer. You will receive a notification once your payment has been confirmed.
        </p>
        <button type="button" onClick={onContinue} disabled={leaving} aria-busy={leaving}>
          {leaving ? "Opening your orders..." : "View my orders"}
        </button>
      </section>
    </div>
  );
}

export default function ManualTransferConfirmationPage() {
  const params = useParams();
  const router = useRouter();
  const providerCode = String(params?.providerCode || "");
  if (providerCode !== MONIEPOINT_CODE) notFound();

  const [context, setContext] = useState(null);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const stored = readManualTransferConfirmation();
    if (!stored || stored.providerCode !== providerCode) {
      setStatus("missing");
      return;
    }
    setContext(stored);
    setStatus("ready");
  }, [providerCode]);

  const submitTransfer = async (reconciliation) => {
    if (!context?.paymentId || status === "submitting") return;
    setStatus("submitting");
    setMessage("");

    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Your login session has expired. Please sign in again.");

      const response = await fetchWithNetworkRetry("/api/payments/bank-transfer/submit", {
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `${context.paymentId}:submit`,
        },
        body: JSON.stringify({
          paymentId: context.paymentId,
          ...reconciliation,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        logCheckoutApiError("/api/payments/bank-transfer/submit", response, payload, { stage: "submit_transfer" });
        throw new Error(getCheckoutApiErrorMessage(payload, "Unable to submit payment.", response));
      }

      clearStoredCart();
      clearStoredPromo();
      clearPendingCheckoutPayment();
      clearManualTransferConfirmation();
      setStatus("submitted");
    } catch (error) {
      if (error?.code) {
        logCheckoutNetworkError("/api/payments/bank-transfer/submit", error, { stage: "submit_transfer" });
        setMessage(getNetworkErrorMessage(error, "Unable to submit payment."));
      } else {
        setMessage(error?.message || "Unable to submit payment.");
      }
      setStatus("ready");
    }
  };

  const paymentHref = `/checkout/payment/${providerCode}`;

  const continueToOrders = () => {
    setStatus("leaving");
    if (typeof window !== "undefined") {
      window.location.assign("/account/orders");
      return;
    }
    router.replace("/account/orders");
  };

  if (status === "submitted" || status === "leaving") {
    return (
      <main className="checkout-transfer-confirm-page">
        <SubmittedDialog onContinue={continueToOrders} leaving={status === "leaving"} />
      </main>
    );
  }

  if (status === "loading") {
    return (
      <main className="checkout-transfer-confirm-page">
        <ConfirmationTopbar onBack={() => router.push(paymentHref)} />
        <p className="checkout-transfer-confirm-page__loading" role="status">Loading transfer confirmation...</p>
      </main>
    );
  }

  if (status === "missing") {
    return (
      <main className="checkout-transfer-confirm-page">
        <ConfirmationTopbar onBack={() => router.push(paymentHref)} />
        <section className="checkout-transfer-confirm-page__missing">
          <h1>Transfer details unavailable</h1>
          <p>Return to the payment page and select “I’ve sent the money” again.</p>
          <Link href={paymentHref}>Return to payment</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="checkout-transfer-confirm-page">
      <ConfirmationTopbar onBack={() => router.push(paymentHref)} />

      <div className="checkout-transfer-confirm-page__content">
        <header className="checkout-transfer-confirm-page__intro">
          <span aria-hidden="true"><IconChecklist /></span>
          <p>Final step</p>
          <h1>Confirm your transfer</h1>
          <small>Share the sending account details so we can match your payment quickly.</small>
        </header>

        <section className="checkout-transfer-confirm-page__amount" aria-label="Transferred amount">
          <span>Amount sent</span>
          <strong>{formatAmount(context.amount, context.currency)}</strong>
        </section>

        {message ? <p className="checkout-transfer-confirm-page__message" role="alert">{message}</p> : null}

        <ManualTransferConfirmationForm
          amount={context.amount}
          currency={context.currency}
          defaultPayerAccountName={context.defaultPayerAccountName}
          busy={status === "submitting"}
          onSubmit={submitTransfer}
          showHeader={false}
          showCancel={false}
          standalone
        />

        <p className="checkout-transfer-confirm-page__security-note">
          <IconShieldLock aria-hidden="true" />
          Submitting these details does not mark the order as paid. Meal05 will verify the transfer first.
        </p>

        <footer className="checkout-transfer-confirm-page__footer">
          <Link href="/contact-us">Need help?</Link>
          <span aria-hidden="true">•</span>
          <Link href="/checkout">Cancel payment</Link>
        </footer>
      </div>
    </main>
  );
}
