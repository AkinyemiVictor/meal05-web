"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconCheck } from "@tabler/icons-react";

export default function NewsletterSignup({
  title = "Stay in the loop",
  description = "Get weekly market updates, seasonal picks, and exclusive offers.",
  note = "No spam - just fresh food stories.",
}) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  useEffect(() => {
    if (!confirmationOpen) return undefined;

    const timer = window.setTimeout(() => setConfirmationOpen(false), 3000);
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setConfirmationOpen(false);
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [confirmationOpen]);

  async function subscribe(form) {
    if (status === "loading") return;

    const email = new FormData(form).get("newsletter-email");
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "We couldn't subscribe you right now.");
      }

      form.reset();
      setStatus("success");
      setMessage(result.message || "Fresh Meal05 updates are on the way.");
      setConfirmationOpen(true);
    } catch (error) {
      setStatus("error");
      setMessage(error?.message || "We couldn't subscribe you right now. Please try again.");
    }
  }

  function submit(event) {
    event.preventDefault();
    subscribe(event.currentTarget);
  }

  return (
    <>
      <form className="footer-newsletter" onSubmit={submit}>
        <h3>{title}</h3>
        <p>{description}</p>
        <div className="newsletter-field">
          <div className="newsletter-field__control">
            <input
              type="email"
              name="newsletter-email"
              placeholder="Enter your email"
              aria-label="Email address"
              autoComplete="email"
              maxLength={254}
              required
            />
            <button
              type="button"
              disabled={status === "loading"}
              onClick={(event) => {
                if (event.currentTarget.form) subscribe(event.currentTarget.form);
              }}
            >
              {status === "loading" ? "Subscribing..." : "Subscribe"}
            </button>
          </div>
        </div>
        {status === "error" ? (
          <small className="newsletter-field__error" role="alert">{message}</small>
        ) : note ? <small>{note}</small> : null}
      </form>

      {confirmationOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="newsletter-confirmation"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="newsletter-confirmation-title"
              aria-describedby="newsletter-confirmation-message"
            >
              <section className="newsletter-confirmation__dialog">
                <span className="newsletter-confirmation__icon" aria-hidden="true">
                  <IconCheck />
                </span>
                <h2 id="newsletter-confirmation-title">You&apos;re subscribed!</h2>
                <p id="newsletter-confirmation-message">{message}</p>
                <button type="button" onClick={() => setConfirmationOpen(false)}>Cancel</button>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
