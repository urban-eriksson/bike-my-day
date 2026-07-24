import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "bike my day",
  description: "Daily bike-ride forecasts, pushed to your phone.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "bike my day",
  },
};

export const viewport: Viewport = {
  // Matches --background (warm near-white) so the status bar blends with the
  // app in standalone mode; viewport-fit=cover lets the sticky header extend
  // under the iOS notch with its safe-area padding.
  themeColor: "#fcfaf4",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
