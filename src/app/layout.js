import "./globals.css";
import "@/styles/main.css";
import "@/styles/meal05-footer-download.css";
import "@/styles/notice.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "leaflet/dist/leaflet.css";
import localFont from "next/font/local";

import Footer from "@/components/footer";
import Meal05Header from "@/components/meal05-header";
import NoticeProvider from "@/components/notice-provider";
import RoutePrefetcher from "@/components/route-prefetcher";
import PageScaler from "@/components/page-scaler";

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
  themeColor: "#f04e1f",
  other: {
    "msapplication-TileColor": "#f04e1f",
    "msapplication-config": "/assets/favicon/browserconfig.xml",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <PageScaler>
          <NoticeProvider>
            <Meal05Header />
            <RoutePrefetcher />
            <div className="layout-main">
              {children}
            </div>
            <Footer />
          </NoticeProvider>
        </PageScaler>
      </body>
    </html>
  );
}
