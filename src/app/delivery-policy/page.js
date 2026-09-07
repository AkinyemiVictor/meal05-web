import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import styles from "../legal.module.css";

export const metadata = {
  title: "Delivery Policy | Meal05",
  description: "Meal05 delivery coverage, cut-off times, fulfilment windows, fees and issue handling.",
};

export default function DeliveryPolicyPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link className={styles.back} href="/home">
          <IconArrowLeft size={17} /> Back to Meal05
        </Link>

        <header className={styles.hero}>
          <span className={styles.eyebrow}>Delivery and fulfilment</span>
          <h1>Delivery Policy</h1>
          <p>
            This policy explains where Meal05 currently delivers, the available delivery schedules, how delivery fees
            work, and what happens if an item is unavailable or a delivery cannot be completed.
          </p>
          <span className={styles.updated}>Effective 7 September 2026</span>
        </header>

        <article className={styles.content}>
          <section>
            <h2>Contents</h2>
            <p className={styles.contents}>
              <a href="#areas">1. Delivery areas</a>
              <a href="#window">2. Delivery schedules and windows</a>
              <a href="#fees">3. Delivery charges</a>
              <a href="#fulfilment">4. How orders are fulfilled</a>
              <a href="#substitutions">5. Substitutions and unavailable items</a>
              <a href="#failed">6. Failed delivery</a>
              <a href="#issues">7. Delivery issues</a>
              <a href="#changes">8. Policy changes</a>
            </p>
          </section>

          <section id="areas">
            <h2>1. Delivery areas</h2>
            <p>
              Meal05 uses the exact delivery location you secure on the map to calculate the distance from the Meal05
              Hub. Place the pin at the entrance where the rider should reach you.
            </p>
            <ul>
              <li><strong>Core zone:</strong> 0–5 km from the Meal05 Hub.</li>
              <li><strong>Extended zone:</strong> over 5 km and up to 10 km.</li>
              <li><strong>Extended Plus zone:</strong> over 10 km and up to 20 km.</li>
            </ul>
            <p>Addresses outside the active extended-delivery area can use an official pickup station shown at checkout.</p>
          </section>

          <section id="window">
            <h2>2. Delivery schedules and windows</h2>
            <p>
              Meal05 currently offers scheduled delivery rather than same-day delivery. Choose the timing that works
              for you at checkout.
            </p>
            <ul>
              <li><strong>24-hour option:</strong> 4:00 PM to 6:00 PM on the next day</li>
              <li><strong>48-hour option:</strong> 4:00 PM to 6:00 PM in two days</li>
            </ul>
            <p>
              Delivery times are estimates rather than guarantees, but we will make reasonable efforts to notify you
              of material delays.
            </p>
          </section>

          <section id="fees">
            <h2>3. Delivery charges</h2>
            <p>
              Delivery fees are calculated at checkout based on the serviceable zone and the fulfilment settings
              applicable to your secured address. The launch rates are ₦1,500 for the Core zone, ₦2,500 for Extended,
              and ₦3,500 for Extended Plus. Where packaging fees apply, they are shown separately.
            </p>
            <p>
              The final amount displayed at checkout — including subtotal, packaging fee, delivery fee and any valid
              discount — is the amount charged for the order. Meal05 does not add hidden delivery charges after payment
              for a successfully confirmed order.
            </p>
          </section>

          <section>
            <h2>Pickup</h2>
            <p>
              Customers may choose an active Meal05 pickup station at checkout and collect during its displayed opening
              hours. Pickup has no delivery fee. A church, roadside meeting point or other informal handover location is
              not a pickup station unless Meal05 deliberately lists it as one at checkout.
            </p>
          </section>

          <section id="fulfilment">
            <h2>4. How orders are fulfilled</h2>
            <ol>
              <li>Farmers and suppliers confirm product availability each morning.</li>
              <li>Customers choose a 24-hour or 48-hour schedule at checkout.</li>
              <li>Produce and grocery items are sourced, checked and packed for the selected schedule.</li>
              <li>Orders are dispatched during the applicable 4:00 PM to 6:00 PM delivery window.</li>
            </ol>
            <p>
              This scheduled sourcing model is intended to reduce storage time and help preserve freshness between
              farm, packaging and delivery.
            </p>
          </section>

          <section id="substitutions">
            <h2>5. Substitutions and unavailable items</h2>
            <p>
              Because fulfilment depends on supplier availability, an item may occasionally become unavailable after
              your order is placed. Where that happens, Meal05 may contact you before dispatch to offer a suitable
              replacement of equal or greater value or remove the item and issue the applicable refund.
            </p>
            <p>
              Our approach follows the standard grocery-delivery pattern used by large platforms: unavailable items are
              either replaced with customer approval or refunded rather than silently charged without a remedy.
            </p>
          </section>

          <section id="failed">
            <h2>6. Failed delivery</h2>
            <p>
              Please provide an accurate address, a useful landmark and a reachable phone number for the delivery
              window. If our rider cannot safely complete delivery or cannot reach you using the details provided, we
              will attempt to contact you using the information on the order.
            </p>
            <p>
              If we are unable to complete delivery within a reasonable time, Meal05 may reschedule delivery, charge a
              disclosed redelivery fee where appropriate, convert the order to another available fulfilment option, or
              cancel and refund the affected order or items where required by food-safety, quality or operational
              constraints.
            </p>
          </section>

          <section id="issues">
            <h2>7. Delivery issues</h2>
            <p>
              If your order arrives damaged, incomplete, incorrect, or materially below expected quality, contact
              Meal05 as soon as possible and preferably within 24 hours of delivery so we can review the issue while the
              order details are still current.
            </p>
            <ul>
              <li><strong>Email:</strong> <a href="mailto:support@meal05.com">support@meal05.com</a></li>
              <li><strong>Website:</strong> <a href="https://meal05.com">meal05.com</a></li>
            </ul>
            <p>
              Depending on the issue, the remedy may include replacement, redelivery, account credit or refund to the
              original payment method. Please include your order number and any useful photos where relevant.
            </p>
          </section>

          <section id="changes">
            <h2>8. Policy changes</h2>
            <p>
              Meal05 may update this policy from time to time as our delivery network, sourcing model, fees or legal
              obligations evolve. The current version and effective date will remain available on this page, and
              material operational changes will be reflected prospectively.
            </p>
          </section>
        </article>

        <p className={styles.footer}>
          Also read our <Link href="/terms">Terms and Conditions</Link> and <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}
