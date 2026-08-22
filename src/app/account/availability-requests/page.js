"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "../../availability-requests/availability.module.css";

export default function AccountAvailabilityRequestsPage() {
  const [requests, setRequests] = useState([]); const [error, setError] = useState("");
  useEffect(() => { fetch("/api/availability-requests", { cache: "no-store" }).then(async (response) => {
    const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "Unable to load requests"); return payload.requests || [];
  }).then(setRequests).catch((loadError) => setError(loadError.message)); }, []);
  return <main className={styles.page}><div className={styles.shell}><Link className={styles.back} href="/account">← My account</Link><section className={styles.card}>
    <h1>Availability requests</h1><p className={styles.muted}>Track baskets that need confirmation before payment.</p>
    {error ? <p className={styles.error}>{error}</p> : null}
    <div className={styles.list}>{requests.map((request) => <Link className={styles.row} key={request.id} href={`/availability-requests/${request.id}`}><div className={styles.rowHead}><strong>{request.request_number}</strong><span className={styles.badge}>{request.status.replaceAll("_", " ")}</span></div><span>{new Date(request.created_at).toLocaleString()} · {(request.items || []).length} item(s)</span></Link>)}</div>
    {!error && !requests.length ? <p className={styles.muted}>No availability requests yet.</p> : null}
  </section></div></main>;
}

