import Link from "next/link";
import { IconArrowLeft, IconTrash } from "@tabler/icons-react";

import styles from "../legal.module.css";

export const metadata = {
  title: "Delete your Meal05 account",
  description: "How to permanently delete a Meal05 account and its associated personal data.",
};

export default function DeleteAccountPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link className={styles.back} href="/">
          <IconArrowLeft size={17} aria-hidden="true" /> Back to Meal05
        </Link>
        <header className={styles.hero}>
          <span className={styles.eyebrow}>Account and data</span>
          <h1>Delete your Meal05 account</h1>
          <p>You can permanently delete your account from the Meal05 app or from your secure account settings on the web.</p>
        </header>
        <article className={styles.content}>
          <section>
            <h2>Delete from the app</h2>
            <ol>
              <li>Open Profile.</li>
              <li>Choose Account details, then Delete account.</li>
              <li>Review the warning and confirm permanent deletion.</li>
            </ol>
          </section>
          <section>
            <h2>Delete on the web</h2>
            <p>Sign in to Meal05, open Account management, and choose Delete account.</p>
            <p>
              <Link href="/account/management"><IconTrash size={16} aria-hidden="true" /> Open secure account management</Link>
            </p>
          </section>
          <section>
            <h2>What is deleted</h2>
            <p>Your authentication account, profile, saved addresses, cart, favourites, ratings, payment-method references, notifications, and wallet records are deleted. Personal delivery details on completed orders are anonymised.</p>
          </section>
          <section>
            <h2>Before deletion can complete</h2>
            <p>Active orders must be completed or cancelled, and your Meal05 Balance must be zero. Records that Meal05 must keep for accounting, fraud prevention, disputes, or another legal obligation may be retained without keeping them connected to your active customer profile.</p>
          </section>
          <section className={styles.contact}>
            <h2>Need help?</h2>
            <p>Email <a href="mailto:support@meal05.com?subject=Meal05%20account%20deletion">support@meal05.com</a> from the address on your account and use “Meal05 account deletion” as the subject.</p>
          </section>
        </article>
        <p className={styles.footer}>Read the <Link href="/privacy">Meal05 Privacy Policy</Link>.</p>
      </div>
    </main>
  );
}
