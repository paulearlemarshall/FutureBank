import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "FutureBank Core",
    template: "%s · FutureBank Core",
  },
  description: "A deterministic core banking demonstration workspace for process automation.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr" className={geistMono.variable}>
      <body>{children}</body>
    </html>
  );
}
