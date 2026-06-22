"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const fieldLabelStyle = {
  color: "#475569",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const normalizeText = (value) => String(value || "").trim();

export default function AdminProductManagementControl({
  productId,
  productName,
  inSeason = true,
  productActive = true,
  categoryId = "",
  imageUrl = "",
  isBundleEligible = false,
  categories = [],
}) {
  const router = useRouter();
  const initial = useMemo(
    () => ({
      season: inSeason ? "in" : "out",
      active: productActive ? "active" : "inactive",
      categoryId: categoryId == null ? "" : String(categoryId),
      imageUrl: normalizeText(imageUrl),
      bundleEligible: isBundleEligible === true,
    }),
    [categoryId, imageUrl, inSeason, isBundleEligible, productActive]
  );

  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const disabled = isSaving || isPending;

  useEffect(() => {
    setForm(initial);
    setError("");
    setOk("");
  }, [initial]);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setOk("");

    if (!productId) {
      setError("Missing product id.");
      return;
    }

    const nextCategoryId = normalizeText(form.categoryId);
    if (!nextCategoryId) {
      setError("Choose a category.");
      return;
    }

    const nextImageUrl = normalizeText(form.imageUrl);
    const requestBody = { product_id: productId };

    if ((form.season === "in") !== (initial.season === "in")) {
      requestBody.in_season = form.season === "in";
    }
    if ((form.active === "active") !== (initial.active === "active")) {
      requestBody.is_active = form.active === "active";
    }
    if (nextCategoryId !== initial.categoryId) {
      requestBody.category_id = nextCategoryId;
    }
    if (nextImageUrl !== initial.imageUrl) {
      requestBody.image_url = nextImageUrl || null;
    }
    if (form.bundleEligible !== initial.bundleEligible) {
      requestBody.is_bundle_eligible = form.bundleEligible === true;
    }

    if (Object.keys(requestBody).length === 1) {
      setError("No change selected.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/products/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || `Request failed (${response.status})`);
        return;
      }

      setOk("Product updated.");
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
    <form onSubmit={submit} style={{ display: "grid", gap: 8, minWidth: 420, maxWidth: 560 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={fieldLabelStyle}>Season</span>
          <select
            value={form.season}
            onChange={(event) => update("season", event.target.value)}
            disabled={disabled}
            aria-label={`Season for ${productName}`}
            style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12 }}
          >
            <option value="in">In Season</option>
            <option value="out">Out Of Season</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={fieldLabelStyle}>Product</span>
          <select
            value={form.active}
            onChange={(event) => update("active", event.target.value)}
            disabled={disabled}
            aria-label={`Product availability for ${productName}`}
            style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12 }}
          >
            <option value="active">Available</option>
            <option value="inactive">Unavailable</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={fieldLabelStyle}>Category</span>
          <select
            value={form.categoryId}
            onChange={(event) => update("categoryId", event.target.value)}
            disabled={disabled}
            aria-label={`Category for ${productName}`}
            style={{ minWidth: 180, border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12 }}
          >
            <option value="">Choose category</option>
            {categories.map((category) => (
              <option key={category.id} value={String(category.id)}>
                {category.label || category.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: 4, flex: "1 1 280px" }}>
          <span style={fieldLabelStyle}>Image URL or path</span>
          <input
            type="text"
            value={form.imageUrl}
            onChange={(event) => update("imageUrl", event.target.value)}
            disabled={disabled}
            aria-label={`Image URL for ${productName}`}
            placeholder="/assets/img/product-placeholder.svg"
            style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12 }}
          />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 6 }}>
          <input
            type="checkbox"
            checked={form.bundleEligible}
            onChange={(event) => update("bundleEligible", event.target.checked)}
            disabled={disabled}
            aria-label={`Bundle eligible for ${productName}`}
          />
          <span style={{ color: "#0f172a", fontSize: 12, fontWeight: 600 }}>Bundle Eligible</span>
        </label>
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
        {disabled ? "Saving..." : "Save Product"}
      </button>

      {error ? <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span> : null}
      {!error && ok ? <span style={{ color: "#166534", fontSize: 12 }}>{ok}</span> : null}
    </form>
  );
}
