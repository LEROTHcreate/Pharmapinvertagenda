import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PharmaPlanning",
  description: "Gestion de planning d'équipe pour officines de pharmacie",
  applicationName: "PharmaPlanning",
  icons: {
    icon: "/logo.png",
    apple: "/apple-touch-icon.png",
    shortcut: "/logo.png",
  },
  appleWebApp: {
    capable: true,
    title: "Planning",
    statusBarStyle: "default",
  },
  manifest: "/manifest.webmanifest",
  formatDetection: {
    telephone: false,
  },
};

/**
 * Viewport pour iOS / Android :
 * - viewportFit: cover → utilise les safe-areas (notch / barre du bas)
 * - userScalable: false évite le zoom involontaire double-tap dans la grille
 *   tout en restant accessible (l'utilisateur peut zoomer avec gestes système iOS)
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={cn(dmSans.variable, dmMono.variable)}>
      <body className="font-sans antialiased min-h-screen bg-background">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
