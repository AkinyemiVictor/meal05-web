"use client";

import Link from "next/link";
import { IconMapPin } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { LOCATION_EVENT, readStoredLocationPreference } from "@/lib/location-preferences";

export default function DeferredLocationPicker({ landing = false, mobileHeader = false, iconOnly = false }) {
  const [label, setLabel] = useState("Select location");

  useEffect(() => {
    const sync = (event) => {
      const preference = event?.detail?.preference ?? readStoredLocationPreference();
      setLabel(preference?.serviceable ? preference.line || preference.zone?.name || "Selected location" : "Select location");
    };

    sync();
    window.addEventListener(LOCATION_EVENT, sync);
    return () => window.removeEventListener(LOCATION_EVENT, sync);
  }, []);

  const buttonClassName = iconOnly
    ? "grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[#e3e8ef] bg-white text-[#0b172a] shadow-[0_2px_8px_rgba(11,23,42,0.04)] transition hover:border-meal-green focus-visible:border-meal-green focus-visible:outline-none"
    : mobileHeader
    ? "flex h-12 w-full min-w-0 items-center gap-2 rounded-2xl border border-[#e3e8ef] bg-white px-2.5 text-left text-[13px] font-bold leading-tight text-[#0b172a] shadow-[0_2px_8px_rgba(11,23,42,0.04)] transition hover:border-meal-green focus-visible:border-meal-green focus-visible:outline-none"
    : landing
      ? "inline-flex items-center gap-2 rounded-[14px] border-0 bg-transparent px-2 py-2 text-[13px] font-bold leading-tight text-[#4b4f58] shadow-none transition hover:text-meal-green max-[1080px]:border max-[1080px]:border-white/55 max-[1080px]:bg-black/15 max-[1080px]:text-white max-[1080px]:hover:border-white max-[1080px]:hover:bg-black/25"
      : "inline-flex items-center gap-2 rounded-[14px] border border-[#e3e8ef] bg-white px-3 py-2 text-[13px] font-bold leading-tight text-[#0b172a] shadow-[0_2px_8px_rgba(11,23,42,0.04)] transition hover:border-meal-green focus-visible:border-meal-green focus-visible:outline-none";
  const visibleLabel = label?.length > 24 ? `${label.slice(0, 24)}...` : label;

  return (
    <Link href="/location" className={buttonClassName} aria-label="Select delivery location">
      <IconMapPin size={iconOnly ? 19 : 17} className="shrink-0 text-meal-green max-[1080px]:text-current" aria-hidden="true" />
      {!iconOnly ? <span className={mobileHeader ? "min-w-0 truncate" : landing ? "max-[720px]:hidden" : undefined}>{visibleLabel}</span> : null}
    </Link>
  );
}
