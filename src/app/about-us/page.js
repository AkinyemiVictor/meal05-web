import Link from "next/link";

export const metadata = {
  title: "About Us | Meal05",
  description: "Learn about Meal05, our mission, and how we deliver fresh food essentials across Nigeria.",
};

export default function AboutUsPage() {
  return (
    <main style={{ maxWidth: 1200, margin: "2rem auto 4rem", padding: "0 1rem" }}>
      <nav className="page-breadcrumb" aria-label="Breadcrumb">
        <Link href="/landing">Landing Page</Link>
        <span aria-hidden="true" className="page-breadcrumb-divider">/</span>
        <span className="page-breadcrumb-current">About Us</span>
      </nav>

      <header style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ marginBottom: 8 }}>About Meal05</h1>
        <p style={{ margin: 0, color: "#475569", maxWidth: 820 }}>
          Meal05 helps households and food businesses source fresh market essentials faster, with reliable delivery,
          clear pricing, and better quality control from order to doorstep.
        </p>
      </header>

      <section style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
          <h2 style={{ marginTop: 0, fontSize: 22 }}>Our Mission</h2>
          <p style={{ margin: 0, color: "#334155" }}>
            Make fresh food shopping simple, dependable, and transparent for every kitchen we serve.
          </p>
        </article>

        <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
          <h2 style={{ marginTop: 0, fontSize: 22 }}>What We Do</h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#334155" }}>
            <li>Curate fresh produce, proteins, pantry items, and staples.</li>
            <li>Support quick online ordering with secure checkout.</li>
            <li>Coordinate market-to-door delivery in active service zones.</li>
          </ul>
        </article>

        <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
          <h2 style={{ marginTop: 0, fontSize: 22 }}>Our Standards</h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#334155" }}>
            <li>Freshness-first sourcing and handling.</li>
            <li>Simple pricing and clear product details.</li>
            <li>Responsive customer support and issue resolution.</li>
          </ul>
        </article>
      </section>

      <section style={{ marginTop: 18, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
        <h2 style={{ marginTop: 0, fontSize: 22 }}>Need Help?</h2>
        <p style={{ margin: "0 0 10px", color: "#334155" }}>
          For order issues, delivery questions, or account support, our team is available through Help Center and direct contact channels.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/landing" style={{ textDecoration: "none", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 12px", fontWeight: 600 }}>
            Visit Landing Page
          </Link>
          <Link href="/help-center" style={{ textDecoration: "none", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 12px", fontWeight: 600 }}>
            Visit Help Center
          </Link>
          <Link href="/contact-us" style={{ textDecoration: "none", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 12px", fontWeight: 600 }}>
            Contact Us
          </Link>
        </div>
      </section>
    </main>
  );
}
