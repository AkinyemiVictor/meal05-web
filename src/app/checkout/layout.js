import "@/styles/checkout.css";

import CheckoutLayoutShell from "@/components/checkout-layout-shell";

export const metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function CheckoutLayout({ children }) {
  return <CheckoutLayoutShell>{children}</CheckoutLayoutShell>;
}
