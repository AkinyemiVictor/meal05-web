"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { clearStoredUser, persistStoredUser } from "@/lib/auth";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";

const deriveStoredUser = (email) => {
  const local = String(email || "").split("@")[0] || "admin";
  const cleaned = local.replace(/[\.\_\-]+/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const firstName = String(parts[0] || "Admin").toUpperCase();
  const lastName = String(parts[1] || "User").toUpperCase();
  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    email,
  };
};

export default function AdminLoginClient({ forbidden = false, signedInEmail = "" }) {
  const [email, setEmail] = useState(signedInEmail || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isSignedInNonAdmin = useMemo(() => Boolean(signedInEmail), [signedInEmail]);

  const signOutCurrent = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = getBrowserSupabaseClient();
      await supabase.auth.signOut();
      clearStoredUser();
      window.location.reload();
    } catch (e) {
      setError(e?.message || "Could not sign out right now.");
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setError("");

    const trimmedEmail = String(email || "").trim();
    if (!trimmedEmail) {
      setError("Enter your email.");
      return;
    }
    if (!String(password || "").trim()) {
      setError("Enter your password.");
      return;
    }

    setLoading(true);
    try {
      const supabase = getBrowserSupabaseClient();
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (loginError) {
        setError("Incorrect email or password.");
        return;
      }

      const user = deriveStoredUser(trimmedEmail);
      persistStoredUser(user);
      try {
        await fetch("/api/users/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ first_name: user.firstName, last_name: user.lastName }),
        });
      } catch {
        // optional sync only
      }

      const accessToken = String(loginData?.session?.access_token || "");
      const accessRes = await fetch("/api/admin/access", {
        method: "GET",
        cache: "no-store",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      const accessData = await accessRes.json().catch(() => ({}));
      if (!accessRes.ok || !accessData?.allowed) {
        setError("This login is for admins only.");
        return;
      }

      window.location.assign("/admin/dashboard");
    } catch (e) {
      setError(e?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px 16px", background: "#f8fafc" }}>
      <section
        style={{
          width: "100%",
          maxWidth: 460,
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 20,
          background: "#ffffff",
          boxShadow: "0 10px 20px rgba(15, 23, 42, 0.05)",
        }}
      >
        <p style={{ margin: "0 0 8px", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>
          MealKit Admin
        </p>
        <h1 style={{ margin: "0 0 8px" }}>Admin Login</h1>
        <p style={{ margin: "0 0 16px", color: "#4b5563" }}>
          This login is for admins only.
        </p>

        {forbidden ? (
          <p
            style={{
              margin: "0 0 14px",
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              color: "#9a3412",
              padding: "10px 12px",
              borderRadius: 8,
            }}
          >
            This login is for admins only.
          </p>
        ) : null}

        {isSignedInNonAdmin ? (
          <div
            style={{
              marginBottom: 14,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#b91c1c",
              padding: "10px 12px",
              borderRadius: 8,
            }}
          >
            <p style={{ margin: "0 0 10px" }}>
              Logged in as <strong>{signedInEmail}</strong>, but not an admin.
            </p>
            <button
              type="button"
              onClick={signOutCurrent}
              disabled={loading}
              style={{
                border: "1px solid #dc2626",
                background: "#ffffff",
                color: "#b91c1c",
                borderRadius: 8,
                padding: "8px 10px",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Logging out..." : "Log out and use another account"}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="admin-email" style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                border: "1px solid #d1d5db",
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 12,
              }}
            />

            <label htmlFor="admin-password" style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
              Password
            </label>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: "100%",
                  border: "1px solid #d1d5db",
                  borderRadius: 10,
                  padding: "10px 12px",
                  paddingRight: 42,
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  color: "#475569",
                  cursor: "pointer",
                }}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {error ? (
              <p style={{ margin: "0 0 12px", color: "#b91c1c", fontWeight: 600 }}>{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                border: "none",
                background: "#0f172a",
                color: "#ffffff",
                borderRadius: 10,
                padding: "11px 14px",
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Logging in..." : "Admin Login"}
            </button>
          </form>
        )}

        <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/" style={{ color: "#334155", textDecoration: "none", fontWeight: 600 }}>
            Back to Store
          </Link>
          <Link href="/help-center" style={{ color: "#334155", textDecoration: "none", fontWeight: 600 }}>
            Help Center
          </Link>
        </div>
      </section>
    </main>
  );
}
