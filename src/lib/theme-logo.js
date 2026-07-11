import { useEffect, useState } from "react";

export const BRAND_MARK_SRC = "/assets/logo/MEAL05 APP LOGO.png";
export const BRAND_WORDMARK_SRC = "/assets/logo/MEAL05 NEW LOGO-01.png";
export const BRAND_WORDMARK_DARK_SRC = "/assets/logo/MEAL05 NEW LOGO-01.png";
export const LIGHT_THEME_LOGO_SRC = BRAND_MARK_SRC;
export const DARK_THEME_LOGO_SRC = LIGHT_THEME_LOGO_SRC;

const elementHasDarkTheme = (element) => {
  if (!element) return false;
  const theme = String(element.getAttribute("data-theme") || "").toLowerCase();
  return element.classList.contains("dark") || theme === "dark";
};

const getSystemDarkPreference = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

const detectDarkTheme = () => {
  if (typeof document === "undefined") {
    return false;
  }
  return (
    elementHasDarkTheme(document.documentElement)
    || elementHasDarkTheme(document.body)
    || getSystemDarkPreference()
  );
};

export const getThemeLogoSrc = (isDarkTheme) => (
  isDarkTheme ? DARK_THEME_LOGO_SRC : LIGHT_THEME_LOGO_SRC
);

export const handleThemeLogoError = (event) => {
  const logo = event?.currentTarget;
  if (!logo) return;
  if (logo.dataset.logoFallbackApplied === "true") return;
  logo.dataset.logoFallbackApplied = "true";
  logo.src = LIGHT_THEME_LOGO_SRC;
};

export const useIsDarkTheme = () => {
  const [isDarkTheme, setIsDarkTheme] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const refreshTheme = () => setIsDarkTheme(detectDarkTheme());
    refreshTheme();

    let mediaQueryList = null;
    const handleMediaChange = () => refreshTheme();
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      mediaQueryList = window.matchMedia("(prefers-color-scheme: dark)");
      if (typeof mediaQueryList.addEventListener === "function") {
        mediaQueryList.addEventListener("change", handleMediaChange);
      } else if (typeof mediaQueryList.addListener === "function") {
        mediaQueryList.addListener(handleMediaChange);
      }
    }

    const themeObserver = new MutationObserver(refreshTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    if (document.body) {
      themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "data-theme"],
      });
    }

    return () => {
      themeObserver.disconnect();
      if (!mediaQueryList) return;
      if (typeof mediaQueryList.removeEventListener === "function") {
        mediaQueryList.removeEventListener("change", handleMediaChange);
      } else if (typeof mediaQueryList.removeListener === "function") {
        mediaQueryList.removeListener(handleMediaChange);
      }
    };
  }, []);

  return isDarkTheme;
};
