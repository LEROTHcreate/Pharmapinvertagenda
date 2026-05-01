"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, Eye, EyeOff, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { FloatingField } from "./FloatingField";

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // Pas de token dans l'URL → on affiche un état d'erreur clair
  if (!token) {
    return (
      <div className="animate-fade-up flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-100">
          <AlertTriangle className="h-6 w-6 text-amber-600" />
        </div>
        <h2 className="mt-5 text-[18px] font-semibold tracking-tight text-zinc-900">
          Lien invalide
        </h2>
        <p className="mt-2 max-w-[22rem] text-[14px] leading-relaxed text-zinc-500">
          Ce lien ne contient pas de jeton de réinitialisation. Demandez un
          nouveau lien depuis la page de connexion.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 text-[13px] font-medium text-violet-600 transition-colors hover:text-violet-700"
        >
          Demander un nouveau lien →
        </Link>
      </div>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        });
        if (!res.ok) {
          if (res.status === 429) {
            setError("Trop de tentatives. Réessayez dans quelques minutes.");
            return;
          }
          const data = await res.json().catch(() => ({}));
          if (data?.error === "INVALID_TOKEN") {
            setError(
              "Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau."
            );
            return;
          }
          setError("Erreur. Vérifiez votre mot de passe (8 caractères min).");
          return;
        }
        setDone(true);
        // Auto-redirige vers /login au bout de 3s
        setTimeout(() => router.push("/login"), 3000);
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
          Mot de passe mis à jour
        </h2>
        <p className="mt-2 max-w-[22rem] text-[14px] leading-relaxed text-zinc-500">
          Vous allez être redirigé vers la page de connexion…
        </p>
        <Link
          href="/login"
          className="mt-6 text-[13px] font-medium text-violet-600 transition-colors hover:text-violet-700"
        >
          Aller à la connexion maintenant →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <FloatingField
        id="password"
        name="password"
        type={showPassword ? "text" : "password"}
        label="Nouveau mot de passe (8 caractères min.)"
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

      <FloatingField
        id="confirm"
        name="confirm"
        type={showPassword ? "text" : "password"}
        label="Confirmer le mot de passe"
        autoComplete="new-password"
        value={confirm}
        onChange={setConfirm}
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
        disabled={isPending || !password || !confirm}
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
            <span>Mise à jour…</span>
          </>
        ) : (
          <>
            <span>Mettre à jour</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </>
        )}
      </button>
    </form>
  );
}
