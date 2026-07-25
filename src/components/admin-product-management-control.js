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

const IMAGE_VARIANTS = [
  { key: "thumb", maxDimension: 280, targetBytes: 60 * 1024, quality: 0.82 },
  { key: "card", maxDimension: 640, targetBytes: 150 * 1024, quality: 0.82 },
  { key: "detail", maxDimension: 1400, targetBytes: 420 * 1024, quality: 0.86 },
];

const loadBrowserImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image."));
    };
    img.src = url;
  });

const canvasToWebp = (canvas, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("This browser could not create a WebP image."));
      },
      "image/webp",
      quality
    );
  });

const createImageVariant = async (image, { maxDimension, targetBytes, quality }) => {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("Image dimensions could not be detected.");
  }

  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image canvas is not available.");
  context.drawImage(image, 0, 0, width, height);

  let nextQuality = quality;
  let blob = await canvasToWebp(canvas, nextQuality);
  while (blob.size > targetBytes && nextQuality > 0.62) {
    nextQuality = Math.max(0.62, nextQuality - 0.06);
    blob = await canvasToWebp(canvas, nextQuality);
  }
  return blob;
};

const formatBytes = (bytes) => {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "0 KB";
  return `${Math.max(1, Math.round(value / 1024))} KB`;
};

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
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadInfo, setImageUploadInfo] = useState("");
  const [isPending, startTransition] = useTransition();
  const disabled = isSaving || isPending || isUploadingImage;

  useEffect(() => {
    setForm(initial);
    setError("");
    setOk("");
    setImageUploadInfo("");
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

  const uploadProductImage = async (file) => {
    setError("");
    setOk("");
    setImageUploadInfo("");

    if (!productId) {
      setError("Missing product id.");
      return;
    }
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Image must be 8 MB or smaller.");
      return;
    }

    setIsUploadingImage(true);
    try {
      const image = await loadBrowserImage(file);
      const variants = {};
      for (const variant of IMAGE_VARIANTS) {
        variants[variant.key] = await createImageVariant(image, variant);
      }

      const formData = new FormData();
      formData.append("productId", String(productId));
      formData.append("original", file, file.name || "original");
      Object.entries(variants).forEach(([key, blob]) => {
        formData.append(key, blob, `${key}.webp`);
      });

      const response = await fetch("/api/admin/products/images/normalize", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || `Image upload failed (${response.status})`);
        return;
      }

      const nextImageUrl = normalizeText(payload?.image?.cardUrl || payload?.image?.originalUrl || "");
      if (nextImageUrl) {
        update("imageUrl", nextImageUrl);
      }
      const bytes = payload?.bytes || {};
      setImageUploadInfo(
        `Variants saved: thumb ${formatBytes(bytes.thumb)}, card ${formatBytes(bytes.card)}, detail ${formatBytes(bytes.detail)}.`
      );
      setOk("Product image normalized.");
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err?.message || "Image upload failed.");
    } finally {
      setIsUploadingImage(false);
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

      <label style={{ display: "grid", gap: 4, justifyItems: "start" }}>
        <span style={fieldLabelStyle}>Normalize product image</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          aria-label={`Upload normalized image for ${productName}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) uploadProductImage(file);
          }}
          style={{ maxWidth: "100%", fontSize: 12 }}
        />
      </label>

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
        {isUploadingImage ? "Uploading Image..." : disabled ? "Saving..." : "Save Product"}
      </button>

      {error ? <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span> : null}
      {imageUploadInfo ? <span style={{ color: "#475569", fontSize: 12 }}>{imageUploadInfo}</span> : null}
      {!error && ok ? <span style={{ color: "#166534", fontSize: 12 }}>{ok}</span> : null}
    </form>
  );
}
