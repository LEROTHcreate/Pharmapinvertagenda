"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FloatingField } from "./FloatingField";

export function ForgotPasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (!res.ok && res.status === 429) {
          setError("Trop de tentatives. Réessayez dans quelques minutes.");
          return;
        }
        // Toujours done : la réponse est volontairement identique que l'email
        // existe ou pas (anti-énumération).
        setDone(true);
      } catch {
        setError("Erreur réseau. Réessayez.");
      }
    });
  }

  if (done) {
    return (
      <div className="animate-fade-up flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-100">
          <Check className="h-6 w-6 text-emerald-600" strokeWidth={2.5} />
        </div>
        <h2 className="mt-5 text-[18px] font-semibold tracking-tight text-zinc-900">
          Vérifiez votre boîte mail
        </h2>
        <p className="mt-2 max-w-[22rem] text-[14px] leading-relaxed text-zinc-500">
          Si un compte est associé à <strong>{email}</strong>, vous recevrez
          un lien de réinitialisation dans quelques minutes. Vérifiez aussi
          vos spams.
        </p>
        <Link
          href="/login"
          className="mt-6 text-[13px] font-medium text-violet-600 transition-colors hover:text-violet-700"
        >
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <FloatingField
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
        disabled={isPending}
        required
      />

      {error && (
        <p
          key={error}
          role="alert"
          className="animate-shake rounded-xl bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-600 ring-1 ring-inset ring-red-100"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !email}
        className={cn(
          "group relative mt-5 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-[15px] font-medium text-white shadow-lg shadow-violet-600/25 transition-all duration-300",
          "hover:shadow-xl hover:shadow-violet-600/35 hover:-translate-y-0.5",
          "active:translate-y-0 active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-80 disabled:hover:translate-y-0"
        )}
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Envoi en cours…</span>
          </>
        ) : (
          <>
            <span>Envoyer le lien</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </>
        )}
      </button>

      <div className="pt-2 text-center">
        <Link
          href="/login"
          className="text-[13px] font-medium text-zinc-500 transition-colors hover:text-violet-600"
        >
          ← Retour à la connexion
        </Link>
      </div>
    </form>
  );
}
