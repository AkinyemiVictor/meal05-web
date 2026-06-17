export const RECENT_SEARCHES_KEY = "meal05_recent_search_terms";
export const RECENT_SEARCHES_LIMIT = 8;

const isBrowser = () => typeof window !== "undefined";

export function readRecentSearches() {
  if (!isBrowser()) return [];
  try {
    const stored = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch (error) {
    console.warn("Unable to read stored searches", error);
    return [];
  }
}

export function storeRecentSearch(term) {
  if (!isBrowser()) return;
  const value = term?.toString().trim();
  if (!value) return;

  try {
    const existing = readRecentSearches()
      .filter((entry) => entry.toLowerCase() !== value.toLowerCase());
    existing.unshift(value);
    const trimmed = existing.slice(0, RECENT_SEARCHES_LIMIT);
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.warn("Unable to store search term", error);
  }
}
