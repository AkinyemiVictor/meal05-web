// Lightweight region utilities for currency/locale handling

export const REGION_COOKIE = "mk_region";

export const REGION_MAP = {
  ng: { code: "ng", currency: "NGN", locale: "en-NG", symbol: "₦" },
  gh: { code: "gh", currency: "GHS", locale: "en-GH", symbol: "GH₵" },
};

export const DEFAULT_REGION = REGION_MAP.ng;

export const detectRegionFromHost = (host) => {
  const h = String(host || "").toLowerCase();
  if (h.endsWith(".com.gh") || h.endsWith(".gh")) return REGION_MAP.gh;
  if (h.endsWith(".com.ng") || h.endsWith(".ng")) return REGION_MAP.ng;
  return null;
};

export const readCookie = (name) => {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
};

export const getActiveRegion = () => {
  // 1) Cookie set by middleware or user selection
  const fromCookie = readCookie(REGION_COOKIE);
  if (fromCookie && REGION_MAP[fromCookie]) return REGION_MAP[fromCookie];

  // 2) Hostname hint (dev will typically be localhost)
  try {
    const hint = detectRegionFromHost(window.location.hostname);
    if (hint) return hint;
  } catch {}

  return DEFAULT_REGION;
};

export const formatMoney = (amount, { region = getActiveRegion() } = {}) => {
  const value = Number(amount || 0);
  const cfg = region || DEFAULT_REGION;
  let formatted = "";
  try {
    formatted = new Intl.NumberFormat(cfg.locale, {
      style: "currency",
      currency: cfg.currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    formatted = `${cfg.symbol}${value.toLocaleString()}`;
  }
  return formatted;
};

