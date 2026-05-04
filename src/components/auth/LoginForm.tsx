"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FloatingField } from "./FloatingField";
import { LoginSuccessOverlay } from "./LoginSuccessOverlay";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // True après une connexion réussie — déclenche l'overlay d'animation
  // (rings + check + voile flou) ~800 ms avant la redirection vers /planning.
  const [success, setSuccess] = useState(false);

  /**
   * Demande explicitement au navigateur d'enregistrer l'identifiant après une
   * connexion réussie via la Credential Management API. Indispensable quand
   * on utilise `signIn({ redirect: false })` + AJAX : sans ça, l'heuristique
   * de Chrome rate le prompt "enregistrer le mot de passe".
   * Chrome / Edge / Brave supportent l'API ; Safari / Firefox l'ignorent
   * silencieusement (et utilisent leurs propres heuristiques de formulaire,
   * déjà couvertes par les attributs `autocomplete` du formulaire).
   */
  async function storeCredential(email: string, password: string) {
    try {
      if (typeof window === "undefined") return;
      const PasswordCredentialCtor = (
        window as unknown as { PasswordCredential?: new (data: {
          id: string;
          password: string;
          name?: string;
        }) => Credential }
      ).PasswordCredential;
      if (!PasswordCredentialCtor || !navigator.credentials?.store) return;
      const cred = new PasswordCredentialCtor({
        id: email,
        password,
        name: email,
      });
      await navigator.credentials.store(cred);
    } catch {
      // pas grave : navigateur non supporté ou utilisateur a refusé
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (!res || res.error) {
        setError("Email ou mot de passe incorrect.");
        return;
      }
      // Connexion réussie → on signale au navigateur d'enregistrer l'identifiant.
      await storeCredential(email, password);
      // Moment "WOW" : on affiche l'overlay ~1100 ms avant la redirection
      // pour laisser le flash + confettis + check pop s'animer en entier.
      setSuccess(true);
      const next = params.get("callbackUrl") ?? "/planning";
      setTimeout(() => {
        router.push(next);
        router.refresh();
      }, 1100);
    });
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
        onChange={(v) => setEmail(v)}
        disabled={isPending}
        required
      />

      <FloatingField
        id="password"
        name="password"
        type={showPassword ? "text" : "password"}
        label="Mot de passe"
        autoComplete="current-password"
        value={password}
        onChange={(v) => setPassword(v)}
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
        disabled={isPending || success}
        className={cn(
          "group relative mt-5 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-full text-[15px] font-medium text-white shadow-lg transition-all duration-500",
          // Couleur du bouton — bascule violet → emerald quand connecté
          success
            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/40 scale-[1.02]"
            : "bg-gradient-to-br from-violet-600 to-indigo-600 shadow-violet-600/25 hover:shadow-xl hover:shadow-violet-600/35 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:hover:translate-y-0",
          isPending && !success && "opacity-80"
        )}
      >
        {/* Brillance au hover (état idle uniquement) */}
        {!success && (
          <span
            aria-hidden
            className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
          />
        )}

        {success ? (
          <>
            <Check className="h-5 w-5 animate-in zoom-in duration-300" strokeWidth={2.5} />
            <span>Connecté</span>
          </>
        ) : isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Connexion en cours…</span>
          </>
        ) : (
          <>
            <span>Se connecter</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </>
        )}
      </button>

      <div className="pt-2 text-center">
        <a
          href="/forgot-password"
          className="text-[13px] font-medium text-zinc-500 transition-colors hover:text-violet-600"
        >
          Mot de passe oublié&nbsp;?
        </a>
      </div>

      {/* Overlay plein écran qui apparaît brièvement (~800 ms) entre la
          réussite de la connexion et la redirection. Donne un retour visuel
          satisfaisant — voile flou + 3 anneaux émeraude + check qui se
          dessine + texte "Connecté ✨". */}
      {success && <LoginSuccessOverlay />}
    </form>
  );
}

