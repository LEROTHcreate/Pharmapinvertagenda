import type { Metadata } from "next";
import { Clock, Cog } from "lucide-react";
import { BrandLogo } from "@/components/layout/BrandLogo";

/**
 * Page de maintenance — à afficher pendant une mise à jour / coupure planifiée.
 *
 * Standalone : n'utilise ni l'auth ni les données pharmacie. On peut donc la
 * servir même base de données indisponible.
 *
 * Activation possible (au choix, le jour où tu en as besoin) :
 *  - Vercel : variable d'env `MAINTENANCE=1` + une règle de rewrite dans
 *    `middleware.ts` qui redirige tout vers `/maintenance` (sauf assets).
 *  - Rapide/manuel : rediriger temporairement la home vers `/maintenance`.
 *
 * `robots: noindex` pour qu'un passage de crawler pendant la maintenance
 * n'indexe pas cette page à la place du vrai contenu.
 */
export const metadata: Metadata = {
  title: "Maintenance en cours · PharmaPlanning",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  const year = new Date().getFullYear();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fafaff] p-4 text-foreground sm:p-6">
      {/* Couche 1 — dégradé doux de base (même ambiance que la page de login) */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-violet-50"
      />

      {/* Couche 2 — blobs flous flottants pour la profondeur */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-40 h-[520px] w-[520px] rounded-full bg-gradient-to-br from-violet-400/30 to-indigo-500/30 blur-3xl" />
        <div className="absolute -bottom-40 -right-32 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-fuchsia-300/25 to-violet-400/25 blur-3xl" />
      </div>

      {/* Card vitrée centrée */}
      <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/60 bg-white/80 px-8 py-12 text-center shadow-[0_30px_80px_-20px_rgba(76,29,149,0.35),0_8px_24px_-12px_rgba(76,29,149,0.18)] backdrop-blur-2xl sm:px-10">
        {/* Reflet supérieur subtil */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"
        />

        <div className="flex flex-col items-center">
          <BrandLogo size={64} withHalo />

          {/* Engrenage qui tourne lentement — signal "travaux en cours" */}
          <div className="relative mt-8 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 ring-1 ring-inset ring-violet-200/60">
            <Cog
              className="h-10 w-10 animate-spin text-violet-600 [animation-duration:6s]"
              strokeWidth={1.75}
              aria-hidden
            />
          </div>

          <h1 className="mt-8 text-[26px] font-semibold tracking-[-0.02em]">
            <span className="shimmer-text">Maintenance en cours</span>
          </h1>

          <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-zinc-500">
            PharmaPlanning est momentanément indisponible, le temps d&apos;une
            mise à jour. Tout revient en ligne dans quelques minutes — merci de
            votre patience.
          </p>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-violet-50 px-4 py-2 text-[13px] font-medium text-violet-700 ring-1 ring-inset ring-violet-100">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            Retour prévu très prochainement
          </div>

          <p className="mt-8 text-[12.5px] text-zinc-400">
            Une urgence&nbsp;? Contactez le support au{" "}
            <a
              href="tel:+33769462446"
              className="font-medium text-violet-600 transition-colors hover:text-violet-700"
            >
              07&nbsp;69&nbsp;46&nbsp;24&nbsp;46
            </a>{" "}
            ou par email à{" "}
            <a
              href="mailto:thorelindustries@gmail.com"
              className="font-medium text-violet-600 transition-colors hover:text-violet-700"
            >
              thorelindustries@gmail.com
            </a>
          </p>
        </div>
      </div>

      {/* Footer discret */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
        <p className="text-xs text-muted-foreground/70">
          © {year} PharmaPlanning · Conçu pour les officines françaises
        </p>
      </div>
    </div>
  );
}
