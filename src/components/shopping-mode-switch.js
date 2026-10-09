"use client";

import { IconBuildingStore, IconHome } from "@tabler/icons-react";
import { useRouter } from "next/navigation";

import { useShoppingMode } from "@/lib/shopping-mode-client";

export default function ShoppingModeSwitch({ compact = false }) {
  const router = useRouter();
  const { mode, ready, selectMode } = useShoppingMode();
  if (!ready) return <span className="shopping-mode-switch shopping-mode-switch--loading" aria-hidden="true" />;

  const changeMode = (nextMode) => {
    if (nextMode === mode) return;
    selectMode(nextMode);
    router.refresh();
  };

  return (
    <div className={`shopping-mode-switch${compact ? " shopping-mode-switch--compact" : ""}`} aria-label="Shopping mode">
      <button type="button" aria-pressed={mode === "household"} onClick={() => changeMode("household")}>
        <IconHome size={compact ? 14 : 16} stroke={1.9} /><span>Household</span>
      </button>
      <button type="button" aria-pressed={mode === "business"} onClick={() => changeMode("business")}>
        <IconBuildingStore size={compact ? 14 : 16} stroke={1.9} /><span>Business</span>
      </button>
    </div>
  );
}
