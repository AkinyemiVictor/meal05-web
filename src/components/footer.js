"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { buildSignInHref } from "@/lib/auth-redirect";
import { shouldShowCommerceFooter } from "@/lib/commerce-chrome";
import { BRAND_MARK_SRC, BRAND_WORDMARK_DARK_SRC } from "@/lib/theme-logo";
import { useCartHasItems } from "@/lib/use-cart-has-items";
import NewsletterSignup from "@/components/newsletter-signup";

export default function Footer() {
  const pathname = usePathname();
  const isCartPath = pathname === "/cart";
  const cartHasItems = useCartHasItems(isCartPath);
  const [locationSearch, setLocationSearch] = useState("");
  useEffect(() => {
    setLocationSearch(window.location.search || "");
  }, [pathname]);
  if (!shouldShowCommerceFooter(pathname)) return null;
  if (isCartPath && cartHasItems !== true) return null;
  const currentPathForAuth = `${pathname || "/"}${locationSearch}`;
  const loginHref = buildSignInHref({ tab: "login", next: currentPathForAuth, hash: "loginForm" });

  const year = new Date().getFullYear();

  return (
    <footer className="site-footer site-footer--primary">
      <div className="footer-container">
        <div className="footer-hero">
          <div className="footer-brand">
            <span className="footer-logo">
              <Image
                className="footer-logo-img"
                src={BRAND_WORDMARK_DARK_SRC}
                alt="Meal05 logo"
                onError={(event) => {
                  const logo = event?.currentTarget;
                  if (!logo || logo.dataset.logoFallbackApplied === "true") return;
                  logo.dataset.logoFallbackApplied = "true";
                  logo.src = BRAND_MARK_SRC;
                }}
                width={190}
                height={40}
                sizes="(max-width: 768px) 160px, 190px"
                loading="lazy"
              />
            </span>
            <p className="footer-desc">
              Fresh food logistics, market insights, and doorstep convenience for kitchens across Nigeria.
            </p>
            <div className="social-icons">
              <a href="#" aria-label="Facebook">
                <Image src="/assets/icons/png/socials/facebook.png" alt="Facebook" width={24} height={24} loading="lazy" />
              </a>
              <a href="https://x.com/mealkit_nigeria" target="_blank" rel="noreferrer" aria-label="X">
                <Image src="/assets/icons/png/socials/x.png" alt="X" width={24} height={24} loading="lazy" />
              </a>
              <a href="#" aria-label="Pinterest">
                <Image src="/assets/icons/png/socials/pinterest.png" alt="Pinterest" width={24} height={24} loading="lazy" />
              </a>
              <a href="#" aria-label="Instagram">
                <Image src="/assets/icons/png/socials/instagram.png" alt="Instagram" width={24} height={24} loading="lazy" />
              </a>
              <a href="#" aria-label="Google">
                <Image src="/assets/icons/png/socials/google.png" alt="Google" width={24} height={24} loading="lazy" />
              </a>
            </div>
          </div>

          <NewsletterSignup />
        </div>

        <div className="footer-links footer-links-grid">
          <div className="link-group">
            <h3>Company</h3>
            <ul>
              <li>
                <Link href="/about-us">About Us</Link>
              </li>
              <li>
                <Link href="/blog">Blog</Link>
              </li>
              <li>
                <Link href="/contact-us">Contact Us</Link>
              </li>
              <li>
                <Link href="/career">Career</Link>
              </li>
            </ul>
          </div>
          <div className="link-group">
            <h3>Customer Services</h3>
            <ul>
              <li>
                <Link href={loginHref}>My Account</Link>
              </li>
              <li>
                <Link href="/account/orders">Track Your Order</Link>
              </li>
              <li>
                <Link href="/help-center#searchQnAAgent">Return</Link>
              </li>
              <li>
                <Link href="/help-center">FAQ</Link>
              </li>
              <li>
                <Link href="/admin/login">Admin Login</Link>
              </li>
            </ul>
          </div>
          <div className="link-group">
            <h3>Our Information</h3>
            <ul>
              <li>
                <Link href="/privacy">Privacy</Link>
              </li>
              <li>
                <Link href="/terms">Terms &amp; Conditions</Link>
              </li>
              <li>
                <Link href="/delivery-policy">Delivery Policy</Link>
              </li>
              <li>
                <Link href="/help-center#searchQnAAgent">Return Policy</Link>
              </li>
            </ul>
          </div>
          <div className="link-group">
            <h3>Contact</h3>
            <ul>
              <li>
                <a href="tel:+23408118287047">+234 (0) 811 828 7047</a>
              </li>
              <li>
                <a href="mailto:hello@meal05.com">hello@meal05.com</a>
              </li>
              <li>
                <Link href="/rider">Rider Portal</Link>
              </li>
              <li>No 8, Bel Air Estate<br />Akala Expressway, Ibadan</li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {year} Meal05. All rights reserved.</p>
          <div className="footer-choose">
            <label className="footer-select">
              <span className="footer-select__label">Language</span>
              <select defaultValue="English">
                <option>English</option>
                <option>French</option>
              </select>
            </label>
            <label className="footer-select">
              <span className="footer-select__label">Currency</span>
              <select defaultValue="NGN">
                <option>NGN</option>
                <option>USD</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    </footer>
  );
}
