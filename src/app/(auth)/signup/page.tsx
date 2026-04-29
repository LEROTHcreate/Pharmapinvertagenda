import Image from "next/image";
import Link from "next/link";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata = { title: "Créer un compte · PharmaPlanning" };

export default function SignupPage() {
  return (
    <div className="w-full max-w-[440px]">
      <div className="shine-border animate-fade-up rounded-[28px]">
        <div className="relative overflow-hidden rounded-[28px] border border-white/60 bg-white/70 px-8 py-10 shadow-[0_30px_80px_-20px_rgba(76,29,149,0.25),0_8px_24px_-12px_rgba(76,29,149,0.15)] backdrop-blur-2xl sm:px-10 sm:py-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"
          />

          <div className="flex flex-col items-center text-center">
            <div className="animate-fade-up">
              <Image
                src="/logo.png"
                alt="PharmaPlanning"
                width={72}
                height={72}
                className="h-[72px] w-[72px] object-contain drop-shadow-sm"
                priority
              />
            </div>

            <h1 className="animate-fade-up delay-75 mt-6 text-[28px] font-semibold tracking-[-0.02em] text-zinc-900">
              Créer un compte
            </h1>
            <p className="animate-fade-up delay-150 mt-2 max-w-[20rem] text-[15px] leading-relaxed text-zinc-500">
              Votre demande sera examinée par un administrateur de votre officine.
            </p>
          </div>

          <div className="animate-fade-up delay-225 mt-8">
            <SignupForm />
          </div>

          <p className="animate-fade-up delay-450 mt-8 text-center text-[13px] text-zinc-500">
            Vous avez déjà un compte&nbsp;?{" "}
            <Link
              href="/login"
              className="font-medium text-violet-600 transition-colors hover:text-violet-700"
            >
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
