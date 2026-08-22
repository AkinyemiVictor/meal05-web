"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  IconArrowLeft,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconKey,
  IconLock,
  IconMail,
  IconShieldCheck,
} from "@tabler/icons-react";

import styles from "./change-password.module.css";
import { buildAuthCallbackUrl, buildSignInHref } from "@/lib/auth-redirect";
import { PASSWORD_RECOVERY_PATH } from "@/lib/auth/password-recovery";
import { getPasswordRequirements, isStrongPassword } from "@/lib/password-policy";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";

const recoveryRedirectUrl = () => {
  if (typeof window === "undefined") return "";
  return buildAuthCallbackUrl({
    currentOrigin: window.location.origin,
    flow: "recovery",
    next: PASSWORD_RECOVERY_PATH,
  });
};

function PasswordField({ autoComplete, label, name, onChange, value }) {
  const [visible, setVisible] = useState(false);

  return (
    <label className={styles.field}>
      <span>{label}</span>
      <span className={styles.inputShell}>
        <IconLock aria-hidden="true" size={19} stroke={1.8} />
        <input
          autoComplete={autoComplete}
          id={name}
          maxLength={256}
          name={name}
          onChange={(event) => onChange(event.target.value)}
          required
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          className={styles.visibilityButton}
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? <IconEyeOff aria-hidden="true" size={19} /> : <IconEye aria-hidden="true" size={19} />}
        </button>
      </span>
    </label>
  );
}

