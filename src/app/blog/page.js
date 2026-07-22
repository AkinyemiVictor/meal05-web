import Link from "next/link";

export const metadata = {
  title: "Blog | Meal05",
  description: "Meal05 blog updates are coming soon.",
};

export default function BlogPage() {
  return (
    <main style={{ maxWidth: 1200, margin: "2rem auto 4rem", padding: "0 1rem" }}>
      <nav className="page-breadcrumb" aria-label="Breadcrumb">
        <Link href="/home">Home</Link>
        <span aria-hidden="true" className="page-breadcrumb-divider">/</span>
        <span className="page-breadcrumb-current">Blog</span>
      </nav>

      <header style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ marginBottom: 8 }}>Blog</h1>
        <p style={{ margin: 0, color: "#475569", maxWidth: 820 }}>
          We have not published blog posts yet. Check back soon for updates.
        </p>
      </header>
    </main>
  );
}
