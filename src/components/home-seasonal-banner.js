"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  IconArrowRight,
  IconClockHour4,
  IconLeaf,
} from "@tabler/icons-react";
import { prefetchShop } from "@/lib/shop-prefetch";

const BANNER_CONTENT_WIDTH = 1200;
const LEAF_IMAGES = {
  top: "/assets/billboard/leaf 12.png",
  bottom: "/assets/billboard/leaf 4.png",
  right: "/assets/billboard/leaf 10.png",
};
const MARKET_MAN_IMAGE = "/assets/img/meal05 - store man.png";

export default function HomeSeasonalBanner() {
  const canvasRef = useRef(null);
  const router = useRouter();

  const prepareShop = useCallback(() => {
    void prefetchShop(router);
  }, [router]);

  useEffect(() => {
    const run = () => prepareShop();
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(run, { timeout: 1000 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = window.setTimeout(run, 200);
    return () => window.clearTimeout(timer);
  }, [prepareShop]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const applyContentScale = () => {
      const width = canvas.clientWidth || BANNER_CONTENT_WIDTH;
      const scale = Math.min(1, width / BANNER_CONTENT_WIDTH);
      canvas.style.setProperty("--welcome-content-scale", String(scale));
    };

    applyContentScale();
    const observer = new ResizeObserver(applyContentScale);
    observer.observe(canvas);
    window.addEventListener("resize", applyContentScale);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", applyContentScale);
    };
  }, []);

  return (
    <section
      ref={canvasRef}
      className="welcome-banner welcome-banner--seasonal"
      aria-labelledby="welcome-banner-title"
    >
      <div className="welcome-seasonal__glow welcome-seasonal__glow--green" aria-hidden="true" />
      <div className="welcome-seasonal__glow welcome-seasonal__glow--orange" aria-hidden="true" />
      <div className="welcome-seasonal__dots" aria-hidden="true" />

      <div className="welcome-seasonal__viewport">
        <div className="welcome-seasonal__content">
          <span className="welcome-seasonal__leaf welcome-seasonal__leaf--top" aria-hidden="true">
            <Image src={LEAF_IMAGES.top} alt="" width={108} height={81} className="welcome-seasonal__leaf-image" />
          </span>
          <span className="welcome-seasonal__leaf welcome-seasonal__leaf--bottom" aria-hidden="true">
            <Image src={LEAF_IMAGES.bottom} alt="" width={97} height={57} className="welcome-seasonal__leaf-image" />
          </span>
          <span className="welcome-seasonal__leaf welcome-seasonal__leaf--right" aria-hidden="true">
            <Image src={LEAF_IMAGES.right} alt="" width={54} height={35} className="welcome-seasonal__leaf-image" />
          </span>

          <div className="welcome-seasonal__copy">
            <span className="welcome-seasonal__pill">
              <i><IconLeaf /></i>
              welcome . fresh groceries
            </span>
            <h2 id="welcome-banner-title">
              Market fresh groceries,<br />
              <em>delivered</em>
            </h2>
            <p>
              Less market stress. Less price wahala . More time for what matters. Get your groceries easier with Meal05.
            </p>
            <div className="welcome-seasonal__actions">
              <Link
                href="/shop"
                onPointerEnter={prepareShop}
                onFocus={prepareShop}
                onTouchStart={prepareShop}
              >
                Go to shop
                <i><IconArrowRight /></i>
              </Link>
              <span><IconClockHour4 /> New harvest every Monday</span>
            </div>
          </div>

          <div className="welcome-seasonal__art">
            <Image
              src={MARKET_MAN_IMAGE}
              alt="Meal05 market assistant with a basket of fresh groceries"
              fill
              priority
              sizes="(max-width: 620px) 42vw, 430px"
              className="welcome-seasonal__art-image"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
