import Link from "next/link";
import { notFound } from "next/navigation";
import PrintManifestButton from "@/components/print-manifest-button";
import { loadDeliveryManifest } from "@/lib/delivery/riders";
import styles from "./manifest.module.css";

export const dynamic = "force-dynamic";

const text = (value) =>
  String(value || "—")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const dateTime = (value) => {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(date);
};

export default async function DeliveryManifestPage({ params }) {
  const { routeId } = await params;
  const manifest = await loadDeliveryManifest(routeId);
  if (!manifest) notFound();
  const rider = manifest.rider;
  const packageTotal = manifest.stops.reduce((sum, stop) => sum + Number(stop.packageCount || 1), 0);

  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <Link href="/dispatch">← Back to Dispatch</Link>
        <PrintManifestButton />
      </div>
      <section className={styles.sheet}>
        <header className={styles.header}>
          <div>
            <span className={styles.brand}>Meal05 Dispatch</span>
            <h1>Rider delivery sheet</h1>
            <p>Route {manifest.routeCode} · {manifest.stops.length} stops · {packageTotal} packages</p>
          </div>
          <div className={styles.routeMeta}>
            <p><strong>Rider:</strong> {rider?.fullName || "Not assigned"}</p>
            <p><strong>Rider code:</strong> {rider?.riderCode || "—"}</p>
            <p><strong>Rider phone:</strong> {rider?.phone || "—"}</p>
          </div>
        </header>

        <dl className={styles.summary}>
          <div><dt>Vehicle</dt><dd>{text(rider?.vehicleType || manifest.vehicleType)}{rider?.vehicleNumber ? ` · ${rider.vehicleNumber}` : ""}</dd></div>
          <div><dt>Pickup</dt><dd>{manifest.pickupLocation}</dd></div>
          <div><dt>Planned start</dt><dd>{dateTime(manifest.plannedStartTime)}</dd></div>
          <div><dt>Route status</dt><dd>{text(manifest.status)}</dd></div>
        </dl>

        <div className={styles.stops}>
          {manifest.stops.map((stop) => {
            const paid = String(stop.paymentStatus).toLowerCase() === "paid";
            return (
              <article className={styles.stop} key={stop.id}>
                <header className={styles.stopHeader}>
                  <div>
                    <span className={styles.stopNumber}>Stop {stop.stopNumber}</span>
                    <h2>Order #{stop.orderReference}</h2>
                  </div>
                  <span className={paid ? styles.paid : styles.notPaid}>{text(stop.paymentStatus)}</span>
                </header>
                <dl className={styles.details}>
                  <div><dt>Customer</dt><dd>{stop.customerName}</dd></div>
                  <div><dt>Phone</dt><dd>{stop.customerPhone}</dd></div>
                  <div className={styles.full}><dt>Delivery address</dt><dd>{stop.deliveryAddress}</dd></div>
                  <div className={styles.full}><dt>Landmark</dt><dd>{stop.landmark || "None provided"}</dd></div>
                  <div><dt>Packages</dt><dd>{stop.packageCount}</dd></div>
                  <div><dt>Delivery status</dt><dd>{text(stop.status)}</dd></div>
                  <div className={styles.full}><dt>Delivery instructions</dt><dd>{stop.instructions || "Call the customer when outside."}</dd></div>
                </dl>
                <p className={styles.checkline}>Delivered: ☐ &nbsp;&nbsp; Time: __________ &nbsp;&nbsp; Customer/recipient: ____________________</p>
              </article>
            );
          })}
        </div>

        <p className={styles.privacy}>Private delivery information. Use only for this route. Return this sheet to Meal05 dispatch or destroy it securely after the route is completed.</p>
      </section>
    </main>
  );
}
