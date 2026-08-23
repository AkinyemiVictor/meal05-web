"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import AvailabilityRequestNotice from "@/components/availability-request-notice";
import styles from "../availability.module.css";

export default function NewAvailabilityRequestClient() {
  const router = useRouter();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    deliveryAddress: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const update = (event) =>
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/availability-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, idempotencyKey }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to submit this basket.");
      router.replace(`/availability-requests/${payload.request.id}`);
    } catch (submissionError) {
      setError(submissionError.message);
      setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link className={styles.back} href="/cart">← Back to basket</Link>
        <section className={styles.card}>
          <p className={styles.eyebrow}>Before payment</p>
          <h1>Check basket availability</h1>
          <p className={styles.lead}>
            Your basket contains at least one item that needs a quick market or supplier check. Submit it once and continue with your day—we’ll keep the basket together while we confirm those items.
          </p>

          <AvailabilityRequestNotice compact />

          <div className={styles.journey} aria-label="What happens next">
            <div className={styles.journeyStep}>
              <span>1</span>
              <div><strong>Submit basket</strong><p>Your contact and delivery details are attached to the request.</p></div>
            </div>
            <div className={styles.journeyStep}>
              <span>2</span>
              <div><strong>We check requested items</strong><p>Standard items stay attached. Only the items marked for confirmation need checking.</p></div>
            </div>
            <div className={styles.journeyStep}>
              <span>3</span>
              <div><strong>Return when it’s ready</strong><p>You’ll see the confirmed basket and payment deadline before paying.</p></div>
            </div>
          </div>

          <form className={styles.form} onSubmit={submit}>
            <div className={styles.formHeading}>
              <h2>Contact and delivery details</h2>
              <p>We’ll use these details for this availability request.</p>
            </div>
            <label className={styles.field}>
              Name
              <input required name="customerName" value={form.customerName} onChange={update} autoComplete="name" />
            </label>
            <label className={styles.field}>
              Phone
              <input required name="customerPhone" value={form.customerPhone} onChange={update} autoComplete="tel" />
            </label>
            <label className={styles.field}>
              Delivery address
              <textarea required name="deliveryAddress" value={form.deliveryAddress} onChange={update} autoComplete="street-address" />
            </label>
            <label className={styles.field}>
              Note <span className={styles.optional}>(optional)</span>
              <textarea name="note" value={form.note} onChange={update} placeholder="Anything our fulfilment team should know?" />
            </label>
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <button className={styles.button} disabled={busy} type="submit">
              {busy ? "Submitting basket…" : "Submit basket for checking"}
            </button>
            <p className={styles.submitHint}>Submitting this request does not charge you.</p>
          </form>
        </section>
      </div>
    </main>
  );
}
