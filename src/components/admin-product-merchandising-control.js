"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PRODUCT_MERCHANDISING_FLAGS } from "@/lib/product-merchandising";

const buildFormState = ({
  is_featured = false,
  is_hidden = false,
  is_bestseller = false,
  is_new_arrival = false,
  is_homepage_pick = false,
  is_bundle_eligible = false,
} = {}) => ({
  is_featured: is_featured === true,
  is_hidden: is_hidden === true,
  is_bestseller: is_bestseller === true,
  is_new_arrival: is_new_arrival === true,
  is_homepage_pick: is_homepage_pick === true,
  is_bundle_eligible: is_bundle_eligible === true,
});

export default function AdminProductMerchandisingControl({
  productId,
  productName,
  is_featured = false,
  is_hidden = false,
  is_bestseller = false,
  is_new_arrival = false,
  is_homepage_pick = false,
  is_bundle_eligible = false,
}) {
  const router = useRouter();
  const initialState = buildFormState({
    is_featured,
    is_hidden,
    is_bestseller,
    is_new_arrival,
    is_homepage_pick,
    is_bundle_eligible,
  });
  const initialKey = PRODUCT_MERCHANDISING_FLAGS.map((flag) => (initialState[flag.field] ? "1" : "0")).join("");
  const [form, setForm] = useState(initialState);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  const disabled = isSaving || isPending;

  useEffect(() => {
    setForm(
      buildFormState({
        is_featured,
        is_hidden,
        is_bestseller,
        is_new_arrival,
        is_homepage_pick,
        is_bundle_eligible,
      })
    );
    setError("");
    setOk("");
  }, [initialKey, is_bestseller, is_bundle_eligible, is_featured, is_hidden, is_homepage_pick, is_new_arrival, productId]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setOk("");

    if (!productId) {
      setError("Missing product id.");
      return;
    }

    const changed = PRODUCT_MERCHANDISING_FLAGS.some((flag) => form[flag.field] !== initialState[flag.field]);
    if (!changed) {
      setError("No change selected.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/products/merchandising/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          ...PRODUCT_MERCHANDISING_FLAGS.reduce(
            (payload, flag) => ({ ...payload, [flag.field]: form[flag.field] === true }),
            {}
          ),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || `Request failed (${response.status})`);
        return;
      }

      setOk("Merchandising saved.");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Network error. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 8, minWidth: 320 }}>
      <div style={{ display: "grid", gap: 6 }}>
        {PRODUCT_MERCHANDISING_FLAGS.map((flag) => (
          <label key={flag.field} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={form[flag.field] === true}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  [flag.field]: event.target.checked,
                }))
              }
              disabled={disabled}
              aria-label={`${flag.label} for ${productName}`}
            />
            <span style={{ color: "#0f172a", fontSize: 12, fontWeight: 600 }}>{flag.label}</span>
          </label>
        ))}
      </div>

      <button
        type="submit"
        disabled={disabled}
        style={{
          justifySelf: "start",
          border: "1px solid #0f172a",
          borderRadius: 6,
          background: "#0f172a",
          color: "#ffffff",
          padding: "6px 10px",
          fontSize: 12,
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.7 : 1,
        }}
      >
        {disabled ? "Saving..." : "Save Flags"}
      </button>

      {error ? <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span> : null}
      {!error && ok ? <span style={{ color: "#166534", fontSize: 12 }}>{ok}</span> : null}
    </form>
  );
}
