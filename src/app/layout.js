import "./globals.css";
import "@/styles/main.css";
import "@/styles/meal05-footer-download.css";
import "@/styles/notice.css";
import "@/styles/fontawesome-subset.css";
import "leaflet/dist/leaflet.css";
import localFont from "next/font/local";
import { Suspense } from "react";

import Footer from "@/components/footer";
import Meal05Header from "@/components/meal05-header";
import MobileBottomNav from "@/components/mobile-bottom-nav";
import NoticeProvider from "@/components/notice-provider";
import PwaServiceWorker from "@/components/pwa-service-worker";

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
  applicationName: "Meal05",
  appleWebApp: {
    capable: true,
    title: "Meal05",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/assets/favicon/favicon.ico", sizes: "any" },
      { url: "/assets/favicon/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/assets/favicon/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/assets/favicon/android-chrome-192x192.png", type: "image/png", sizes: "192x192" },
      { url: "/assets/favicon/android-chrome-512x512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/assets/favicon/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/assets/favicon/favicon.ico"],
  },
  manifest: "/assets/favicon/site.webmanifest",
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": "Meal05",
    "apple-mobile-web-app-status-bar-style": "default",
    "msapplication-TileColor": "#f04e1f",
    "msapplication-config": "/assets/favicon/browserconfig.xml",
  },
};

export const viewport = {
  themeColor: "#f04e1f",
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
          <Footer />
        </NoticeProvider>
        <Suspense fallback={null}>
          <MobileBottomNav />
        </Suspense>
        <PwaServiceWorker />
      </body>
    </html>
  );
}
