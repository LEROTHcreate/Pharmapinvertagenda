import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Page introuvable · PharmaPlanning" };

/**
 * 404 global — affichée quand aucune route ne matche.
 */
export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-white/60 bg-white/80 p-8 shadow-[0_30px_80px_-20px_rgba(124,58,237,0.18),0_8px_24px_-12px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-50 ring-1 ring-violet-100">
            <Compass className="h-6 w-6 text-violet-600" strokeWidth={2} />
          </div>
          <h1 className="mt-5 text-[20px] font-semibold tracking-tight text-zinc-900">
            Page introuvable
          </h1>
          <p className="mt-2 max-w-[22rem] text-[14px] leading-relaxed text-zinc-500">
            Cette page n&apos;existe pas (ou n&apos;existe plus). Reviens au
            planning pour continuer.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button asChild>
              <Link href="/planning">Retour au planning</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">Page de connexion</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
