"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const field = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "9px 10px", width: "100%" };
const label = { display: "grid", gap: 5, color: "#334155", fontSize: 12, fontWeight: 700 };
const localDate = (hours) => {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

export default function AdminTagBatchControl({ batches = [], variants = [] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    variantId: variants[0]?.id ? String(variants[0].id) : "",
    tagUnitPrice: "",
    minimumViableQuantity: "10",
    targetQuantity: "20",
    maximumQuantity: "30",
    closesAt: localDate(48),
    expectedProcurementAt: localDate(72),
    failurePolicy: "refund",
    carryForwardBatchId: "",
    status: "open",
  });
  const poolOptions = useMemo(() => {
    const pools = new Map();
    for (const variant of variants) {
      const key = `${variant.marketId}:${variant.productId}:${variant.baseUnit}:${variant.purchaseMode}`;
      const existing = pools.get(key);
      if (existing) {
        existing.variants.push(variant);
        existing.maximumTagUnitPrice = Math.min(existing.maximumTagUnitPrice, variant.price / variant.baseQuantity);
      } else {
        pools.set(key, {
          ...variant,
          variants: [variant],
          maximumTagUnitPrice: variant.price / variant.baseQuantity,
        });
      }
    }
    return [...pools.values()];
  }, [variants]);
  const selectedVariant = useMemo(() => poolOptions.find((item) => String(item.id) === form.variantId), [form.variantId, poolOptions]);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const request = async (url, options) => {
    setError("");
    setMessage("");
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    setMessage("Tag Buy updated.");
    startTransition(() => router.refresh());
  };

  const create = async (event) => {
    event.preventDefault();
    try {
      await request("/api/admin/tag-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tagUnitPrice: Number(form.tagUnitPrice),
          minimumViableQuantity: Number(form.minimumViableQuantity),
          targetQuantity: Number(form.targetQuantity),
          maximumQuantity: Number(form.maximumQuantity),
          closesAt: new Date(form.closesAt).toISOString(),
          expectedProcurementAt: new Date(form.expectedProcurementAt).toISOString(),
          carryForwardBatchId: form.failurePolicy === "carry_forward" && form.carryForwardBatchId ? form.carryForwardBatchId : null,
        }),
      });
    } catch (cause) {
      setError(cause.message);
    }
  };

  const act = async (batch, action) => {
    try {
      if (action === "close") {
        await request(`/api/admin/tag-batches/${batch.id}/close`, { method: "POST" });
      } else {
        await request(`/api/admin/tag-batches/${batch.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: action }),
        });
      }
    } catch (cause) {
      setError(cause.message);
    }
  };

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <form onSubmit={create} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18, display: "grid", gap: 14 }}>
        <div><h2 style={{ margin: 0 }}>Create Tag Buy</h2><p style={{ color: "#64748b", marginBottom: 0 }}>Choose a product pool once. Every approved option using the same base unit contributes to one shared target, and each option&apos;s price is snapshotted when the round opens.</p></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <label style={label}>Product pool<select style={field} value={form.variantId} onChange={(e) => update("variantId", e.target.value)} required>{poolOptions.map((pool) => <option key={`${pool.marketId}:${pool.productId}:${pool.baseUnit}:${pool.purchaseMode}`} value={pool.id}>{pool.productName} · {pool.variants.length} option{pool.variants.length === 1 ? "" : "s"} · {pool.baseUnit}</option>)}</select></label>
          <label style={label}>Tag price per {selectedVariant?.baseUnit || "base unit"}<input style={field} type="number" min="0" max={selectedVariant?.maximumTagUnitPrice || undefined} step="0.01" value={form.tagUnitPrice} onChange={(e) => update("tagUnitPrice", e.target.value)} placeholder={selectedVariant ? `Below ${selectedVariant.maximumTagUnitPrice.toFixed(2)}` : ""} required /></label>
          <label style={label}>Minimum viable<input style={field} type="number" min="0.001" step="0.001" value={form.minimumViableQuantity} onChange={(e) => update("minimumViableQuantity", e.target.value)} required /></label>
          <label style={label}>Target<input style={field} type="number" min="0.001" step="0.001" value={form.targetQuantity} onChange={(e) => update("targetQuantity", e.target.value)} required /></label>
          <label style={label}>Maximum<input style={field} type="number" min="0.001" step="0.001" value={form.maximumQuantity} onChange={(e) => update("maximumQuantity", e.target.value)} required /></label>
          <label style={label}>Closes<input style={field} type="datetime-local" value={form.closesAt} onChange={(e) => update("closesAt", e.target.value)} required /></label>
          <label style={label}>Expected procurement<input style={field} type="datetime-local" value={form.expectedProcurementAt} onChange={(e) => update("expectedProcurementAt", e.target.value)} required /></label>
          <label style={label}>Failure policy<select style={field} value={form.failurePolicy} onChange={(e) => update("failurePolicy", e.target.value)}><option value="refund">Refund</option><option value="carry_forward">Carry forward</option></select></label>
          <label style={label}>Initial status<select style={field} value={form.status} onChange={(e) => update("status", e.target.value)}><option value="open">Open</option><option value="draft">Draft</option></select></label>
          {form.failurePolicy === "carry_forward" ? <label style={label}>Successor batch<select style={field} value={form.carryForwardBatchId} onChange={(e) => update("carryForwardBatchId", e.target.value)} required><option value="">Choose compatible draft/open batch</option>{batches.filter((batch) => ["draft", "open"].includes(batch.status) && String(batch.marketId) === String(selectedVariant?.marketId) && String(batch.productId) === String(selectedVariant?.productId) && String(batch.contributionUnit).toLowerCase() === String(selectedVariant?.baseUnit).toLowerCase()).map((batch) => <option key={batch.id} value={batch.id}>{batch.productName || batch.productId} · {batch.status}</option>)}</select></label> : null}
        </div>
        {selectedVariant ? <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Included options: {selectedVariant.variants.map((variant) => `${variant.name} (${variant.baseQuantity} ${variant.baseUnit})`).join(", ")}.</p> : null}
        <div><button type="submit" disabled={pending || !poolOptions.length} style={{ border: 0, borderRadius: 8, padding: "10px 16px", background: "#0f172a", color: "#fff", fontWeight: 700 }}>Create batch</button></div>
        {error ? <p role="alert" style={{ color: "#b91c1c", margin: 0 }}>{error}</p> : null}
        {message ? <p style={{ color: "#166534", margin: 0 }}>{message}</p> : null}
      </form>

      <div style={{ display: "grid", gap: 12 }}>
        {batches.map((batch) => (
          <article key={batch.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><strong>{batch.productName || `Product ${batch.productId}`}</strong><div style={{ color: "#64748b" }}>{batch.variantNames?.length ? batch.variantNames.join(", ") : batch.variantName || `Variant ${batch.variantId}`}</div></div><span style={{ fontWeight: 800, textTransform: "uppercase" }}>{batch.status}</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, color: "#334155" }}><span>{batch.variants?.length || 1} pooled option{(batch.variants?.length || 1) === 1 ? "" : "s"}</span><span>{batch.committedQuantity}/{batch.targetQuantity} {batch.contributionUnit} committed</span><span>{batch.reservedQuantity} {batch.contributionUnit} reserved</span><span>{batch.remainingQuantity} {batch.contributionUnit} remaining</span><span>{new Date(batch.closesAt).toLocaleString()}</span></div>
            <div style={{ height: 8, borderRadius: 999, overflow: "hidden", background: "#fde68a" }}><div style={{ width: `${Math.min(100, batch.progressPercent)}%`, height: "100%", background: "#d97706" }} /></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {batch.status === "draft" ? <button type="button" onClick={() => act(batch, "open")}>Open</button> : null}
              {batch.status === "open" ? <button type="button" onClick={() => act(batch, "close")}>Close and evaluate</button> : null}
              {batch.status === "procurement" ? <button type="button" onClick={() => act(batch, "fulfilled")}>Mark fulfilled</button> : null}
              {["draft", "open"].includes(batch.status) ? <button type="button" onClick={() => act(batch, "cancelled")}>Cancel</button> : null}
            </div>
          </article>
        ))}
        {!batches.length ? <p>No Tag Buys yet.</p> : null}
      </div>
    </div>
  );
}
