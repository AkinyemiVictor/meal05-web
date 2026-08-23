"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_AVAILABILITY_SETTINGS,
  formatAvailabilityDuration,
  normalizeAvailabilitySettingsRecord,
} from "@/lib/availability-settings";

let cachedTiming = null;
let timingPromise = null;

const loadTiming = async () => {
  if (cachedTiming) return cachedTiming;
  if (!timingPromise) {
    timingPromise = fetch("/api/availability-settings")
      .then(async (response) => {
        if (!response.ok) throw new Error("Availability timing unavailable");
        return response.json();
      })
      .then((payload) => {
        cachedTiming = normalizeAvailabilitySettingsRecord(payload);
        return cachedTiming;
      })
      .catch(() => normalizeAvailabilitySettingsRecord(DEFAULT_AVAILABILITY_SETTINGS))
      .finally(() => {
        timingPromise = null;
      });
  }
  return timingPromise;
};

const formatTypicalWindow = (slaMinutes) => {
  const max = Number(slaMinutes) || DEFAULT_AVAILABILITY_SETTINGS.confirmationSlaMinutes;
  if (max <= 15) return `Usually confirmed within ${formatAvailabilityDuration(max)}.`;
  if (max <= 45) return `Usually confirmed within 15–${max} minutes.`;
  return "Usually confirmed within 15–45 minutes.";
};

export default function AvailabilityRequestNotice({ compact = false }) {
  const [timing, setTiming] = useState(() =>
    normalizeAvailabilitySettingsRecord(DEFAULT_AVAILABILITY_SETTINGS)
  );

  useEffect(() => {
    let active = true;
    loadTiming().then((next) => {
      if (active) setTiming(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const typicalText = useMemo(
    () => formatTypicalWindow(timing.confirmationSlaMinutes),
    [timing.confirmationSlaMinutes]
  );
  const maximumText = useMemo(
    () => formatAvailabilityDuration(timing.confirmationSlaMinutes),
    [timing.confirmationSlaMinutes]
  );

  return (
    <div className={`availability-request-notice${compact ? " is-compact" : ""}`} role="note">
      <div className="availability-request-notice__heading">
        <span className="availability-request-notice__eyebrow">Check availability</span>
        <strong>Confirmed before payment</strong>
      </div>
      <p className="availability-request-notice__timing">{typicalText}</p>
      <p>
        No payment is taken yet. You don’t need to wait on this page—we’ll notify you as soon as the item is confirmed so you can return and complete your order.
      </p>
      <p className="availability-request-notice__maximum">
        In some cases, confirmation may take up to {maximumText} during business hours.
      </p>
    </div>
  );
}
