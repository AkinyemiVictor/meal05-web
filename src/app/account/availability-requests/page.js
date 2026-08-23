"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  getAvailabilityRequestPresentation,
  isAvailabilityRequestLive,
} from "@/lib/availability-request-presenter";
import styles from "../../availability-requests/availability.module.css";

const toneClass = (base, tone) =>
  [styles[base], styles[`${base}_${tone}`]].filter(Boolean).join(" ");

export default function AccountAvailabilityRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/availability-requests", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to load requests");
      setRequests(payload.requests || []);
      setError("");
    } catch (loadError) {
      if (!silent) setError(loadError.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!requests.some(isAvailabilityRequestLive)) return undefined;
    const refresh = () => load({ silent: true });
    const timer = window.setInterval(refresh, 30000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load, requests]);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link className={styles.back} href="/account">← My account</Link>
        <section className={styles.card}>
          <p className={styles.eyebrow}>My account</p>
          <h1>Availability requests</h1>
          <p className={styles.lead}>
            Track baskets that need confirmation before payment and return when action or payment is ready.
          </p>

          {error ? <p className={styles.error}>{error}</p> : null}
          {loading ? <p className={styles.muted}>Loading your requests…</p> : null}

          <div className={styles.list}>
            {requests.map((request) => {
              const presentation = getAvailabilityRequestPresentation(request);
              const activeItems = (request.items || []).filter((item) => !item.customer_removed_at);
              const checkingCount = activeItems.filter((item) => item.resolution_status === "pending").length;
              return (
                <Link className={styles.requestRow} key={request.id} href={`/availability-requests/${request.id}`}>
                  <div className={styles.rowHead}>
                    <div>
                      <strong>{request.request_number}</strong>
                      <span className={styles.requestDate}>{new Date(request.created_at).toLocaleString()}</span>
                    </div>
                    <span className={toneClass("statusBadge", presentation.tone)}>{presentation.label}</span>
                  </div>
                  <p>{presentation.description}</p>
                  <div className={styles.requestRowMeta}>
                    <span>{activeItems.length} item{activeItems.length === 1 ? "" : "s"}</span>
                    {checkingCount ? <span>{checkingCount} still checking</span> : null}
                    <span>View request →</span>
                  </div>
                </Link>
              );
            })}
          </div>

          {!loading && !error && !requests.length ? (
            <div className={styles.emptyState}>
              <strong>No availability requests yet.</strong>
              <p>When a basket needs a market or supplier check, you’ll be able to track it here.</p>
              <Link className={styles.inlineLink} href="/shop">Continue shopping</Link>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
