'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { logError } from '@/lib/logging';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    try { logError('app_error', error); } catch (_) {}
  }, [error]);

  return (
    <main className="category-page">
      <section className="category-empty-state" role="alert">
        <strong>Something went wrong.</strong>
        <p>We could not load this page. Please try again, or return to the catalog.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" className="section-view-button" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/shop" className="section-view-button">
            Browse products
          </Link>
        </div>
      </section>
    </main>
  );
}
