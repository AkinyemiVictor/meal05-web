"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import styles from "../availability.module.css";

export default function NewAvailabilityRequestClient() {
  const router = useRouter();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [form, setForm] = useState({ customerName: "", customerPhone: "", deliveryAddress: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/availability-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, idempotencyKey }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to submit this basket.");
      router.replace(`/availability-requests/${payload.request.id}`);
    } catch (submissionError) { setError(submissionError.message); setBusy(false); }
  };
  return (
    <main className={styles.page}><div className={styles.shell}>
      <Link className={styles.back} href="/cart">← Back to basket</Link>
      <section className={styles.card}>
        <h1>Check basket availability</h1>
        <p className={styles.muted}>Submit the full basket once. We’ll confirm request-only items before you pay; standard items stay attached to the same request.</p>
        <div className={styles.notice}><strong>No payment now.</strong><br />Usually confirmed quickly; allow up to 2 business hours. Once confirmed, you’ll have 2 hours to create the order and pay.</div>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>Name<input required name="customerName" value={form.customerName} onChange={update} autoComplete="name" /></label>
          <label className={styles.field}>Phone<input required name="customerPhone" value={form.customerPhone} onChange={update} autoComplete="tel" /></label>
          <label className={styles.field}>Delivery address<textarea required name="deliveryAddress" value={form.deliveryAddress} onChange={update} autoComplete="street-address" /></label>
          <label className={styles.field}>Note (optional)<textarea name="note" value={form.note} onChange={update} /></label>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <button className={styles.button} disabled={busy} type="submit">{busy ? "Submitting…" : "Submit availability request"}</button>
        </form>
      </section>
    </div></main>
  );
}

