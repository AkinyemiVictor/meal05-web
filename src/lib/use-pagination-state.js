"use client";

import { useCallback, useEffect, useState } from "react";

import { buildPaginatedHref, normalisePage, readPageFromSearch } from "@/lib/pagination";

export default function usePaginationState(resetKey = "") {
  const [currentPage, setCurrentPageState] = useState(1);

  useEffect(() => {
    const syncPageFromUrl = () => {
      setCurrentPageState(readPageFromSearch(window.location.search));
    };

    syncPageFromUrl();
    window.addEventListener("popstate", syncPageFromUrl);
    return () => window.removeEventListener("popstate", syncPageFromUrl);
  }, [resetKey]);

  const setCurrentPage = useCallback((page, { replace = false } = {}) => {
    const nextPage = normalisePage(page);
    setCurrentPageState(nextPage);

    const href = buildPaginatedHref({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      page: nextPage,
    });
    const method = replace ? "replaceState" : "pushState";
    window.history[method](window.history.state, "", href);
  }, []);

  return [currentPage, setCurrentPage];
}
