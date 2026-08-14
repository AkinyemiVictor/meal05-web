import Link from "next/link";

export const metadata = {
  title: "Contact Us | Meal05",
  description: "Reach Meal05 support for delivery, orders, account help, and business inquiries.",
};

export default function ContactUsPage() {
  return (
    <main style={{ maxWidth: 1200, margin: "2rem auto 4rem", padding: "0 1rem" }}>
      <nav className="page-breadcrumb" aria-label="Breadcrumb">
        <Link href="/home">Home</Link>
        <span aria-hidden="true" className="page-breadcrumb-divider">/</span>
        <span className="page-breadcrumb-current">Contact Us</span>
      </nav>

      <header style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ marginBottom: 8 }}>Contact Meal05</h1>
        <p style={{ margin: 0, color: "#475569", maxWidth: 820 }}>
          We are available for order support, delivery updates, account help, and partnership inquiries.
        </p>
      </header>

      <section style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
          <h2 style={{ marginTop: 0, fontSize: 20 }}>Support Channels</h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#334155" }}>
            <li>Phone: <a href="tel:+2348118287047">+234-81-1828-7047</a></li>
            <li>Email: <a href="mailto:hello@meal05.com">hello@meal05.com</a></li>
            <li>Help Center: <Link href="/help-center">Browse FAQs</Link></li>
          </ul>
        </article>

        <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
          <h2 style={{ marginTop: 0, fontSize: 20 }}>Office Address</h2>
          <p style={{ margin: 0, color: "#334155" }}>
            No 9, Bel-Air Estate
            <br />
            Akala Expressway, Ibadan
            <br />
            Oyo State, Nigeria
          </p>
        </article>

        <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
          <h2 style={{ marginTop: 0, fontSize: 20 }}>Support Hours</h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#334155" }}>
            <li>Monday - Saturday: 8:00 AM - 7:00 PM</li>
            <li>Public holidays: response times may vary</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
