"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconCircleCheck, IconShoppingBag } from "@tabler/icons-react";

import { CART_ADDED_EVENT } from "@/lib/cart-storage";

const DISMISS_AFTER_MS = 2400;

const getMessage = (items) => {
  const additions = Array.isArray(items) ? items : [];
  if (additions.length > 1) return additions.length + " items added to cart";
  const itemName = String(additions[0]?.name || additions[0]?.productName || "").trim();
  return itemName ? itemName + " added to cart" : "Added to cart";
};

export default function CartFeedbackBar() {
  const [message, setMessage] = useState("");
  const timeoutRef = useRef(null);

  useEffect(() => {
    const dismiss = () => {
      setMessage("");
      timeoutRef.current = null;
    };
    const handleAdded = (event) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setMessage(getMessage(event?.detail?.items));
      timeoutRef.current = setTimeout(dismiss, DISMISS_AFTER_MS);
    };

    window.addEventListener(CART_ADDED_EVENT, handleAdded);
    return () => {
      window.removeEventListener(CART_ADDED_EVENT, handleAdded);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!message) return null;

  return (
    <aside className="cart-feedback-bar" role="status" aria-live="polite">
      <IconCircleCheck size={20} stroke={2.2} aria-hidden="true" />
      <span>{message}</span>
      <Link href="/cart" prefetch={false}>
        <IconShoppingBag size={17} stroke={2} aria-hidden="true" />
        View cart
      </Link>
    </aside>
  );
}
