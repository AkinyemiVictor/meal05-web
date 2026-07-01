"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";
import { useNotice } from "@/components/notice-provider";
import { useSearchParams } from "next/navigation";

import "@/styles/sign-in.css";
import { clearStoredUser, persistStoredUser, readStoredUser } from "@/lib/auth";
import { buildSignInHref, sanitizeReturnPath } from "@/lib/auth-redirect";
import { migrateGuestCartToUser } from "@/lib/cart-storage";
import { BRAND_WORDMARK_SRC } from "@/lib/theme-logo";
import { DEFAULT_PHONE_COUNTRY_CODE, PHONE_COUNTRY_OPTIONS } from "@/lib/phone-country-options";

const NAME_PATTERN = "[A-Za-z]+";
const EMAIL_PATTERN = "[A-Za-z0-9]+@[A-Za-z0-9]+\\.com";
const PASSWORD_PATTERN = "(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^\\w\\s]).{8,}";
const PHONE_INPUT_PATTERN = "[0-9\\s().-]{4,24}";
const PHONE_NUMBER_PATTERN = "[0-9]{4,14}";
const REMEMBERED_LOGIN_EMAIL_KEY = "meal05_remembered_login_email";

const NAME_REGEX = new RegExp(`^${NAME_PATTERN}$`);
const EMAIL_REGEX = new RegExp(`^${EMAIL_PATTERN}$`);
const PASSWORD_REGEX = new RegExp(`^${PASSWORD_PATTERN}$`);
const PHONE_NUMBER_REGEX = new RegExp(`^${PHONE_NUMBER_PATTERN}$`);
const PHONE_INPUT_REGEX = new RegExp(`^${PHONE_INPUT_PATTERN}$`);

const normalizeLoginPhone = (value, countryCode = DEFAULT_PHONE_COUNTRY_CODE) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const normalizedCountry = String(countryCode || DEFAULT_PHONE_COUNTRY_CODE).trim() || DEFAULT_PHONE_COUNTRY_CODE;
  const countryDigits = normalizedCountry.replace(/\D/g, "");
  if (countryDigits && digits.startsWith(countryDigits)) return `+${digits}`;
  if (digits.startsWith("0")) return `${normalizedCountry}${digits.replace(/^0+/, "")}`;
  return `${normalizedCountry}${digits}`;
};

const withTimeout = (promise, ms, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);

const TAB_OPTIONS = [
  { key: "login", label: "Sign in", hash: "#loginForm" },
  { key: "signup", label: "Create account", hash: "#signupForm" },
];

