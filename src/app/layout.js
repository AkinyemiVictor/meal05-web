import "./globals.css";
import "@/styles/meal05-footer-download.css";
import "@/styles/notice.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import localFont from "next/font/local";

import Meal05Header from "@/components/meal05-header";
import NoticeProvider from "@/components/notice-provider";

const geistSans = localFont({
  src: "../fonts/geist-latin.woff2",
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: "../fonts/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
});

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "Meal05 - Farm-fresh groceries delivered in Ibadan",
  description: "Order fresh produce, proteins, grains, and pantry staples. Farm-sourced and delivered to your door.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <NoticeProvider>
          <Meal05Header />
          <div className="layout-main">
            {children}
          </div>
        </NoticeProvider>
      </body>
    </html>
  );
}
