"use client";

import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 50;

export default function AdminLogsPage() {
  const [type, setType] = useState("errors");
  const [items, setItems] = useState([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const url = useMemo(() => {
    const p = new URLSearchParams();
    p.set("type", type);
    p.set("limit", String(PAGE_SIZE));
    p.set("offset", String(offset));
    return `/api/admin/logs?${p.toString()}`;
  }, [type, offset]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || `Request failed (${res.status})`);
          setItems([]);
          return;
        }
        setItems(Array.isArray(data?.items) ? data.items : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || "Network error");
        setItems([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const onPrev = () => setOffset((o) => Math.max(0, o - PAGE_SIZE));
  const onNext = () => setOffset((o) => o + PAGE_SIZE);

  return (
    <main style={{ maxWidth: 920, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ marginBottom: 12 }}>Admin Logs</h1>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <label>
          <span style={{ marginRight: 8 }}>Type</span>
          <select value={type} onChange={(e) => { setType(e.target.value); setOffset(0); }}>
            <option value="errors">Errors</option>
            <option value="events">Events</option>
          </select>
        </label>
        <div style={{ marginLeft: "auto" }}>
          <button onClick={onPrev} disabled={loading || offset === 0} style={{ marginRight: 8 }}>Prev</button>
          <button onClick={onNext} disabled={loading || items.length < PAGE_SIZE}>Next</button>
        </div>
      </div>
      {error ? (
        <p style={{ color: "#b91c1c", marginBottom: 16 }}>{error}</p>
      ) : null}
      {loading ? <p>Loading...</p> : null}
      {!loading && items.length === 0 && !error ? <p>No items.</p> : null}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
        {items.map((it, i) => (
          <li key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {JSON.stringify(it, null, 2)}
            </pre>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", color: "#6b7280" }}>
        <span>Offset: {offset}</span>
        <span>Showing: {items.length}</span>
      </div>
    </main>
  );
}
