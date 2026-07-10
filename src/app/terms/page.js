import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import styles from "../legal.module.css";

export const metadata = {
  title: "Terms and Conditions | Meal05",
  description: "Terms governing use of Meal05 and grocery orders.",
};

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link className={styles.back} href="/">
          <IconArrowLeft size={17} /> Back to Meal05
        </Link>
        <header className={styles.hero}>
          <span className={styles.eyebrow}>Meal05 legal</span>
          <h1>Terms and Conditions</h1>
          <p>
            These terms govern your use of Meal05 and orders for groceries and related delivery
            services.
          </p>
          <span className={styles.updated}>Effective 1 July 2026</span>
        </header>
        <div className={styles.notice}>
          This operational draft is designed for Meal05&apos;s current service and should be reviewed by
          qualified Nigerian counsel before public launch.
        </div>
        <article className={styles.content}>
          <section>
            <h2>Contents</h2>
            <p className={styles.contents}>
              <a href="#service">1. Our service</a>
              <a href="#accounts">2. Accounts</a>
              <a href="#orders">3. Orders and availability</a>
              <a href="#prices">4. Prices and payment</a>
              <a href="#delivery">5. Delivery</a>
              <a href="#returns">6. Cancellations and returns</a>
              <a href="#promotions">7. Promotions</a>
              <a href="#conduct">8. Acceptable use</a>
              <a href="#liability">9. Responsibility</a>
              <a href="#changes">10. Changes and law</a>
            </p>
          </section>
          <section id="service">
            <h2>1. Our service</h2>
            <p>
              Meal05 provides an online marketplace for fresh produce, proteins, pantry goods and
              related delivery services. Service areas, delivery windows and available products may
              change. Product images are illustrative; natural products may vary in size, colour and
              appearance.
            </p>
          </section>
          <section id="accounts">
            <h2>2. Accounts and eligibility</h2>
            <p>
              You must provide accurate contact, delivery and payment information and keep account
              credentials secure. You are responsible for activity authorised through your account.
              Tell us promptly if you suspect unauthorised use.
            </p>
          </section>
          <section id="orders">
            <h2>3. Orders, stock and substitutions</h2>
            <p>
              An order is accepted when Meal05 confirms it. Items remain subject to availability and
              quality checks. We will not knowingly substitute an item without applying the substitution
              preference presented during checkout or contacting you where appropriate. If we cannot
              supply an item, we may remove it and issue the applicable refund.
            </p>
          </section>
          <section id="prices">
            <h2>4. Prices and payment</h2>
            <p>
              Prices are shown in Nigerian naira. Delivery charges, discounts and the final total are
              disclosed before payment. Payment is processed by the payment provider shown at checkout;
              Meal05 does not ask you to send card credentials by email or chat. Obvious pricing errors
              may be corrected before fulfilment, and you may cancel if you do not accept the corrected
              price.
            </p>
          </section>
          <section id="delivery">
            <h2>5. Delivery and collection</h2>
            <p>
              Provide a complete, accessible address and a reachable phone number. Delivery estimates
              are not guarantees, but we will provide reasonable updates about material delays. Risk
              passes when the order is delivered to you or a person you authorise. Additional charges
              caused by an incorrect address or repeated failed delivery will be disclosed before being
              charged.
            </p>
          </section>
          <section id="returns">
            <h2>6. Cancellations, quality complaints and refunds</h2>
            <p>
              You may request cancellation before picking or preparation begins. Reasonable costs already
              incurred may apply where permitted and disclosed. Inspect perishables promptly and report
              missing, unsafe, damaged or materially defective items with useful evidence through our{" "}
              <Link href="/help-center">Help Centre</Link>. Eligible remedies may include replacement,
              account credit or refund to the original payment method.
            </p>
            <p>
              Nothing in these terms removes rights or remedies that cannot lawfully be excluded under
              Nigerian consumer-protection law.
            </p>
          </section>
          <section id="promotions">
            <h2>7. Promotions and credits</h2>
            <p>
              Promotion eligibility, duration, minimum basket value and redemption limits are stated with
              each offer. Unless stated otherwise, offers cannot be combined, transferred or exchanged
              for cash. We may reject fraudulent or abusive use without affecting legitimate consumer
              rights.
            </p>
          </section>
          <section id="conduct">
            <h2>8. Acceptable use and intellectual property</h2>
            <p>
              Do not misuse the service, interfere with security, scrape the catalogue at scale, submit
              false orders, abuse promotions or violate another person&apos;s rights. Meal05 branding,
              interface content and original materials may not be commercially reused without permission.
            </p>
          </section>
          <section id="liability">
            <h2>9. Our responsibility</h2>
            <p>
              We are responsible for supplying services with reasonable care and for remedies required by
              applicable law. We are not responsible for losses caused solely by events outside reasonable
              control, inaccurate information you supplied, or unauthorised account use you failed to
              report. We do not exclude liability where exclusion is prohibited, including liability
              arising from fraud, wilful misconduct or rights guaranteed by law.
            </p>
          </section>
          <section id="changes">
            <h2>10. Changes, suspension and governing law</h2>
            <p>
              We may update these terms prospectively and will publish the effective date. Material
              changes affecting existing users will be communicated reasonably. We may suspend access to
              protect customers, investigate abuse or meet legal obligations. These terms are governed by
              the laws of the Federal Republic of Nigeria, subject to applicable consumer rights and
              competent dispute-resolution forums.
            </p>
          </section>
          <section className={styles.contact}>
            <h2>Questions or complaints</h2>
            <p>
              Contact Meal05 through our <Link href="/contact-us">contact page</Link> or{" "}
              <Link href="/help-center">Help Centre</Link>. Please include your order number where
              relevant.
            </p>
          </section>
        </article>
        <p className={styles.footer}>
          Also read our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}
