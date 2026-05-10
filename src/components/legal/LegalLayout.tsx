import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/layout/BrandLogo";

/**
 * Wrapper commun pour les pages légales (mentions, CGU, confidentialité).
 *
 * Mêmes blobs / grain que la landing pour la continuité visuelle, plus une
 * mise en page "article" classique (max-width étroit, typo lisible, ancres).
 */
export function LegalLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  /** Date de dernière mise à jour, format "10 mai 2026". */
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fafaff] text-foreground">
      {/* Couches de fond, mêmes que landing (atténuées sur les pages texte) */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-indigo-50/60 via-white to-violet-50/60"
      />
      <div aria-hidden className="grain absolute inset-0 pointer-events-none" />

      {/* En-tête minimal */}
      <header className="relative z-10 border-b border-zinc-200/60 bg-white/60 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 text-foreground hover:opacity-80 transition-opacity"
          >
            <BrandLogo size={32} />
            <span className="text-[15px] font-semibold tracking-tight">
              PharmaPlanning
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-foreground/70 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour à l&apos;accueil
          </Link>
        </div>
      </header>

      {/* Contenu */}
      <main className="relative z-10 mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-8 sm:mb-10">
          <h1 className="text-[28px] sm:text-[36px] font-semibold tracking-tight">
            {title}
          </h1>
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            Dernière mise à jour : {lastUpdated}
          </p>
        </header>

        <article className="legal-prose">{children}</article>
      </main>

      {/* Footer simplifié */}
      <footer className="relative z-10 border-t border-zinc-200/60 bg-white/40 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-muted-foreground">
          <span>© {new Date().getFullYear()} PharmaPlanning</span>
          <Link
            href="/mentions-legales"
            className="hover:text-foreground transition-colors"
          >
            Mentions légales
          </Link>
          <Link href="/cgu" className="hover:text-foreground transition-colors">
            CGU
          </Link>
          <Link
            href="/confidentialite"
            className="hover:text-foreground transition-colors"
          >
            Confidentialité
          </Link>
        </div>
      </footer>
    </div>
  );
}