export default function ChangePasswordClient({ recoveryAuthorized = false }) {
  const router = useRouter();
  const [accountEmail, setAccountEmail] = useState("");
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sendingRecovery, setSendingRecovery] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [success, setSuccess] = useState(false);
  const [warning, setWarning] = useState("");

  const requirements = useMemo(() => getPasswordRequirements(newPassword), [newPassword]);
  const matches = Boolean(confirmPassword) && newPassword === confirmPassword;
  const canSubmit =
    !loadingAccount &&
    !submitting &&
    isStrongPassword(newPassword) &&
    matches &&
    (recoveryAuthorized || Boolean(currentPassword));

  useEffect(() => {
    let active = true;

    getBrowserSupabaseClient()
      .auth.getUser()
      .then(({ data, error: authError }) => {
        if (!active) return;
        if (authError || !data?.user) {
          router.replace(buildSignInHref({ tab: "login", next: "/account/change-password" }));
          return;
        }
        setAccountEmail(data.user.email || "");
        setLoadingAccount(false);
      })
      .catch(() => {
        if (!active) return;
        router.replace(buildSignInHref({ tab: "login", next: "/account/change-password" }));
      });

    return () => {
      active = false;
    };
  }, [router]);

  const sendRecoveryLink = async () => {
    if (!accountEmail || sendingRecovery) return;
    setError("");
    setInfo("");
    setSendingRecovery(true);
    try {
      const { error: recoveryError } = await getBrowserSupabaseClient().auth.resetPasswordForEmail(accountEmail, {
        redirectTo: recoveryRedirectUrl(),
      });
      if (recoveryError) throw recoveryError;
      setInfo(`A secure password link has been sent to ${accountEmail}.`);
    } catch (recoveryError) {
      setError(recoveryError?.message || "We could not send a recovery link. Please try again.");
    } finally {
      setSendingRecovery(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    setError("");
    setInfo("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
          recovery: recoveryAuthorized,
          signOutOthers,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          router.replace(buildSignInHref({ tab: "login", next: "/account/change-password" }));
          return;
        }
        throw new Error(payload.error || "We could not update your password. Please try again.");
      }

      setWarning(payload.warning || "");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } catch (submitError) {
      setError(submitError?.message || "We could not update your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <Link className={styles.backLink} href="/account?tab=management">
          <IconArrowLeft aria-hidden="true" size={18} />
          Back to account management
        </Link>

        <section className={styles.card} aria-labelledby="change-password-title">
          {success ? (
            <div className={styles.successPanel} role="status">
              <span className={styles.successIcon}>
                <IconCheck aria-hidden="true" size={38} stroke={2.4} />
              </span>
              <p className={styles.eyebrow}>Account secured</p>
              <h1>Password changed</h1>
              <p>
                Your new password is active. Use it the next time you sign in.
              </p>
              {warning ? <p className={styles.warning}>{warning}</p> : null}
              <Link className={styles.primaryLink} href="/account?tab=management">
                Return to my account
              </Link>
            </div>
          ) : (
            <>
              <header className={styles.header}>
                <span className={styles.headerIcon}>
                  {recoveryAuthorized ? <IconKey aria-hidden="true" /> : <IconShieldCheck aria-hidden="true" />}
                </span>
                <div>
                  <p className={styles.eyebrow}>{recoveryAuthorized ? "Secure recovery" : "Account security"}</p>
                  <h1 id="change-password-title">
                    {recoveryAuthorized ? "Choose a new password" : "Change your password"}
                  </h1>
                  <p>
                    {recoveryAuthorized
                      ? "Your recovery link is verified. Set a strong new password below."
                      : "Confirm your current password, then choose a new one for your Meal05 account."}
                  </p>
                </div>
              </header>

              {loadingAccount ? (
                <div className={styles.loading} role="status">Checking your secure session...</div>
              ) : (
                <form className={styles.form} onSubmit={handleSubmit}>
                  {accountEmail ? (
                    <div className={styles.accountEmail}>
                      <IconMail aria-hidden="true" size={18} />
                      <span>Changing password for <strong>{accountEmail}</strong></span>
                    </div>
                  ) : null}

                  {!recoveryAuthorized ? (
                    <PasswordField
                      autoComplete="current-password"
                      label="Current password"
                      name="currentPassword"
                      onChange={setCurrentPassword}
                      value={currentPassword}
                    />
                  ) : null}

                  <PasswordField
                    autoComplete="new-password"
                    label="New password"
                    name="newPassword"
                    onChange={setNewPassword}
                    value={newPassword}
                  />

                  <ul className={styles.requirements} aria-label="Password requirements">
                    {requirements.map((requirement) => (
                      <li className={requirement.met ? styles.requirementMet : ""} key={requirement.key}>
                        <IconCheck aria-hidden="true" size={15} stroke={2.5} />
                        {requirement.label}
                      </li>
                    ))}
                  </ul>

                  <PasswordField
                    autoComplete="new-password"
                    label="Confirm new password"
                    name="confirmPassword"
                    onChange={setConfirmPassword}
                    value={confirmPassword}
                  />
                  {confirmPassword ? (
                    <p className={matches ? styles.match : styles.noMatch}>
                      {matches ? "Passwords match." : "Passwords do not match."}
                    </p>
                  ) : null}

                  <label className={styles.checkboxRow}>
                    <input
                      checked={signOutOthers}
                      onChange={(event) => setSignOutOthers(event.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      <strong>Sign out other devices</strong>
                      <small>Recommended if you think someone else may know your password.</small>
                    </span>
                  </label>

                  {error ? <p className={styles.error} role="alert">{error}</p> : null}
                  {info ? <p className={styles.info} role="status">{info}</p> : null}

                  <button className={styles.submitButton} disabled={!canSubmit} type="submit">
                    {submitting ? "Updating password..." : "Update password"}
                  </button>

                  {!recoveryAuthorized ? (
                    <div className={styles.recoveryBox}>
                      <div>
                        <strong>Forgot your current password or signed up with Google?</strong>
                        <p>Use a secure email link to choose a password without entering the old one.</p>
                      </div>
                      <button disabled={sendingRecovery || !accountEmail} onClick={sendRecoveryLink} type="button">
                        {sendingRecovery ? "Sending..." : "Email me a secure link"}
                      </button>
                    </div>
                  ) : null}
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
