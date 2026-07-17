"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const SPLASH_STORAGE_KEY = "meal05_launch_splash_seen";

export default function AppLaunchSplash() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isInstalledWebApp =
      (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;

    if (!isInstalledWebApp || prefersReducedMotion || window.sessionStorage?.getItem(SPLASH_STORAGE_KEY) === "1") {
      if (isInstalledWebApp) window.sessionStorage?.setItem(SPLASH_STORAGE_KEY, "1");
      setVisible(false);
      return;
    }

    setVisible(true);

    const exitTimer = window.setTimeout(() => setLeaving(true), 1850);
    const removeTimer = window.setTimeout(() => {
      window.sessionStorage?.setItem(SPLASH_STORAGE_KEY, "1");
      setVisible(false);
    }, 2300);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={`app-launch-splash${leaving ? " app-launch-splash--leaving" : ""}`} aria-hidden="true">
      <Image
        src="/assets/logo/MEAL05 NEW LOGO-01.png"
        alt=""
        width={250}
        height={92}
        priority
        className="app-launch-splash__logo"
      />
    </div>
  );
}
