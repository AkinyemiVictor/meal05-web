import CheckoutReceipt from "@/components/checkout-receipt";
import copy from "@/data/copy";

export const metadata = {
  title: "MealKit | Payment successful",
  description: "Your MealKit order has been confirmed.",
};

export default function CheckoutSuccessPage() {
  return (
    <main className="checkout-page" aria-labelledby="checkout-success-heading">
      <header className="checkout-header">
        <div>
          <span className="checkout-eyebrow">{copy.checkout.eyebrow}</span>
          <h1 id="checkout-success-heading">{copy.checkout.receiptPage.successHeading}</h1>
          <p>{copy.checkout.receiptPage.successSubheading}</p>
        </div>
      </header>

      <CheckoutReceipt status="success" />
    </main>
  );
}
