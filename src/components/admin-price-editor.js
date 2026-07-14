"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const formatCurrency = (value, currencyCode = "NGN") => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "N/A";
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currencyCode || "NGN",
      maximumFractionDigits: Number.isInteger(num) ? 0 : 2,
    }).format(num);
  } catch {
    return `₦${num.toLocaleString("en-NG")}`;
  }
};

const parsePrice = (value) => {
  const normalized = String(value || "").replace(/,/g, "").trim();
  if (!normalized) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
};

function VariantPriceField({ variant, product }) {
  const router = useRouter();
  const [value, setValue] = useState(String(variant.price || ""));
  const [savedPrice, setSavedPrice] = useState(Number(variant.price || 0));
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [needsConfirm, setNeedsConfirm] = useState(null);
  const [isPending, startTransition] = useTransition();

  const disabled = status === "saving" || isPending;
  const current = parsePrice(value);
  const changed = current != null && Number(current) !== Number(savedPrice);

  const savePrice = async ({ confirmed = false } = {}) => {
    const nextPrice = parsePrice(value);
    setMessage("");
    setNeedsConfirm(null);

    if (nextPrice == null) {
      setStatus("error");
      setMessage("Enter a price.");
      return;
    }

    if (Number(nextPrice) === Number(savedPrice)) {
      setStatus("idle");
      return;
    }

    setStatus("saving");
    try {
      const response = await fetch("/api/admin/prices/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          variant_id: variant.id,
          price: nextPrice,
          confirm_large_change: confirmed,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload?.requiresConfirmation) {
          setNeedsConfirm({
            nextPrice,
            reason: payload.error || "Confirm large change.",
          });
          setStatus("confirm");
          setMessage(payload.error || "Confirm large change.");
          return;
        }
        setStatus("error");
        setMessage(payload?.error || `Save failed (${response.status})`);
        return;
      }

      const updated = Number(payload?.variant?.price ?? nextPrice);
      setSavedPrice(updated);
      setValue(String(updated));
      setStatus("saved");
      setMessage("Saved");
      startTransition(() => router.refresh());
      window.setTimeout(() => {
        setStatus((currentStatus) => (currentStatus === "saved" ? "idle" : currentStatus));
        setMessage((currentMessage) => (currentMessage === "Saved" ? "" : currentMessage));
      }, 1400);
    } catch {
      setStatus("error");
      setMessage("Network error.");
    }
  };

  return (
    <div
      className={[
        "admin-price-field",
        status === "saved" ? "admin-price-field--saved" : "",
        status === "error" || status === "confirm" ? "admin-price-field--error" : "",
      ].filter(Boolean).join(" ")}
      data-variant-id={variant.id}
    >
      <div className="admin-price-field__meta">
        <p>{variant.label}</p>
        <span>
          Current {formatCurrency(savedPrice, variant.currencyCode)}
          {variant.unit ? ` / ${variant.unit}` : ""}
        </span>
      </div>
      <div className="admin-price-field__control">
        <span aria-hidden="true">₦</span>
        <input
          type="number"
          inputMode="decimal"
          min="50"
          step="1"
          data-price-input="true"
          data-product-id={product.id}
          data-variant-id={variant.id}
          value={value}
          disabled={disabled}
          aria-label={`Price for ${product.name} ${variant.label}`}
          onChange={(event) => {
            setValue(event.target.value);
            setStatus("idle");
            setMessage("");
            setNeedsConfirm(null);
          }}
          onBlur={() => {
            if (changed && !disabled) savePrice();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
              savePrice();
            }
          }}
        />
        <button
          type="button"
          disabled={!changed || disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => savePrice()}
        >
          {disabled ? "..." : "Save"}
        </button>
      </div>
      {needsConfirm ? (
        <div className="admin-price-field__confirm">
          <span>{needsConfirm.reason}</span>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => savePrice({ confirmed: true })}>
            Confirm {formatCurrency(needsConfirm.nextPrice, variant.currencyCode)}
          </button>
        </div>
      ) : null}
      {message && !needsConfirm ? (
        <p className="admin-price-field__message" aria-live="polite">
          {status === "saved" ? "✓ " : ""}
          {message}
        </p>
      ) : null}
    </div>
  );
}

export default function AdminPriceEditor({ groups = [], totalProducts = 0, totalVariants = 0 }) {
  const hasRows = totalProducts > 0 && groups.some((group) => group.products.length);
  const productCountLabel = useMemo(
    () => `${totalProducts.toLocaleString("en-NG")} volatile products · ${totalVariants.toLocaleString("en-NG")} active variants`,
    [totalProducts, totalVariants]
  );

  return (
    <main className="admin-price-page">
      <header className="admin-price-page__header">
        <div>
          <p>Fast price updates</p>
          <h1>Market Price Board</h1>
          <span>{productCountLabel}</span>
        </div>
      </header>

      {!hasRows ? (
        <section className="admin-price-empty">
          <h2>No volatile products yet</h2>
          <p>Products appear here after `is_price_volatile` is enabled. Do not enable real products until the data task is ready.</p>
        </section>
      ) : null}

      <div className="admin-price-groups">
        {groups.map((group) => (
          <section key={group.slug} className="admin-price-group">
            <div className="admin-price-group__heading">
              <h2>{group.name}</h2>
              <span>{group.products.length} products</span>
            </div>
            <div className="admin-price-products">
              {group.products.map((product) => (
                <article key={product.id} className="admin-price-product">
                  <div className="admin-price-product__heading">
                    <div>
                      <h3>{product.name}</h3>
                      <span>
                        {product.lastChangedAt
                          ? `Last changed ${new Date(product.lastChangedAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}`
                          : "No price history yet"}
                      </span>
                    </div>
                    <a href={`/products/${product.slug}`} target="_blank" rel="noreferrer">View</a>
                  </div>
                  <div className="admin-price-product__variants">
                    {product.variants.map((variant) => (
                      <VariantPriceField key={variant.id} product={product} variant={variant} />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