function GoogleIcon() {
  return (
    <svg
      className="auth-google-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

function SignInPageContent() {
  const searchParams = useSearchParams();
  // Initialize to a stable server-safe default; update from URL after mount
  const [activeTab, setActiveTab] = useState("login");
  // Password visibility toggles
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirm, setShowSignupConfirm] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(() => {
    if (typeof window === "undefined") return false;
    const text = `${window.location.search || ""} ${window.location.hash || ""}`;
    return /type=recovery|password_recovery|recovery/i.test(text);
  });
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryConfirm, setRecoveryConfirm] = useState("");
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [showRecoveryConfirm, setShowRecoveryConfirm] = useState(false);
  const [isSavingRecoveryPassword, setIsSavingRecoveryPassword] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPhoneCountry, setLoginPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY_CODE);
  const { showNotice } = useNotice();
  const clearLoginInlineHint = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const el = document.getElementById("login-inline-hint");
      if (el) el.textContent = "";
    } catch {}
  }, []);

  const hashLookup = useMemo(() => TAB_OPTIONS.reduce((acc, tab) => {
    acc[tab.key] = tab.hash;
    return acc;
  }, {}), []);

  const requestedNext = useMemo(
    () => sanitizeReturnPath(searchParams?.get("next") || "", ""),
    [searchParams]
  );
  const fallbackAfterAuth = requestedNext || "/";
  const loginTabHref = useMemo(
    () => buildSignInHref({ tab: "login", next: requestedNext, hash: "loginForm" }),
    [requestedNext]
  );
  const getLoginResetRedirect = useCallback(() => {
    const url = new URL("/sign-in", window.location.origin);
    url.searchParams.set("tab", "login");
    if (requestedNext) {
      url.searchParams.set("next", requestedNext);
    }
    url.hash = "loginForm";
    return url.toString();
  }, [requestedNext]);
  const getSignupConfirmRedirect = useCallback(() => {
    const url = new URL("/auth/callback", window.location.origin);
    if (requestedNext) {
      url.searchParams.set("next", requestedNext);
    }
    return url.toString();
  }, [requestedNext]);
  const handleGoogleSignIn = useCallback(async () => {
    try {
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      if (requestedNext) {
        callbackUrl.searchParams.set("next", requestedNext);
      }
      const supabase = getBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl.toString() },
      });
      if (error) {
        throw error;
      }
    } catch (e) {
      await showNotice({ tone: "error", title: "Google sign-in failed", message: e?.message || "Please try again." });
    }
  }, [requestedNext, showNotice]);

  const hashToTab = useMemo(() => TAB_OPTIONS.reduce((acc, tab) => {
    acc[tab.hash] = tab.key;
    return acc;
  }, {}), []);

  const deriveTabFromLocation = useCallback(() => {
    if (typeof window === "undefined") {
      return "login";
    }

    const { hash, search } = window.location;
    if (hash && hashToTab[hash]) {
      return hashToTab[hash];
    }

    if (search) {
      const params = new URLSearchParams(search);
      const tabParam = params.get("tab");
      if (tabParam && hashLookup[tabParam]) {
        return tabParam;
      }
    }

    return "login";
  }, [hashLookup, hashToTab]);

  const syncFromLocation = useCallback(() => {
    setActiveTab(deriveTabFromLocation());
  }, [deriveTabFromLocation]);

  useEffect(() => {
    syncFromLocation();
    window.addEventListener("hashchange", syncFromLocation);
    window.addEventListener("popstate", syncFromLocation);
    return () => {
      window.removeEventListener("hashchange", syncFromLocation);
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, [syncFromLocation]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const supabase = getBrowserSupabaseClient();
    const markRecoveryFromUrl = () => {
      const text = `${window.location.search || ""} ${window.location.hash || ""}`;
      if (/type=recovery|password_recovery|recovery/i.test(text)) {
        setIsPasswordRecovery(true);
        setActiveTab("login");
      }
    };
    markRecoveryFromUrl();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
        setActiveTab("login");
      }
    });
    window.addEventListener("hashchange", markRecoveryFromUrl);
    return () => {
      window.removeEventListener("hashchange", markRecoveryFromUrl);
      data?.subscription?.unsubscribe?.();
    };
  }, []);

  // Also react to client-side Next.js navigation where hashchange/popstate may not fire
  useEffect(() => {
    if (!searchParams) return;
    const tabParam = searchParams.get("tab");
    if (tabParam === "login" || tabParam === "signup") {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    const oauthError = searchParams?.get("oauth_error");
    if (!oauthError) return;
    showNotice({
      tone: "error",
      title: "Google sign-in failed",
      message: oauthError,
      autoClose: false,
    });
  }, [searchParams, showNotice]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const desiredHash = hashLookup[activeTab];
    if (!desiredHash) {
      return;
    }

    const url = new URL(window.location.href);
    let shouldUpdate = false;

    if (url.hash !== desiredHash) {
      url.hash = desiredHash;
      shouldUpdate = true;
    }

    if (url.searchParams.get("tab") !== activeTab) {
      url.searchParams.set("tab", activeTab);
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      window.history.replaceState(null, "", url);
    }
  }, [activeTab, hashLookup]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.scrollTo({ top: 0, behavior: "auto" });
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rememberedEmail = window.localStorage.getItem(REMEMBERED_LOGIN_EMAIL_KEY) || "";
      if (!rememberedEmail) return;
      setLoginIdentifier((current) => current || rememberedEmail);
      setRememberMe(true);
    } catch {}
  }, []);

  const handleNavigateBack = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.assign("/");
  }, []);

  const handleTabChange = useCallback((tabKey) => {
    setActiveTab(tabKey);
  }, []);

  const handleLoginSubmit = useCallback(async (event) => {
    event.preventDefault();
    if (isLoginSubmitting) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const emailInput = form.elements.namedItem("login-email");
    const passwordInput = form.elements.namedItem("login-password");
    const identifier = String(formData.get("login-email") || "").trim();
    const phoneCountry =
      String(formData.get("login-phone-country") || loginPhoneCountry || DEFAULT_PHONE_COUNTRY_CODE).trim() ||
      DEFAULT_PHONE_COUNTRY_CODE;
    const password = String(formData.get("login-password") || "").trim();

    if (emailInput instanceof HTMLInputElement) {
      emailInput.setCustomValidity("");
    }
    if (passwordInput instanceof HTMLInputElement) {
      passwordInput.setCustomValidity("");
    }

    if (!identifier || !password) return;

    setIsLoginSubmitting(true);
    try {
      // Clear any previous inline hint
      try {
        const hintEl = document.getElementById("login-inline-hint");
        if (hintEl) hintEl.textContent = "";
      } catch {}

      const supabase = getBrowserSupabaseClient();
      const isEmailLogin = identifier.includes("@");
      let email = isEmailLogin ? identifier.toLowerCase() : "";
      const phone = isEmailLogin ? "" : normalizeLoginPhone(identifier, phoneCountry);
      let loginData = null;
      let loginError = null;

      if (!isEmailLogin) {
        const response = await withTimeout(fetch("/api/auth/resolve-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: phone || identifier, password }),
        }), 12000, "Login took too long. Please try again.");
        const payload = response.ok ? await response.json().catch(() => ({})) : {};
        if (!response.ok || !payload?.session?.access_token || !payload?.session?.refresh_token) {
          const hint = document.getElementById("login-inline-hint");
          if (hint) {
            hint.textContent = "Incorrect login details. Please try again or use your email address.";
          }
          return;
        }
        const sessionResult = await withTimeout(supabase.auth.setSession({
          access_token: payload.session.access_token,
          refresh_token: payload.session.refresh_token,
        }), 10000, "Login session took too long. Please try again.");
        loginData = sessionResult.data;
        loginError = sessionResult.error;
        email = String(loginData?.user?.email || payload?.user?.email || "").trim().toLowerCase();
      } else {
        const result = await withTimeout(
          supabase.auth.signInWithPassword({ email, password }),
          12000,
          "Login took too long. Please try again."
        );
        loginData = result.data;
        loginError = result.error;
      }

      if (loginError) {
        // Use generic credential messaging to avoid exposing account existence.
        const msg = String(loginError.message || "").toLowerCase();
        if (msg.includes("invalid") && msg.includes("credentials")) {
          const hint = document.getElementById("login-inline-hint");
          if (hint) {
            hint.textContent = "Incorrect login details. Please try again or reset your password.";
          }
          return;
        }
        await showNotice({
          tone: "error",
          title: "Login failed",
          message: loginError.message || "Incorrect login details",
          autoClose: false,
          actions: [
            {
              label: "Reset password",
              variant: "primary",
              onClick: async () => {
                try {
                  const supabase = getBrowserSupabaseClient();
                  await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: getLoginResetRedirect(),
                  });
                  await showNotice({ tone: "success", title: "Reset link sent", message: "Check your email for a password reset link." });
                } catch {}
              },
            },
            { label: "Try again", onClick: () => {} },
          ],
        });
        return;
      }
      const nameFromEmail = email.includes("@") ? email.split("@")[0] : "Meal05 Friend";
      const cleaned = nameFromEmail.replace(/[\.\_\-]+/g, " ").trim();
      const parts = cleaned.split(/\s+/);
      const firstName = (parts[0] || "Meal05").toUpperCase();
      const lastName = (parts[1] || "Friend").toUpperCase();
      const fullName = `${firstName} ${lastName}`.trim();
      const user = { firstName, lastName, fullName, email, ...(phone ? { phone } : {}) };
      persistStoredUser(user);
      try {
        if (rememberMe) {
          window.localStorage.setItem(REMEMBERED_LOGIN_EMAIL_KEY, identifier);
        } else {
          window.localStorage.removeItem(REMEMBERED_LOGIN_EMAIL_KEY);
        }
      } catch {}
      migrateGuestCartToUser(user);
      try {
        await withTimeout(fetch("/api/users/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ first_name: firstName, last_name: lastName }),
        }), 8000, "Profile sync took too long.");
      } catch {}
      window.location.replace(fallbackAfterAuth);
    } catch (e) {
      console.error("Supabase login error", e);
      await showNotice({ tone: "error", title: "Login error", message: e?.message || "Unexpected error during login. Please try again." });
    } finally {
      setIsLoginSubmitting(false);
    }
  }, [fallbackAfterAuth, getLoginResetRedirect, isLoginSubmitting, loginPhoneCountry, rememberMe, showNotice]);

  const handleForgotPassword = useCallback(async (event) => {
    try {
      event?.preventDefault?.();
      const form = typeof document !== "undefined" ? document.getElementById("loginForm") : null;
      const emailInput = form ? form.querySelector("#login-email") : null;
      const email = (emailInput?.value || "").trim();

      if (!EMAIL_REGEX.test(email)) {
        await showNotice({
          tone: "info",
          title: "Enter your email",
          message: "Password reset links are sent by email. Enter your account email to receive a reset link.",
        });
        if (emailInput instanceof HTMLInputElement) {
          emailInput.focus();
        }
        return;
      }

      const supabase = getBrowserSupabaseClient();
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getLoginResetRedirect(),
      });
      await showNotice({
        tone: "success",
        title: "Reset link sent",
        message: "If an account exists for this email, a reset link has been sent.",
      });
    } catch (e) {
      await showNotice({
        tone: "error",
        title: "Reset failed",
        message: e?.message || "Could not send reset link. Please try again.",
      });
    }
  }, [getLoginResetRedirect, showNotice]);

  const handleSignupSubmit = useCallback(async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const firstNameInput = form.elements.namedItem("signup-first-name");
    const lastNameInput = form.elements.namedItem("signup-last-name");
    const emailInput = form.elements.namedItem("signup-email");
    const phoneCountryInput = form.elements.namedItem("signup-phone-country");
    const phoneDigitsInput = form.elements.namedItem("signup-phone");
    const passwordInput = form.elements.namedItem("signup-password");
    const confirmInput = form.elements.namedItem("signup-confirm-password");

    const firstNameRaw = String(formData.get("signup-first-name") || "").trim();
    const lastNameRaw = String(formData.get("signup-last-name") || "").trim();
    const email = String(formData.get("signup-email") || "").trim();
    const phoneCountry =
      String(formData.get("signup-phone-country") || DEFAULT_PHONE_COUNTRY_CODE).trim() ||
      DEFAULT_PHONE_COUNTRY_CODE;
    const phoneRaw = String(formData.get("signup-phone") || "").trim();
    const phoneDigits = phoneRaw.replace(/\D/g, "");
    const phone = `${phoneCountry}${phoneDigits.replace(/^0+/, "")}`;
    const password = String(formData.get("signup-password") || "");
    const confirm = String(formData.get("signup-confirm-password") || "");

    if (firstNameInput instanceof HTMLInputElement) firstNameInput.setCustomValidity("");
    if (lastNameInput instanceof HTMLInputElement) lastNameInput.setCustomValidity("");
    if (emailInput instanceof HTMLInputElement) emailInput.setCustomValidity("");
    if (phoneCountryInput instanceof HTMLSelectElement) phoneCountryInput.setCustomValidity("");
    if (phoneDigitsInput instanceof HTMLInputElement) phoneDigitsInput.setCustomValidity("");
    if (passwordInput instanceof HTMLInputElement) passwordInput.setCustomValidity("");
    if (confirmInput instanceof HTMLInputElement) confirmInput.setCustomValidity("");

    if (!NAME_REGEX.test(firstNameRaw)) {
      if (firstNameInput instanceof HTMLInputElement) {
        firstNameInput.setCustomValidity("First name must contain letters only (A-Z or a-z).");
        firstNameInput.reportValidity();
      }
      return;
    }
    if (!NAME_REGEX.test(lastNameRaw)) {
      if (lastNameInput instanceof HTMLInputElement) {
        lastNameInput.setCustomValidity("Last name must contain letters only (A-Z or a-z).");
        lastNameInput.reportValidity();
      }
      return;
    }

    if (!EMAIL_REGEX.test(email)) {
      if (emailInput instanceof HTMLInputElement) {
        emailInput.setCustomValidity("Email must be letters or numbers followed by @ and end with .com");
        emailInput.reportValidity();
      }
      return;
    }

    if (!PHONE_INPUT_REGEX.test(phoneRaw) || !PHONE_NUMBER_REGEX.test(phoneDigits)) {
      if (phoneDigitsInput instanceof HTMLInputElement) {
        phoneDigitsInput.setCustomValidity("Enter a valid phone number using 4 to 14 digits after the country code.");
        phoneDigitsInput.reportValidity();
      }
      return;
    }

    if (!PASSWORD_REGEX.test(password)) {
      if (passwordInput instanceof HTMLInputElement) {
        passwordInput.setCustomValidity(
          "Password must be at least 8 characters and include uppercase, lowercase, number, and symbol"
        );
        passwordInput.reportValidity();
      }
      return;
    }

    if (password !== confirm) {
      if (confirmInput instanceof HTMLInputElement) {
        confirmInput.setCustomValidity("Passwords must match.");
        confirmInput.reportValidity();
      }
      return;
    }

    // Server-side email verification to avoid non-existent domains
    try {
      const resp = await fetch("/api/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        const msg = data?.message || "This email doesn't appear to be valid. Please enter a valid email.";
        if (emailInput instanceof HTMLInputElement) {
          emailInput.setCustomValidity(msg);
          emailInput.reportValidity();
        }
        return;
      }
    } catch (_) {
      if (emailInput instanceof HTMLInputElement) {
        emailInput.setCustomValidity("Could not verify email right now. Please check and try again.");
        emailInput.reportValidity();
      }
      return;
    }

    // Attempt Supabase sign-up with metadata
    try {
      const supabase = getBrowserSupabaseClient();
      const firstName = firstNameRaw.toUpperCase();
      const lastName = lastNameRaw.toUpperCase();
      const fullName = `${firstName} ${lastName}`.trim();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getSignupConfirmRedirect(),
          data: {
            name: fullName,
            first_name: firstName,
            last_name: lastName,
            phone,
          },
        },
      });

      if (error) {
        const msg = String(error.message || "").toLowerCase();
        if (msg.includes("already") && (msg.includes("registered") || msg.includes("exists"))) {
          await showNotice({
            tone: "info",
            title: "Account already exists",
            message: "You already have an account with this email. Redirecting to login...",
          });
          setTimeout(() => { window.location.replace(loginTabHref); }, 1200);
          return;
        }
        await showNotice({ tone: "error", title: "Signup failed", message: error.message || "Please try again." });
        return;
      }

      // Supabase nuance: if user already exists, identities array can be empty
      const identities = data?.user?.identities;
      if (Array.isArray(identities) && identities.length === 0) {
        await showNotice({
          tone: "info",
          title: "Account already exists",
          message: "You already have an account with this email.",
          autoClose: false,
          actions: [
            { label: "Go to Login", variant: "primary", onClick: () => { window.location.replace(loginTabHref); } },
            { label: "Forgot password", onClick: async () => {
              try { const supabase = getBrowserSupabaseClient(); await supabase.auth.resetPasswordForEmail(email, { redirectTo: getLoginResetRedirect() }); await showNotice({ tone: "success", title: "Reset link sent", message: "Check your email for a password reset link." }); } catch {}
            } },
          ],
        });
        return;
      }

      const user = { firstName, lastName, fullName, email, phone };
      if (!data?.session) {
        await showNotice({
          tone: "success",
          title: "Confirm your email",
          message: "Please check your email to confirm your account, then sign in.",
        });
        setTimeout(() => { window.location.replace(loginTabHref); }, 1400);
        return;
      }

      persistStoredUser(user);
      migrateGuestCartToUser(user);
      // If email confirmation is disabled and a session exists, sync names into public.users
      try {
        if (data?.session) {
          await fetch("/api/users/sync", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ first_name: firstName, last_name: lastName, phone }),
          });
        }
      } catch {}

      window.location.replace(fallbackAfterAuth);
    } catch (e) {
      console.error("Supabase signup error", e);
      await showNotice({ tone: "error", title: "Signup error", message: "Unexpected error during signup. Please try again." });
    }
  }, [fallbackAfterAuth, getLoginResetRedirect, getSignupConfirmRedirect, loginTabHref, showNotice]);

  const handleRecoverySubmit = useCallback(async (event) => {
    event.preventDefault();
    setRecoveryError("");
    if (!PASSWORD_REGEX.test(recoveryPassword)) {
      setRecoveryError("Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.");
      return;
    }
    if (recoveryPassword !== recoveryConfirm) {
      setRecoveryError("Passwords must match.");
      return;
    }
    setIsSavingRecoveryPassword(true);
    try {
      const supabase = getBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password: recoveryPassword });
      if (error) {
        setRecoveryError(error.message || "Could not update password. Please request a new reset link.");
        return;
      }
      clearStoredUser();
      await supabase.auth.signOut();
      await showNotice({
        tone: "success",
        title: "Password updated",
        message: "Your password has been updated. Sign in with the new password.",
      });
      window.location.replace(loginTabHref);
    } catch (error) {
      setRecoveryError(error?.message || "Could not update password. Please request a new reset link.");
    } finally {
      setIsSavingRecoveryPassword(false);
    }
  }, [loginTabHref, recoveryConfirm, recoveryPassword, showNotice]);

  useEffect(() => {
    const existing = readStoredUser();
    if (existing && !isPasswordRecovery) {
      window.location.replace(fallbackAfterAuth);
    }
  }, [fallbackAfterAuth, isPasswordRecovery]);

  const isLoginActive = activeTab === "login";

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <aside className="auth-aside" aria-label="Meal05 membership highlights">
          <div className="auth-aside-inner">
            <div>
              <span className="auth-aside-badge"><span aria-hidden="true" />Meal05 community</span>
              <h1 className="auth-aside-title">Groceries done in <span>05 minutes.</span></h1>
              <p className="auth-aside-text">
                Stay on top of your kitchen with active fleet tracking and hyper-local sourcing across Ibadan.
              </p>
              <ul className="auth-aside-list">
                <li>
                  <i className="fa-solid fa-check" aria-hidden="true" />
                  <span><strong>Same-day delivery across Ibadan</strong></span>
                </li>
                <li>
                  <i className="fa-solid fa-check" aria-hidden="true" />
                  <span><strong>Chef-picked seasonal bundles</strong></span>
                </li>
                <li>
                  <i className="fa-solid fa-check" aria-hidden="true" />
                  <span><strong>Secure payments and instant tracking</strong></span>
                </li>
              </ul>
            </div>
            <div className="auth-aside-bottom">
              <div className="auth-aside-stats" aria-label="Meal05 service highlights">
                <span><strong>Ibadan</strong><small>launch city</small></span>
                <span><strong>Live</strong><small>order tracking</small></span>
                <span><strong>SSL</strong><small>secure checkout</small></span>
              </div>
              <p className="auth-aside-footer">
                Need help logging in?{' '}
                <Link href="/help-center">Talk to our concierge</Link>
              </p>
            </div>
          </div>
        </aside>

        <section className="auth-panel" aria-label="Meal05 authentication">
          <div className="auth-panel-header auth-panel-header--top">
            <button type="button" className="auth-back-btn" onClick={handleNavigateBack}>
              <i className="fa-solid fa-arrow-left" aria-hidden="true" />
              <span>Back to store</span>
            </button>
            <Link href="/" className="auth-panel-logo" aria-label="Meal05 home">
              <Image src={BRAND_WORDMARK_SRC} alt="Meal05" width={94} height={40} priority />
            </Link>
          </div>

          <div className="auth-panel-header auth-panel-header--copy">
            <div className="auth-panel-heading">
              <h2>{isPasswordRecovery ? "Update password" : isLoginActive ? "Welcome back" : "Create your account"}</h2>
              <p>
                {isPasswordRecovery
                  ? "Choose a new password for your Meal05 account."
                  : isLoginActive
                    ? "Continue shopping with your saved cart and delivery details."
                    : "Set up your profile for faster food orders."}
              </p>
            </div>
          </div>

          {isPasswordRecovery ? (
            <form className="auth-form is-active" onSubmit={handleRecoverySubmit}>
              <div className="auth-field">
                <label className="auth-label" htmlFor="recovery-password">
                  New password
                </label>
                <div className="auth-password-group">
                  <input
                    id="recovery-password"
                    type={showRecoveryPassword ? "text" : "password"}
                    name="recovery-password"
                    placeholder="New password"
                    required
                    autoComplete="new-password"
                    pattern={PASSWORD_PATTERN}
                    value={recoveryPassword}
                    onChange={(event) => {
                      setRecoveryPassword(event.target.value);
                      setRecoveryError("");
                    }}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    aria-label={showRecoveryPassword ? "Hide password" : "Show password"}
                    aria-pressed={showRecoveryPassword}
                    onClick={() => setShowRecoveryPassword((state) => !state)}
                    title={showRecoveryPassword ? "Hide password" : "Show password"}
                  >
                    <i className={`fa-regular ${showRecoveryPassword ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="recovery-confirm-password">
                  Confirm new password
                </label>
                <div className="auth-password-group">
                  <input
                    id="recovery-confirm-password"
                    type={showRecoveryConfirm ? "text" : "password"}
                    name="recovery-confirm-password"
                    placeholder="Confirm new password"
                    required
                    autoComplete="new-password"
                    pattern={PASSWORD_PATTERN}
                    value={recoveryConfirm}
                    onChange={(event) => {
                      setRecoveryConfirm(event.target.value);
                      setRecoveryError("");
                    }}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    aria-label={showRecoveryConfirm ? "Hide password" : "Show password"}
                    aria-pressed={showRecoveryConfirm}
                    onClick={() => setShowRecoveryConfirm((state) => !state)}
                    title={showRecoveryConfirm ? "Hide password" : "Show password"}
                  >
                    <i className={`fa-regular ${showRecoveryConfirm ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <button type="submit" className="auth-primary-btn" disabled={isSavingRecoveryPassword}>
                <span>{isSavingRecoveryPassword ? "Updating..." : "Update password"}</span>
                <i className="fa-solid fa-chevron-right" aria-hidden="true" />
              </button>
              {recoveryError ? (
                <p className="auth-inline-error" role="alert">
                  {recoveryError}
                </p>
              ) : null}
            </form>
          ) : (
            <>
          <div className="auth-tabs" role="tablist" aria-label="Authentication tabs">
            {TAB_OPTIONS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                id={`${tab.key}-tab`}
                aria-controls={tab.hash.substring(1)}
                aria-selected={activeTab === tab.key}
                className={`auth-tab${activeTab === tab.key ? " is-active" : ""}`}
                onClick={() => handleTabChange(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="auth-forms">
            <form
              id="loginForm"
              className={`auth-form${isLoginActive ? " is-active" : ""}`}
              aria-hidden={!isLoginActive}
              aria-labelledby="login-tab"
              onSubmit={handleLoginSubmit}
            >
              <div className="auth-field">
                <label className="auth-label" htmlFor="login-email">
                  Email or phone number
                </label>
                <div className="auth-phone-group auth-phone-group--login">
                  <label className="sr-only" htmlFor="login-phone-country">
                    Country code
                  </label>
                  <select
                    id="login-phone-country"
                    name="login-phone-country"
                    className="auth-phone-select"
                    value={loginPhoneCountry}
                    onChange={(event) => setLoginPhoneCountry(event.target.value)}
                    aria-label="Phone country code"
                  >
                    {PHONE_COUNTRY_OPTIONS.map((option) => (
                      <option key={option.iso} value={option.code}>
                        {`${option.iso} ${option.code}`}
                      </option>
                    ))}
                  </select>
                  <input
                    id="login-email"
                    type="text"
                    name="login-email"
                    className="auth-phone-input"
                    placeholder="Email or phone number"
                    required
                    autoComplete="username"
                    value={loginIdentifier}
                    onChange={(event) => {
                      setLoginIdentifier(event.target.value);
                      clearLoginInlineHint();
                    }}
                  />
                </div>
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="login-password">
                  Password
                </label>
                <div className="auth-password-group">
                  <input
                    id="login-password"
                    type={showLoginPassword ? "text" : "password"}
                    name="login-password"
                    placeholder="Password"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    aria-label={showLoginPassword ? "Hide password" : "Show password"}
                    aria-pressed={showLoginPassword}
                    onClick={() => setShowLoginPassword((s) => !s)}
                    title={showLoginPassword ? "Hide password" : "Show password"}
                  >
                    <i className={`fa-regular ${showLoginPassword ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="auth-login-options">
                <label className="auth-remember" htmlFor="login-remember">
                  <input
                    id="login-remember"
                    name="login-remember"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                  />
                  <span>Remember me</span>
                </label>
                <Link href="#" onClick={handleForgotPassword}>Forgot password?</Link>
              </div>
              <button type="submit" className="auth-primary-btn" disabled={isLoginSubmitting} aria-busy={isLoginSubmitting}>
                <span>{isLoginSubmitting ? "Signing in..." : "Sign in"}</span>
                <i className="fa-solid fa-chevron-right" aria-hidden="true" />
              </button>

              <div className="auth-divider">
                <span>or</span>
              </div>

              <button type="button" className="auth-google-btn" onClick={handleGoogleSignIn}>
                <GoogleIcon />
                Continue with Google
              </button>

              <p className="auth-switch">
                Don&apos;t have an account?{' '}
              <button type="button" onClick={() => handleTabChange('signup')}>
                Create account
              </button>
            </p>
            <p id="login-inline-hint" className="auth-inline-error" aria-live="polite"></p>
          </form>

            <form
              id="signupForm"
              className={`auth-form${!isLoginActive ? " is-active" : ""}`}
              aria-hidden={isLoginActive}
              aria-labelledby="signup-tab"
              onSubmit={handleSignupSubmit}
            >
              <div className="auth-field auth-field--split">
                <div className="auth-field-half">
                  <label className="auth-label" htmlFor="signup-first-name">
                    First name
                  </label>
                  <input
                    id="signup-first-name"
                    type="text"
                    name="signup-first-name"
                    placeholder="First Name"
                    required
                    autoComplete="given-name"
                    pattern={NAME_PATTERN}
                    title="Only letters A-Z are allowed in your first name"
                  />
                </div>
                <div className="auth-field-half">
                  <label className="auth-label" htmlFor="signup-last-name">
                    Last name
                  </label>
                  <input
                    id="signup-last-name"
                    type="text"
                    name="signup-last-name"
                    placeholder="Last Name"
                    required
                    autoComplete="family-name"
                    pattern={NAME_PATTERN}
                    title="Only letters A-Z are allowed in your last name"
                  />
                </div>
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="signup-email">
                  Email address
                </label>
                <input
                  id="signup-email"
                  type="email"
                  name="signup-email"
                  placeholder="Email"
                  required
                  autoComplete="email"
                  pattern={EMAIL_PATTERN}
                  title="Use letters or numbers, followed by @, ending with .com (e.g. username@domain.com)"
                  onInput={(e) => { try { e.currentTarget.setCustomValidity(""); } catch {} }}
                />
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="signup-phone">
                  Phone number
                </label>
                <div className="auth-phone-group">
                  <label className="sr-only" htmlFor="signup-phone-country">
                    Country code
                  </label>
                  <select
                    id="signup-phone-country"
                    name="signup-phone-country"
                    className="auth-phone-select"
                    defaultValue={DEFAULT_PHONE_COUNTRY_CODE}
                    required
                  >
                    {PHONE_COUNTRY_OPTIONS.map((option) => (
                      <option key={option.iso} value={option.code}>
                        {`${option.iso} ${option.code}`}
                      </option>
                    ))}
                  </select>
                  <input
                    id="signup-phone"
                    type="tel"
                    name="signup-phone"
                    className="auth-phone-input"
                    placeholder="8120000000"
                    required
                    autoComplete="tel"
                    inputMode="numeric"
                    pattern={PHONE_INPUT_PATTERN}
                    minLength={4}
                    maxLength={24}
                    title="Enter 4 to 14 digits after the country code. Spaces, dashes, dots, and brackets are allowed."
                    onInput={(e) => { try { e.currentTarget.setCustomValidity(""); } catch {} }}
                  />
                </div>
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="signup-password">
                  Password
                </label>
                <div className="auth-password-group">
                  <input
                    id="signup-password"
                    type={showSignupPassword ? "text" : "password"}
                    name="signup-password"
                    placeholder="Password"
                    required
                    autoComplete="new-password"
                    pattern={PASSWORD_PATTERN}
                    title="Password must be 8+ characters with uppercase, lowercase, number, and symbol"
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    aria-label={showSignupPassword ? "Hide password" : "Show password"}
                    aria-pressed={showSignupPassword}
                    onClick={() => setShowSignupPassword((s) => !s)}
                    title={showSignupPassword ? "Hide password" : "Show password"}
                  >
                    <i className={`fa-regular ${showSignupPassword ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="signup-confirm-password">
                  Confirm password
                </label>
                <div className="auth-password-group">
                  <input
                    id="signup-confirm-password"
                    type={showSignupConfirm ? "text" : "password"}
                    name="signup-confirm-password"
                    placeholder="Confirm Password"
                    required
                    autoComplete="new-password"
                    pattern={PASSWORD_PATTERN}
                    title="Password must be 8+ characters with uppercase, lowercase, number, and symbol"
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    aria-label={showSignupConfirm ? "Hide password" : "Show password"}
                    aria-pressed={showSignupConfirm}
                    onClick={() => setShowSignupConfirm((s) => !s)}
                    title={showSignupConfirm ? "Hide password" : "Show password"}
                  >
                    <i className={`fa-regular ${showSignupConfirm ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <button type="submit" className="auth-primary-btn">
                <span>Create account</span>
                <i className="fa-solid fa-chevron-right" aria-hidden="true" />
              </button>

              <div className="auth-divider">
                <span>or</span>
              </div>

              <button type="button" className="auth-google-btn" onClick={handleGoogleSignIn}>
                <GoogleIcon />
                Continue with Google
              </button>

              <p className="auth-switch">
                Already have an account?{' '}
                <button type="button" onClick={() => handleTabChange('login')}>
                  Sign in
                </button>
              </p>
            </form>
          </div>
            </>
          )}

          <p className="auth-disclaimer">
            By using Meal05 you agree to our{' '}
            <Link href="/terms">Terms and Conditions</Link>
            {' '}and{' '}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </section>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="auth-page"><div className="auth-shell">Loading...</div></main>}>
      <SignInPageContent />
    </Suspense>
  );
}
