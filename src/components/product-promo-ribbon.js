"use client";

import { useEffect, useMemo, useState } from "react";
import { formatPromoCountdown, getProductPromoState } from "@/lib/product-promo";

export default function ProductPromoRibbon({ text, expiresAt, enabled = true, preview = false }) {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setMounted(true);
    setNow(Date.now());
    if (!expiresAt) return undefined;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const promo = useMemo(
    () =>
      getProductPromoState(
        { promoTagText: text, promoTagExpiresAt: expiresAt, promoTagEnabled: enabled },
        mounted ? now : 0
      ),
    [enabled, expiresAt, mounted, now, text]
  );

  if (!promo.text) return null;
  if (!preview && !promo.isEnabled) return null;
  if (!preview && mounted && !promo.isActive) return null;

  const countdown =
    mounted && promo.expiresMs && (preview || promo.isActive) ? formatPromoCountdown(promo.expiresMs, now) : "";

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: "58%",
        minHeight: 76,
        background: "#ff1308",
        color: "#fff36b",
        borderBottomLeftRadius: 56,
        borderTopRightRadius: 28,
        overflow: "hidden",
        pointerEvents: "none",
        boxShadow: "0 12px 26px rgba(185, 28, 28, 0.24)",
        zIndex: 2,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: -18,
          left: -26,
          width: 108,
          height: 108,
          background: "#ffffff",
          borderRadius: "0 0 999px 0",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "grid",
          justifyItems: "end",
          gap: 3,
          padding: "12px 16px 10px 48px",
          textAlign: "right",
        }}
      >
        <strong
          style={{
            display: "block",
            fontSize: 15,
            lineHeight: 1.05,
            fontWeight: 900,
            letterSpacing: "0.02em",
            textShadow: "0 2px 0 rgba(120, 10, 10, 0.28)",
          }}
        >
          {promo.text}
        </strong>
        {countdown ? (
          <span
            style={{
              display: "inline-block",
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(255, 255, 255, 0.16)",
              color: "#ffffff",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {countdown}
          </span>
        ) : null}
      </div>
    </div>
  );
}
