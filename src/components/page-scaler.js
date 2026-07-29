"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const SCALE_TRIGGER_WIDTH = 620;
const SCALE_BASE_WIDTH = 620;
const SCALE_BASE_HEIGHT = 900;
const MIN_SCALE = 0.35;
const MAX_SCALE = 1;
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function PageScaler({ children }) {
  const pathname = usePathname();
  const innerRef = useRef(null);
  const disableScaling = pathname === "/checkout/payment" || pathname?.startsWith("/checkout/payment/");
  const [scaleState, setScaleState] = useState({
    scale: 1,
    scaledDocHeight: null,
    isScaling: false,
  });

  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (disableScaling) {
      setScaleState({ scale: 1, scaledDocHeight: null, isScaling: false });
      return undefined;
    }

    let rafId = 0;

    const measure = () => {
      const inner = innerRef.current;
      const width = window.innerWidth;
      const shouldScale = width <= SCALE_TRIGGER_WIDTH;

      if (!shouldScale) {
        setScaleState({ scale: 1, scaledDocHeight: null, isScaling: false });
        return;
      }

      if (!inner) return;

      const widthScale = width / SCALE_BASE_WIDTH;
      const nextScale = clamp(Math.min(widthScale, MAX_SCALE), MIN_SCALE, MAX_SCALE);
      const contentHeight = inner.scrollHeight || inner.getBoundingClientRect().height || SCALE_BASE_HEIGHT;
      const nextHeight = Math.max(window.innerHeight, Math.ceil(contentHeight * nextScale));
      setScaleState({
        scale: nextScale,
        scaledDocHeight: `${nextHeight}px`,
        isScaling: true,
      });
    };

    const scheduleMeasure = () => {
      cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);

    if (typeof ResizeObserver === "undefined") {
      return () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener("resize", scheduleMeasure);
      };
    }

    const resizeObserver = new ResizeObserver(scheduleMeasure);
    if (innerRef.current) resizeObserver.observe(innerRef.current);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [disableScaling]);

  const style = scaleState.isScaling
    ? {
        "--page-scale": String(scaleState.scale),
        "--page-scaled-doc-height": scaleState.scaledDocHeight,
      }
    : undefined;

  return (
    <div
      className={`page-scale-outer${disableScaling ? " page-scale-outer--no-scale" : ""}`}
      style={style}
    >
      <div
        ref={innerRef}
        className={`page-scale-inner${disableScaling ? " page-scale-inner--no-scale" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}
