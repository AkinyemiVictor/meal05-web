"use client";

import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import {
  IconArrowRight,
  IconClockHour4,
  IconLeaf,
} from "@tabler/icons-react";

const BANNER_CONTENT_WIDTH = 1200;
const LEAVES_IMAGE =
  "/assets/img/Floating_Leaves_Transparent_Background__Floating_Leaves__Flying_Leaves__Flying_Leaves_Transparent_PNG_Transparent_Clipart_Image_and_PSD_File_for_Free_Download-removebg-preview.png";
const MARKET_MAN_IMAGE = "/assets/img/meal05 - store man.png";

export default function HomeSeasonalBanner() {
  const canvasRef = useRef(null);

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
            <Image src={LEAVES_IMAGE} alt="" width={360} height={360} className="welcome-seasonal__leaf-image welcome-seasonal__leaf-image--top" />
          </span>
          <span className="welcome-seasonal__leaf welcome-seasonal__leaf--bottom" aria-hidden="true">
            <Image src={LEAVES_IMAGE} alt="" width={360} height={360} className="welcome-seasonal__leaf-image welcome-seasonal__leaf-image--bottom" />
          </span>
          <span className="welcome-seasonal__leaf welcome-seasonal__leaf--right" aria-hidden="true">
            <Image src={LEAVES_IMAGE} alt="" width={360} height={360} className="welcome-seasonal__leaf-image welcome-seasonal__leaf-image--right" />
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
              <Link href="/shop">
                Shop seasonal picks
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
