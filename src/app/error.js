'use client';

import { useEffect } from 'react';
import { logError } from '@/lib/logging';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    try { logError('app_error', error); } catch (_) {}
  }, [error]);

  return (
    <main style={{ maxWidth: 720, margin: '48px auto', padding: 16 }}>
      <h1>Something went wrong</h1>
      <p>We hit a snag while loading this page. Please try again.</p>
      <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f8fa', padding: 12, borderRadius: 8 }}>
        {String(error?.message || error)}
      </pre>
      <button onClick={() => reset()} style={{ marginTop: 12 }}>Try again</button>
    </main>
  );
}
