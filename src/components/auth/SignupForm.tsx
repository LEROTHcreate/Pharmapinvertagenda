"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FloatingField } from "./FloatingField";

export function SignupForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const code = (data?.error as string | undefined) ?? "UNKNOWN";
        setError(messageForError(code));
        return;
      }

      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="animate-fade-up flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-100">
          <Check className="h-6 w-6 text-emerald-600" strokeWidth={2.5} />
        </div>
        <h2 className="mt-5 text-[18px] font-semibold tracking-tight text-zinc-900">
          Demande envoyée
        </h2>
        <p className="mt-2 max-w-[20rem] text-[14px] leading-relaxed text-zinc-500">
          Un administrateur de votre officine va examiner votre demande. Vous
          recevrez un email lorsque votre compte sera activé.
        </p>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="mt-6 text-[13px] font-medium text-violet-600 transition-colors hover:text-violet-700"
        >
          Retour à la connexion
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <FloatingField
        id="name"
        name="name"
        type="text"
        label="Nom et prénom"
        autoComplete="name"
        value={name}
        onChange={setName}
        disabled={isPending}
        required
      />

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

      <FloatingField
        id="password"
        name="password"
        type={showPassword ? "text" : "password"}
        label="Mot de passe (8 caractères min.)"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        disabled={isPending}
        required
        endAdornment={
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            tabIndex={-1}
            aria-label={
              showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"
            }
            className="rounded-full p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        }
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
        disabled={isPending}
        className={cn(
          "group relative mt-5 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-[15px] font-medium text-white shadow-lg shadow-violet-600/25 transition-all duration-300",
          "hover:shadow-xl hover:shadow-violet-600/35 hover:-translate-y-0.5",
          "active:translate-y-0 active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-80 disabled:hover:translate-y-0"
        )}
      >
        <span
          aria-hidden
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
        />
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Envoi en cours…</span>
          </>
        ) : (
          <>
            <span>Demander un accès</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </>
        )}
      </button>
    </form>
  );
}

function messageForError(code: string): string {
  switch (code) {
    case "INVALID_INPUT":
      return "Vérifiez les champs. Mot de passe ≥ 8 caractères.";
    case "EMAIL_TAKEN":
      return "Un compte existe déjà avec cet email.";
    case "PHARMACY_NOT_FOUND":
      return "Aucune pharmacie configurée. Contactez votre administrateur.";
    case "MULTI_PHARMACY_REQUIRES_SIRET":
      return "Plusieurs pharmacies sont configurées. L'inscription via SIRET est requise — contactez votre administrateur.";
    case "RATE_LIMITED":
      return "Trop de tentatives. Réessayez dans quelques minutes.";
    default:
      return "Une erreur est survenue. Réessayez dans un instant.";
  }
}
