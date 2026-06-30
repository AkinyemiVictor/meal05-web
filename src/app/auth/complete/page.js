"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";
import { persistStoredUser } from "@/lib/auth";
import { buildSignInHref, sanitizeReturnPath } from "@/lib/auth-redirect";
import { migrateGuestCartToUser } from "@/lib/cart-storage";

const toNameParts = (email, metadata) => {
  const fallback = (email && email.includes("@")) ? email.split("@")[0] : "Meal05 Friend";
  const fromMeta = (metadata?.full_name || metadata?.name || metadata?.user_name || "").trim();
  const source = fromMeta || fallback;
  const cleaned = String(source).replace(/[._-]+/g, " ").trim();
  const pieces = cleaned.split(/\s+/);
  const first = (pieces[0] || "Meal05").toUpperCase();
  const last = (pieces[1] || "Friend").toUpperCase();
  return { firstName: first, lastName: last, fullName: `${first} ${last}`.trim() };
};

const withTimeout = (promise, ms, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);

export default function OAuthCompletePage() {
  const router = useRouter();
  const [statusMessage, setStatusMessage] = useState("Signing you in...");

  useEffect(() => {
    const search = typeof window === "undefined" ? "" : window.location.search;
    const params = new URLSearchParams(search);
    const nextPath = sanitizeReturnPath(params.get("next") || "", "");
    const afterAuthHref = nextPath || "/";
    const signInHref = buildSignInHref({ tab: "login", next: nextPath, hash: "loginForm" });

    (async () => {
      try {
        const supabase = getBrowserSupabaseClient();
        const { data: { user }, error } = await withTimeout(
          supabase.auth.getUser(),
          10000,
          "Sign-in took too long. Please try again."
        );
        if (error) throw error;
        if (!user) {
          router.replace(signInHref);
          return;
        }

        const { firstName, lastName, fullName } = toNameParts(user.email, user.user_metadata || {});
        const phone = String(user.user_metadata?.phone || "").trim();
        const localUser = { firstName, lastName, fullName, email: user.email || "", ...(phone ? { phone } : {}) };
        persistStoredUser(localUser);

        try {
          await withTimeout(fetch("/api/users/sync", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ first_name: firstName, last_name: lastName, ...(phone ? { phone } : {}) }),
          }), 8000, "Profile sync took too long.");
        } catch {}

        try {
          migrateGuestCartToUser(localUser);
        } catch {}
        router.replace(afterAuthHref);
      } catch (error) {
        setStatusMessage(error?.message || "Could not complete sign-in. Redirecting...");
        router.replace(signInHref);
      }
    })();
  }, [router]);

  return (
    <main className="auth-page">
      <div className="auth-shell" style={{ padding: "2rem", justifyContent: "center", alignItems: "center" }}>
        <p>{statusMessage}</p>
      </div>
    </main>
  );
}
