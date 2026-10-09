"use client";

import { useState } from "react";

const numberOrNull = (value) => value === "" ? null : Number(value);

function VariantRow({ row }) {
  const [form, setForm] = useState({
    productVisible: row.productVisible, productRequiresQuote: row.productRequiresQuote, purchasingConditions: row.purchasingConditions || "",
    variantVisible: row.variantVisible, price: row.price ?? "", minQuantity: row.minQuantity ?? "", maxQuantity: row.maxQuantity ?? "",
    stepQuantity: row.stepQuantity ?? "", packagingLabel: row.packagingLabel || "", availabilityMode: row.availabilityMode || "standard",
    supplierConfirmationRequired: row.supplierConfirmationRequired, directCheckoutEnabled: row.directCheckoutEnabled,
  });
  const [status, setStatus] = useState("");
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setStatus("Saving…");
    const response = await fetch("/api/admin/business-catalog", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      productId: row.productId, variantId: row.variantId, ...form,
      price: numberOrNull(form.price), minQuantity: numberOrNull(form.minQuantity), maxQuantity: numberOrNull(form.maxQuantity), stepQuantity: numberOrNull(form.stepQuantity),
      purchasingConditions: form.purchasingConditions || null, packagingLabel: form.packagingLabel || null,
    }) });
    const payload = await response.json().catch(() => ({}));
    setStatus(response.ok ? "Saved" : payload.error || "Save failed");
  };
  return <tr><td><strong>{row.productName}</strong><small>{row.variantName}</small><small>Variant #{row.variantId}</small></td><td><label><input type="checkbox" checked={form.productVisible} onChange={(e) => set("productVisible", e.target.checked)} /> Product visible</label><label><input type="checkbox" checked={form.productRequiresQuote} onChange={(e) => set("productRequiresQuote", e.target.checked)} /> Always quote</label><input placeholder="Purchasing conditions" value={form.purchasingConditions} onChange={(e) => set("purchasingConditions", e.target.value)} /></td><td><label><input type="checkbox" checked={form.variantVisible} onChange={(e) => set("variantVisible", e.target.checked)} /> Option visible</label><input type="number" min="0" step="0.01" placeholder="Business price (blank = quote)" value={form.price} onChange={(e) => set("price", e.target.value)} /><input placeholder="Pack label" value={form.packagingLabel} onChange={(e) => set("packagingLabel", e.target.value)} /></td><td><div className="admin-business-qty"><input type="number" min="0.001" step="0.001" placeholder="Min" value={form.minQuantity} onChange={(e) => set("minQuantity", e.target.value)} /><input type="number" min="0.001" step="0.001" placeholder="Max" value={form.maxQuantity} onChange={(e) => set("maxQuantity", e.target.value)} /><input type="number" min="0.001" step="0.001" placeholder="Step" value={form.stepQuantity} onChange={(e) => set("stepQuantity", e.target.value)} /></div><select value={form.availabilityMode} onChange={(e) => set("availabilityMode", e.target.value)}><option value="standard">Orderable</option><option value="request">Supplier request</option><option value="unavailable">Unavailable</option></select><label><input type="checkbox" checked={form.supplierConfirmationRequired} onChange={(e) => set("supplierConfirmationRequired", e.target.checked)} /> Supplier confirmation</label><label><input type="checkbox" checked={form.directCheckoutEnabled} onChange={(e) => set("directCheckoutEnabled", e.target.checked)} /> Direct checkout</label></td><td><button onClick={save}>Save</button><small>{status}</small></td></tr>;
}

export default function AdminBusinessCatalogueEditor({ rows }) {
  return <div className="admin-business-table-wrap"><table className="admin-business-table"><thead><tr><th>Product</th><th>Product rules</th><th>Business price</th><th>Quantity & fulfilment</th><th></th></tr></thead><tbody>{rows.map((row) => <VariantRow key={row.variantId} row={row} />)}</tbody></table><style jsx global>{`.admin-business-table-wrap{overflow:auto;border:1px solid #e2e8f0;border-radius:14px;background:#fff}.admin-business-table{width:100%;min-width:1080px;border-collapse:collapse}.admin-business-table th,.admin-business-table td{padding:12px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}.admin-business-table td{min-width:180px}.admin-business-table td:first-child{min-width:230px}.admin-business-table label,.admin-business-table small{display:block;margin:0 0 7px;font-size:12px}.admin-business-table input:not([type=checkbox]),.admin-business-table select{width:100%;margin:0 0 7px;border:1px solid #cbd5e1;border-radius:8px;padding:8px}.admin-business-table button{border:0;border-radius:8px;background:#0f172a;color:#fff;padding:9px 14px;font-weight:700}.admin-business-qty{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}`}</style></div>;
}
