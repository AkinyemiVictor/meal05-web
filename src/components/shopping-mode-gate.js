"use client";

import { IconBuildingStore, IconHome } from "@tabler/icons-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { useShoppingMode } from "@/lib/shopping-mode-client";

const SHOPPING_PATHS = ["/", "/landing", "/home", "/shop", "/categories", "/section", "/products", "/search", "/cart"];

const isShoppingPath = (pathname) =>
  SHOPPING_PATHS.some((path) => pathname === path || (path !== "/" && pathname.startsWith(`${path}/`)));

const choices = [
  {
    mode: "household",
    title: "Household",
    description: "Everyday groceries for you and your family.",
    action: "Shop groceries",
    Icon: IconHome,
  },
  {
    mode: "business",
    title: "Business",
    description: "Bulk food supply for your business or organisation.",
    action: "Shop for business",
    Icon: IconBuildingStore,
  },
];

export default function ShoppingModeGate() {
  const pathname = usePathname() || "/";
  const { ready, selected, selectMode } = useShoppingMode();
  const dialogRef = useRef(null);
  const isOpen = ready && !selected && isShoppingPath(pathname);

  useEffect(() => {
    if (!isOpen) return undefined;

    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const focusable = Array.from(dialog?.querySelectorAll("button:not([disabled])") || []);

    document.body.style.overflow = "hidden";
    focusable[0]?.focus();

    const trapFocus = (event) => {
      if (event.key !== "Tab" || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      className="shopping-mode-gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shopping-mode-title"
    >
      <div className="shopping-mode-gate__panel">
        <h1 id="shopping-mode-title">How would you like to shop?</h1>
        <div className="shopping-mode-gate__choices">
          {choices.map(({ mode, title, description, action, Icon }) => (
            <section className={`shopping-mode-choice shopping-mode-choice--${mode}`} key={mode}>
              <span className="shopping-mode-choice__icon" aria-hidden="true">
                <Icon size={24} stroke={1.8} />
              </span>
              <h2>{title}</h2>
              <p>{description}</p>
              <button type="button" onClick={() => selectMode(mode)}>
                {action}
              </button>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
