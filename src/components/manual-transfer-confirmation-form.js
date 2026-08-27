"use client";

import { useEffect, useState } from "react";

const formatAmount = (amount, currency = "NGN") =>
  `${String(currency || "NGN").toUpperCase()} ${(Number(amount) || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function ManualTransferConfirmationForm({
  amount,
  currency = "NGN",
  defaultPayerAccountName = "",
  busy = false,
  onCancel,
  onSubmit,
}) {
  const [payerAccountName, setPayerAccountName] = useState(defaultPayerAccountName);
  const [payerBankName, setPayerBankName] = useState("");
  const [customerTransactionReference, setCustomerTransactionReference] = useState("");
  const [exactAmountConfirmed, setExactAmountConfirmed] = useState(false);

  useEffect(() => {
    setPayerAccountName((current) => current || defaultPayerAccountName);
  }, [defaultPayerAccountName]);

  const submit = (event) => {
    event.preventDefault();
    if (busy) return;
    onSubmit?.({
      payerAccountName: payerAccountName.trim(),
      payerBankName: payerBankName.trim(),
      customerTransactionReference: customerTransactionReference.trim(),
      exactAmountConfirmed,
    });
  };

  return (
    <form className="manual-transfer-confirmation" onSubmit={submit}>
      <h3>Confirm your transfer details</h3>
      <p>These details help Meal05 locate your transfer. They do not confirm that payment was received.</p>

      <label>
        <span>Name on the account you transferred from</span>
        <input
          type="text"
          minLength={2}
          maxLength={120}
          required
          autoComplete="name"
          value={payerAccountName}
          onChange={(event) => setPayerAccountName(event.target.value)}
        />
      </label>

      <label>
        <span>Bank you transferred from</span>
        <input
          type="text"
          minLength={2}
          maxLength={120}
          required
          autoComplete="organization"
          placeholder="e.g. Moniepoint, GTBank, OPay or Kuda"
          value={payerBankName}
          onChange={(event) => setPayerBankName(event.target.value)}
        />
      </label>

      <label>
        <span>Transaction reference (optional)</span>
        <input
          type="text"
          maxLength={120}
          value={customerTransactionReference}
          onChange={(event) => setCustomerTransactionReference(event.target.value)}
        />
        <small>This helps us locate your transfer faster.</small>
      </label>

      <label className="manual-transfer-confirmation__checkbox">
        <input
          type="checkbox"
          required
          checked={exactAmountConfirmed}
          onChange={(event) => setExactAmountConfirmed(event.target.checked)}
        />
        <span>I transferred exactly {formatAmount(amount, currency)}</span>
      </label>

      <div className="manual-transfer-confirmation__actions">
        <button type="button" onClick={onCancel} disabled={busy}>Back</button>
        <button type="submit" disabled={busy || !exactAmountConfirmed}>
          {busy ? "Submitting..." : "Submit transfer"}
        </button>
      </div>
    </form>
  );
}
