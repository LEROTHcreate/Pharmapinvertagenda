import Image from "next/image";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = { title: "Réinitialiser le mot de passe · PharmaPlanning" };

export default function ResetPasswordPage() {
  return (
    <div className="w-full max-w-[420px]">
      <div className="shine-border animate-fade-up rounded-[28px]">
        <div className="relative overflow-hidden rounded-[28px] border border-white/60 bg-white/70 px-8 py-10 shadow-[0_30px_80px_-20px_rgba(76,29,149,0.25),0_8px_24px_-12px_rgba(76,29,149,0.15)] backdrop-blur-2xl sm:px-10 sm:py-12">
          <div className="flex flex-col items-center text-center">
            <Image
              src="/logo.png"
              alt="PharmaPlanning"
              width={72}
              height={72}
              className="h-[72px] w-[72px] object-contain drop-shadow-sm"
              priority
            />
            <h1 className="mt-6 text-[28px] font-semibold tracking-[-0.02em] text-zinc-900">
              Nouveau mot de passe
            </h1>
            <p className="mt-2 max-w-[20rem] text-[15px] leading-relaxed text-zinc-500">
              Choisissez un nouveau mot de passe pour votre compte.
            </p>
          </div>

          <div className="mt-8">
            <Suspense
              fallback={
                <div className="space-y-4">
                  <div className="h-14 rounded-2xl bg-zinc-100" />
                  <div className="h-12 rounded-full bg-zinc-200" />
                </div>
              }
            >
              <ResetPasswordForm />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
