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
  // Titre de l'onglet navigateur + valeur par défaut des sous-pages
  title: "PharmaPlanning",
  description:
    "Le planning d'équipe pour officines de pharmacie — gestion intuitive des plannings, absences, échanges et heures supplémentaires.",
  applicationName: "PharmaPlanning",
  icons: {
    // Logo de marque PharmaPlanning pour les pages publiques (landing, auth).
    // Les pages dashboard surchargent ces icônes avec le logo de la pharmacie
    // connectée (cf. generateMetadata du layout (dashboard)).
    //
    // SVG pour les onglets modernes (crisp + dark mode), PNG en fallback pour
    // les vieux navigateurs qui ne supportent pas les favicons SVG (Safari iOS
    // < 16, IE legacy). On évite /logo.png et /apple-touch-icon.png qui sont
    // des assets custom de pharmacie cliente — pas le logo SaaS.
    icon: [
      { url: "/pharmaplanning-logo.svg", type: "image/svg+xml" },
      { url: "/pharmaplanning-logo.png", type: "image/png" },
    ],
    apple: "/pharmaplanning-apple-touch-icon.png",
    shortcut: "/pharmaplanning-logo.svg",
  },
  appleWebApp: {
    capable: true,
    // Affiché sous l'icône sur l'écran d'accueil iOS — 14 caractères max
    title: "PharmaPlanning",
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
    <html
      lang="fr"
      className={cn(dmSans.variable, dmMono.variable)}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased min-h-screen bg-background">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
