import Image from "next/image";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = { title: "Mot de passe oublié · PharmaPlanning" };

export default function ForgotPasswordPage() {
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
              className="h-[72px] w-[72px] object-contain drop-shadow-sm animate-fade-up"
              priority
            />
            <h1 className="animate-fade-up delay-75 mt-6 text-[28px] font-semibold tracking-[-0.02em] text-zinc-900">
              Mot de passe oublié
            </h1>
            <p className="animate-fade-up delay-150 mt-2 max-w-[20rem] text-[15px] leading-relaxed text-zinc-500">
              Entrez votre email — si un compte y est associé, un lien de
              réinitialisation y sera envoyé.
            </p>
          </div>

          <div className="animate-fade-up delay-225 mt-8">
            <ForgotPasswordForm />
          </div>
        </div>
      </div>
    </div>
  );
}
