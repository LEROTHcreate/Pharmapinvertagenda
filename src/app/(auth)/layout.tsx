import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fafaff] text-foreground">
      {/* Couche 1 — dégradé doux de base */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-violet-50"
      />

      {/* Couche 2 — aurora multi-couleurs qui pulse (rotations, scaling).
          Fond multi-radial filtré pour un effet "northern lights" doux. */}
      <div aria-hidden className="aurora-stage" />

      {/* Couche 3 — blobs flottants (mesh gradient animé).
          `blob-stage` isole le compositing pour éviter de propager
          le coût du blur au reste de la page. */}
      <div
        aria-hidden
        className="blob-stage absolute inset-0 overflow-hidden"
      >
        <div className="animate-blob absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full bg-gradient-to-br from-violet-400/40 to-indigo-500/40 blur-2xl" />
        <div className="animate-blob-slow absolute top-1/3 -right-40 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-fuchsia-300/35 to-violet-400/35 blur-2xl" />
        <div className="animate-blob absolute -bottom-40 left-1/4 h-[480px] w-[480px] rounded-full bg-gradient-to-br from-sky-300/30 to-indigo-300/30 blur-2xl" />
      </div>

      {/* Couche 4 — étoiles scintillantes (overlay très léger pour
          l'ambiance "futuriste" sans devenir cyberpunk) */}
      <div aria-hidden className="starry" />

      {/* Couche 5 — grain léger pour texturer le fond */}
      <div aria-hidden className="grain absolute inset-0 pointer-events-none" />

      {/* Contenu */}
      <div className="relative flex min-h-screen items-center justify-center p-4 sm:p-6">
        {children}
      </div>

      {/* Footer discret */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
        <p className="animate-fade-in delay-600 text-xs text-muted-foreground/70">
          © {new Date().getFullYear()} PharmaPlanning · Conçu pour les officines françaises
        </p>
      </div>
    </div>
  );
}
