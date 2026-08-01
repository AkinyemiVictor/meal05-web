import Image from "next/image";
import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";

export default function MealKitComingSoon() {
  return (
    <section
      className="mt-6 flex min-h-[420px] flex-col items-center justify-center border-y border-meal-line bg-meal-paper px-6 py-10 text-center"
      aria-labelledby="mealkit-coming-soon-title"
    >
      <Image
        src="/assets/img/mealkit-coming-soon.webp"
        alt="A meal kit box filled with fresh ingredients"
        width={280}
        height={280}
        sizes="280px"
        className="h-auto w-[min(70vw,280px)]"
      />
      <p className="mt-5 text-xs font-medium uppercase tracking-[0.28em] text-meal-pepper">MealKit</p>
      <h2 id="mealkit-coming-soon-title" className="mt-2 text-3xl font-semibold text-meal-text">
        Coming soon
      </h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-meal-muted">
        Curated ingredients for complete meals are being prepared.
      </p>
      <Link
        href="/shop"
        className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-meal-ink px-5 text-sm font-medium text-meal-paper transition hover:bg-meal-pepper"
      >
        Browse groceries
        <IconArrowRight size={17} stroke={1.8} aria-hidden="true" />
      </Link>
    </section>
  );
}
