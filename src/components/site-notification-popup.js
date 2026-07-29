"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

const DISMISSED_PREFIX = "meal05_site_notification_dismissed";

const buildDismissKey = (notification) =>
  `${DISMISSED_PREFIX}:${notification?.id || "unknown"}:${notification?.updatedAt || notification?.createdAt || ""}`;

export default function SiteNotificationPopup() {
  const pathname = usePathname();
  const [notification, setNotification] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  const shouldSkip = useMemo(() => {
    const path = String(pathname || "");
    return path.startsWith("/admin") || path.startsWith("/checkout/payment");
  }, [pathname]);

  useEffect(() => {
    if (shouldSkip) {
      setNotification(null);
      return undefined;
    }

    const controller = new AbortController();
    fetch("/api/site-notification", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const next = payload?.notification || null;
        if (!next) {
          setNotification(null);
          return;
        }
        const key = buildDismissKey(next);
        const wasDismissed = typeof window !== "undefined" && window.sessionStorage?.getItem(key) === "1";
        setDismissed(wasDismissed);
        setNotification(next);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [shouldSkip]);

  if (!notification || dismissed) return null;

  const dismiss = () => {
    try {
      window.sessionStorage?.setItem(buildDismissKey(notification), "1");
    } catch {}
    setDismissed(true);
  };

  return (
    <aside
      className={`site-notification-popup site-notification-popup--${notification.severity || "warning"}`}
      role="status"
      aria-live="polite"
    >
      <div className="site-notification-popup__body">
        <strong>{notification.title}</strong>
        <p>{notification.body}</p>
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss notification">
        <i className="fa-solid fa-xmark" aria-hidden="true" />
      </button>
    </aside>
  );
}
