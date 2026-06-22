import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-meal-mist px-6 text-center text-meal-text">
      <section>
        <p className="text-sm font-black uppercase tracking-[0.28em] text-meal-pepper">404</p>
        <h1 className="mt-3 text-3xl font-black">Page not found</h1>
        <p className="mt-3 text-sm font-semibold text-meal-muted">
          The page you are looking for is not available.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/shop" className="section-view-button">Browse products</Link>
          <Link href="/" className="section-view-button">Go home</Link>
        </div>
      </section>
    </main>
  );
}
