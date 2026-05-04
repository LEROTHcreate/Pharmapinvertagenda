import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { Card3DTilt } from "@/components/auth/Card3DTilt";

export const metadata = { title: "Connexion · PharmaPlanning" };

export default function LoginPage() {
  return (
    <div className="w-full max-w-[420px]">
      {/* Tilt 3D au survol souris (no-op sur mobile / reduced-motion) */}
      <Card3DTilt max={6} className="rounded-[28px]">
        {/* Carte principale — bordure aurora + glass + halo */}
        <div className="aurora-border animate-fade-up rounded-[28px]">
          <div className="relative overflow-hidden rounded-[28px] border border-white/60 bg-white/80 px-8 py-10 shadow-[0_30px_80px_-20px_rgba(76,29,149,0.35),0_8px_24px_-12px_rgba(76,29,149,0.18)] backdrop-blur-2xl sm:px-10 sm:py-12">
            {/* Reflet supérieur subtil */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"
            />

            {/* Logo + titre */}
            <div className="flex flex-col items-center text-center">
              {/* Halo lumineux derrière le logo qui respire */}
              <div className="relative animate-fade-up">
                <span
                  aria-hidden
                  className="animate-pulse-glow pointer-events-none absolute inset-0 -m-4 rounded-full bg-gradient-to-br from-violet-400/60 via-fuchsia-300/40 to-sky-300/50 blur-xl"
                />
                <Image
                  src="/logo.png"
                  alt="PharmaPlanning"
                  width={72}
                  height={72}
                  className="relative h-[72px] w-[72px] object-contain drop-shadow-[0_8px_24px_rgba(124,58,237,0.35)] animate-float"
                  priority
                />
              </div>

              {/* Titre avec dégradé animé qui sweep */}
              <h1 className="animate-fade-up delay-75 mt-6 text-[28px] font-semibold tracking-[-0.02em]">
                <span className="shimmer-text">Bon retour parmi nous</span>
              </h1>
              <p className="animate-fade-up delay-150 mt-2 max-w-[18rem] text-[15px] leading-relaxed text-zinc-500">
                Connectez-vous pour gérer le planning de votre officine.
              </p>
            </div>

            {/* Formulaire */}
            <div className="animate-fade-up delay-225 mt-8">
              <Suspense
                fallback={
                  <div className="space-y-4">
                    <div className="h-14 rounded-2xl bg-zinc-100" />
                    <div className="h-14 rounded-2xl bg-zinc-100" />
                    <div className="h-12 rounded-full bg-zinc-200" />
                  </div>
                }
              >
                <LoginForm />
              </Suspense>
            </div>

            {/* Lien création de compte */}
            <p className="animate-fade-up delay-450 mt-8 text-center text-[13px] text-zinc-500">
              Pas encore de compte&nbsp;?{" "}
              <Link
                href="/signup"
                className="font-medium text-violet-600 transition-colors hover:text-violet-700"
              >
                Créer un compte
              </Link>
            </p>
          </div>
        </div>
      </Card3DTilt>
    </div>
  );
}
