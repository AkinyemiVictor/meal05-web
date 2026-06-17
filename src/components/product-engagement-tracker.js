'use client';

import { useEffect, useRef } from 'react';
import { recordProductView } from '@/lib/engagement';
import { trackViewItem } from "@/lib/analytics";

export default function ProductEngagementTracker({ productId, product }) {
  const trackedIdRef = useRef("");

  useEffect(() => {
    const resolvedId = String(product?.id ?? productId ?? "").trim();
    if (!resolvedId) return;
    if (trackedIdRef.current === resolvedId) return;

    trackedIdRef.current = resolvedId;
    recordProductView(resolvedId);
    trackViewItem({
      id: resolvedId,
      name: product?.name,
      category: product?.category,
      price: product?.price,
      unit: product?.unit,
      variantId: product?.variantId,
      variantName: product?.variantName,
    });
  }, [productId, product]);

  return null;
}
