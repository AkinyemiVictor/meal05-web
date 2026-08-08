"use client";

import Image from "next/image";
import Link from "next/link";
import { IconArrowRight, IconMenu2, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import DeferredLocationPicker from "@/components/deferred-location-picker";
import styles from "@/app/landing.module.css";

const links = [
  ["#categories", "Categories"],
  ["#how", "How it works"],
  ["/shop", "Shop"],
  ["#reviews", "Reviews"],
  ["/landing#waitlist", "Waitlist"],
];

export default function LandingHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <header className={styles.header}>
      <div className={styles.navbar}>
        <Link href="#top" className={styles.logo} aria-label="Back to the top of the Meal05 landing page">
          <Image src="/assets/logo/MEAL05 NEW LOGO-01.png" alt="Meal05" width={142} height={50} priority />
        </Link>
        <nav aria-label="Primary navigation">
          {links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        <div className={styles.navActions}>
          <DeferredLocationPicker landing />
          <Link href="/sign-in" className={styles.signin}>Sign in</Link>
          <Link href="/home" className={styles.orangeButton}>Start shopping <IconArrowRight /></Link>
          <button
            type="button"
            className={styles.menuButton}
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <IconX /> : <IconMenu2 />}
          </button>
        </div>
      </div>
      <div id="landing-mobile-menu" className={`${styles.mobileMenu} ${open ? styles.mobileMenuOpen : ""}`}>
        <nav aria-label="Mobile navigation">
          {links.map(([href, label]) => <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>)}
        </nav>
        <div className={styles.mobileMenuActions}>
          <Link href="/sign-in" onClick={() => setOpen(false)}>Sign in</Link>
          <Link href="/home" onClick={() => setOpen(false)}>Start shopping <IconArrowRight /></Link>
        </div>
      </div>
    </header>
  );
}
