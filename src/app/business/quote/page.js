"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { readStoredUser } from "@/lib/auth";
import { clearCartItems, readCartItems } from "@/lib/cart-storage";
import { normalizeCartItems } from "@/lib/cart-items";
import { getBusinessPhoneHref, getBusinessWhatsAppHref } from "@/lib/business-contact";

export default function BusinessQuotePage() {
  const user = typeof window === "undefined" ? null : readStoredUser();
  const [items] = useState(() => normalizeCartItems(readCartItems()));
  const [form, setForm] = useState({
    businessName: "", contactName: user?.name || user?.fullName || "", email: user?.email || "", phone: "", deliveryAddress: "", notes: "",
  });
  const [status, setStatus] = useState({ busy: false, error: "", reference: "" });
  const quoteItems = useMemo(() => items.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: Number(item.quantity || 1) })), [items]);

  const submit = async (event) => {
    event.preventDefault();
    if (!quoteItems.length) return setStatus({ busy: false, error: "Your business basket is empty.", reference: "" });
    setStatus({ busy: true, error: "", reference: "" });
    try {
      const response = await fetch("/api/business/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, items: quoteItems }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to submit quote request.");
      clearCartItems(undefined, { source: "business-quote" });
      setStatus({ busy: false, error: "", reference: payload.quote?.reference || "Submitted" });
    } catch (error) {
      setStatus({ busy: false, error: error.message || "Unable to submit quote request.", reference: "" });
    }
  };

  if (status.reference) return <main className="business-quote-page"><section className="business-quote-card business-quote-success"><span>✓</span><h1>Quotation request received</h1><p>Reference: <strong>{status.reference}</strong></p><p>Our business sourcing team will review availability and pricing before contacting you. No order or payment has been created.</p><Link href="/shop">Continue shopping</Link></section></main>;

  return <main className="business-quote-page"><div className="business-quote-layout"><section><p className="business-quote-eyebrow">Meal05 Business</p><h1>Request a quotation</h1><p>Tell us where the goods are going. We will confirm supply, final pricing and fulfilment details before any order or payment.</p><div className="business-quote-items">{items.length ? items.map((item) => <div key={item.cartItemId || item.variantId}><div><strong>{item.productName || item.name}</strong><span>{item.variantName || item.unit || "Business supply"}</span></div><b>× {item.quantity}</b></div>) : <p>Your business basket is empty. <Link href="/shop">Browse products</Link></p>}</div><div className="business-contact-actions"><a href={getBusinessWhatsAppHref("Hello Meal05, I need help with a business food supply request.")} target="_blank" rel="noreferrer">WhatsApp</a><a href={getBusinessPhoneHref()}>Call us</a></div></section><form className="business-quote-card" onSubmit={submit}><label>Business name<input required value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></label><label>Contact person<input required value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></label><div className="business-quote-fields"><label>Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>Phone<input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label></div><label>Delivery address<textarea required rows="3" value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })} /></label><label>Notes (optional)<textarea rows="4" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>{status.error ? <p className="business-quote-error" role="alert">{status.error}</p> : null}<button disabled={status.busy || !items.length}>{status.busy ? "Submitting…" : "Submit quotation request"}</button></form></div></main>;
}
