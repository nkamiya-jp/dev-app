import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { PWARegister } from "@/components/pwa-register";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "HUB",
  description: "HUB - 神谷商会 社内システム",
  applicationName: "HUB",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HUB",
  },
};

export const viewport: Viewport = {
  themeColor: "#18181b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${notoSansJP.variable} h-full antialiased`}
    >
      <head>
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
      </head>
      <body className="min-h-full font-sans">
        <PWARegister />
        <Sidebar />
        <main className="md:ml-60 min-h-screen p-4 md:p-6 overflow-auto bg-gray-50 print:ml-0 print:p-0 print:bg-white print:min-h-0 print:overflow-visible">{children}</main>
      </body>
    </html>
  );
}
