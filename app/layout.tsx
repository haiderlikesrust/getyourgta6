import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, JetBrains_Mono, Mr_Dafoe } from "next/font/google";
import { Providers } from "@/components/Providers";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const display = Barlow_Condensed({
  weight: ["600", "700", "800", "900"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-display-face",
});

const body = Barlow({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-body-face",
});

const script = Mr_Dafoe({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-script-face",
});

const mono = JetBrains_Mono({
  weight: ["400", "600"],
  subsets: ["latin"],
  variable: "--font-mono-face",
});

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — win your GTA 6, free draw every 5 minutes`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  metadataBase: new URL(BRAND.url),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: BRAND.url,
    siteName: BRAND.name,
    title: `${BRAND.name} — win your GTA 6`,
    description: BRAND.description,
  },
  twitter: {
    card: "summary",
    title: `${BRAND.name} — win your GTA 6`,
    description: BRAND.description,
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0512",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${script.variable} ${mono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
