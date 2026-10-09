"use client";

import { IconBuildingStore, IconHome } from "@tabler/icons-react";
import { usePathname } from "next/navigation";

import { useShoppingMode } from "@/lib/shopping-mode-client";

const SHOPPING_PATHS = ["/", "/landing", "/home", "/shop", "/categories", "/section", "/products", "/search", "/cart"];

const isShoppingPath = (pathname) =>
  SHOPPING_PATHS.some((path) => pathname === path || (path !== "/" && pathname.startsWith(`${path}/`)));

const choices = [
  {
    mode: "household",
    title: "Household",
    description: "Everyday groceries for yourself and your family.",
    action: "Shop groceries",
    Icon: IconHome,
  },
  {
    mode: "business",
    title: "Business",
    description: "Bulk food sourcing for businesses and organisations.",
    action: "Shop for business",
    Icon: IconBuildingStore,
  },
];

export default function ShoppingModeGate() {
  const pathname = usePathname() || "/";
  const { ready, selected, selectMode } = useShoppingMode();
  if (!ready || selected || !isShoppingPath(pathname)) return null;

  return (
    <div className="shopping-mode-gate" role="dialog" aria-modal="true" aria-labelledby="shopping-mode-title">
      <div className="shopping-mode-gate__panel">
        <p className="shopping-mode-gate__eyebrow">Meal05 marketplace</p>
        <h1 id="shopping-mode-title">How would you like to shop?</h1>
        <p className="shopping-mode-gate__intro">Choose your shopping mode. You can switch anytime.</p>
        <div className="shopping-mode-gate__choices">
          {choices.map(({ mode, title, description, action, Icon }) => (
            <section className="shopping-mode-choice" key={mode}>
              <span className="shopping-mode-choice__icon"><Icon size={24} stroke={1.8} /></span>
              <h2>{title}</h2>
              <p>{description}</p>
              <button type="button" onClick={() => selectMode(mode)}>
                {action}<span aria-hidden="true">→</span>
              </button>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
