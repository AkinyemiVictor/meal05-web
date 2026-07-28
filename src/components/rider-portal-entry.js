"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const tokenPattern = /^[A-Za-z0-9_-]{24,256}$/;

const extractToken = (value) => {
  const input = String(value || "").trim();
  if (!input) return "";
  if (tokenPattern.test(input)) return input;

  let url;
  try {
    url = new URL(input, window.location.origin);
  } catch {
    return "";
  }

  if (url.origin !== window.location.origin) return "";
  const match = url.pathname.match(/^\/rider\/route\/([^/?#]+)$/);
  return match?.[1] && tokenPattern.test(decodeURIComponent(match[1])) ? decodeURIComponent(match[1]) : "";
};

export default function RiderPortalEntry() {
  const router = useRouter();
  const [routeInput, setRouteInput] = useState("");
  const [message, setMessage] = useState("");

  const submit = (event) => {
    event.preventDefault();
    setMessage("");
    const token = extractToken(routeInput);
    if (!token) {
      setMessage("Enter the route link or token shared by Meal05 dispatch.");
      return;
    }
    router.push(`/rider/route/${encodeURIComponent(token)}`);
  };

  return (
    <main className="rider-entry-page">
      <section className="rider-entry-card">
        <p>Meal05 Rider</p>
        <h1>Open your route</h1>
        <form onSubmit={submit}>
          <label>
            <span>Route link or token</span>
            <input
              autoComplete="off"
              inputMode="text"
              value={routeInput}
              onChange={(event) => setRouteInput(event.target.value)}
              placeholder="Paste your secure route link"
            />
          </label>
          <button type="submit">Continue</button>
        </form>
        {message ? <strong role="alert">{message}</strong> : null}
      </section>

      <style jsx>{`
        .rider-entry-page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          background: #f8fafc;
          color: #0f172a;
          padding: 16px;
        }
        .rider-entry-card {
          width: min(100%, 460px);
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #ffffff;
          padding: 18px;
          box-shadow: 0 18px 42px rgba(15, 23, 42, 0.08);
        }
        p {
          margin: 0;
          color: #f04e1f;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        h1 {
          margin: 4px 0 16px;
        }
        form,
        label {
          display: grid;
          gap: 10px;
        }
        label span {
          color: #334155;
          font-weight: 900;
        }
        input {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 12px;
          font: inherit;
        }
        button {
          min-height: 48px;
          border: 1px solid #0f172a;
          border-radius: 10px;
          background: #0f172a;
          color: #ffffff;
          font: inherit;
          font-weight: 900;
        }
        strong {
          display: block;
          margin-top: 12px;
          color: #9a3412;
        }
      `}</style>
    </main>
  );
}
