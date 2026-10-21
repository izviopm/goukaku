import type { Metadata } from "next";
import { Noto_Sans_JP, Plus_Jakarta_Sans } from "next/font/google";
import { MotionProvider } from "@/components/motion";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

// Only the logo uses Japanese glyphs, so one weight without preloading.
const notoJp = Noto_Sans_JP({
  weight: ["700"],
  variable: "--font-noto-jp",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Goukaku",
  description: "Certification exam practice with verified answer keys",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${notoJp.variable}`}>
      <body className="min-h-dvh font-sans">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
