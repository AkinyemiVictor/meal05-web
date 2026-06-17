'use client';

import { useEffect } from "react";
import { storeRecentSearch } from "@/lib/search-history";

export default function SearchHistoryRecorder({ term, enabled = true }) {
  useEffect(() => {
    if (!enabled) return;
    storeRecentSearch(term);
  }, [term, enabled]);

  return null;
}
