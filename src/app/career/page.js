import Link from "next/link";

export const metadata = {
  title: "Career | Meal05",
  description: "Explore career opportunities at Meal05 and learn how to apply.",
};

export default function CareerPage() {
  return (
    <main style={{ maxWidth: 1200, margin: "2rem auto 4rem", padding: "0 1rem" }}>
      <nav className="page-breadcrumb" aria-label="Breadcrumb">
        <Link href="/home">Home</Link>
        <span aria-hidden="true" className="page-breadcrumb-divider">/</span>
        <span className="page-breadcrumb-current">Career</span>
      </nav>

      <header style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ marginBottom: 8 }}>Careers at Meal05</h1>
        <p style={{ margin: 0, color: "#475569", maxWidth: 820 }}>
          We are building reliable food commerce and logistics for everyday kitchens. If you are driven by execution,
          product quality, and customer impact, we would like to hear from you.
        </p>
      </header>

      <section style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
          <h2 style={{ marginTop: 0, fontSize: 20 }}>What We Value</h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#334155" }}>
            <li>Ownership and accountability</li>
            <li>Customer-first decisions</li>
            <li>Speed with quality control</li>
            <li>Respectful, practical teamwork</li>
          </ul>
        </article>

        <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
          <h2 style={{ marginTop: 0, fontSize: 20 }}>Current Openings</h2>
          <p style={{ margin: "0 0 8px", color: "#334155" }}>
            We are not publicly listing roles right now.
          </p>
          <p style={{ margin: 0, color: "#334155" }}>
            Send your CV and portfolio to <a href="mailto:hello@meal05.com">hello@meal05.com</a> with subject:
            <strong> Career Application - [Role]</strong>.
          </p>
        </article>

        <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
          <h2 style={{ marginTop: 0, fontSize: 20 }}>How Hiring Works</h2>
          <ol style={{ margin: 0, paddingLeft: 18, color: "#334155" }}>
            <li>Application review</li>
            <li>Short call with operations or product lead</li>
            <li>Practical task or role interview</li>
            <li>Final decision and onboarding</li>
          </ol>
        </article>
      </section>
    </main>
  );
}
