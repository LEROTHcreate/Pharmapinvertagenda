"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Erreur globale (root) — affichée pour toute exception non capturée
 * dans une route. Style glass, action de retry + retour planning.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Hook de monitoring : pour l'instant on log la console.
    // À remplacer par Sentry/Logflare quand intégré.
    console.error("[error.tsx]", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-white/60 bg-white/80 p-8 shadow-[0_30px_80px_-20px_rgba(220,38,38,0.18),0_8px_24px_-12px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 ring-1 ring-red-100">
            <AlertTriangle className="h-6 w-6 text-red-600" strokeWidth={2} />
          </div>
          <h1 className="mt-5 text-[20px] font-semibold tracking-tight text-zinc-900">
            Une erreur est survenue
          </h1>
          <p className="mt-2 max-w-[22rem] text-[14px] leading-relaxed text-zinc-500">
            Le serveur n&apos;a pas pu finaliser cette action. Réessaie, ou
            reviens à l&apos;accueil si le problème persiste.
          </p>
          {error.digest && (
            <p className="mt-3 font-mono text-[11px] text-zinc-400">
              ref : {error.digest}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={reset} variant="default">
              <RotateCcw className="h-4 w-4" />
              Réessayer
            </Button>
            <Button asChild variant="outline">
              <Link href="/planning">Retour au planning</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
