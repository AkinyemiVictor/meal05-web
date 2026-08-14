export const normalisePage = (value, fallback = 1) => {
  const page = Number(value);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : fallback;
};

export const readPageFromSearch = (search = "") => {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  return normalisePage(params.get("page"));
};

export const buildPaginatedHref = ({ pathname, search = "", hash = "", page }) => {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const nextPage = normalisePage(page);

  if (nextPage === 1) params.delete("page");
  else params.set("page", String(nextPage));

  const query = params.toString();
  const safeHash = hash ? (String(hash).startsWith("#") ? String(hash) : `#${hash}`) : "";
  return `${pathname || "/"}${query ? `?${query}` : ""}${safeHash}`;
};

/**
 * Keeps pagination compact without hiding the pages surrounding the current one.
 * Ellipses deliberately stand in for all pages outside the visible window.
 */
export const buildPaginationItems = (currentPage, totalPages, visiblePages = 5) => {
  const total = normalisePage(totalPages);
  const current = Math.min(normalisePage(currentPage), total);
  const windowSize = Math.max(3, Math.floor(Number(visiblePages) || 5));

  if (total <= windowSize) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const halfWindow = Math.floor(windowSize / 2);
  const start = Math.max(1, Math.min(current - halfWindow, total - windowSize + 1));
  const end = Math.min(total, start + windowSize - 1);
  const items = [];

  if (start > 1) items.push("ellipsis-start");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < total) items.push("ellipsis-end");

  return items;
};
