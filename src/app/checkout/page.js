import Link from "next/link";

import CheckoutExperience from "@/components/checkout-experience";
import copy from "@/data/copy";

export const metadata = {
  title: "MealKit | Checkout",
  description: "Secure checkout for your MealKit order",
};

export default function CheckoutPage() {
  return (
    <main className="checkout-page" aria-labelledby="checkout-heading">
      <header className="checkout-header">
        <div>
          <span className="checkout-eyebrow">{copy.checkout.eyebrow}</span>
          <h1 id="checkout-heading">{copy.checkout.title}</h1>
          <p>{copy.checkout.subtitle}</p>
        </div>
        <Link href="/cart" className="checkout-back-link">
          {copy.checkout.backToCart}
        </Link>
      </header>

      <CheckoutExperience />
    </main>
  );
}