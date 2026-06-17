"use client";

import { useEffect, useState } from "react";
import { DEFAULT_DELIVERY_SETTINGS, normalizeDeliverySettingsRecord } from "@/lib/delivery-settings";

let cachedSettings = null;

export default function useDeliverySettings() {
  const [settings, setSettings] = useState(() => cachedSettings || { ...DEFAULT_DELIVERY_SETTINGS });
  const [status, setStatus] = useState(cachedSettings ? "ready" : "loading");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (cachedSettings) {
        setSettings(cachedSettings);
        setStatus("ready");
        return;
      }

      setStatus("loading");
      try {
        const response = await fetch("/api/delivery-settings", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const next = normalizeDeliverySettingsRecord(payload?.settings);
        cachedSettings = next;
        if (!cancelled) {
          setSettings(next);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setSettings({ ...DEFAULT_DELIVERY_SETTINGS });
          setStatus("error");
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { settings, status };
}
