"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FloatingField } from "./FloatingField";

type Mode = "join" | "create";

export function SignupForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ mode: Mode } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<Mode>("join");

  // Champs communs
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Champs SIRET (utilisé dans les 2 modes — identifie la pharmacie)
  const [pharmacySiret, setPharmacySiret] = useState("");

  // Champs création officine (mode "create" uniquement)
  const [pharmacyName, setPharmacyName] = useState("");
  const [pharmacyAddress, setPharmacyAddress] = useState("");
  const [pharmacyPhone, setPharmacyPhone] = useState("");

  // Acceptation CGU + politique de confidentialité — obligatoire pour
  // matérialiser le consentement (CNIL + LCEN). Bloque le submit tant que
  // pas coché. La validation HTML `required` suffit ici car le formulaire
  // est en client-side render.
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const payload =
      mode === "join"
        ? { mode, name, email, password, pharmacySiret }
        : {
            mode,
            name,
            email,
            password,
            pharmacySiret,
            pharmacyName,
            pharmacyAddress: pharmacyAddress || null,
            pharmacyPhone: pharmacyPhone || null,
          };

    startTransition(async () => {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const code = (data?.error as string | undefined) ?? "UNKNOWN";
        setError(messageForError(code));
        return;
      }

      setDone({ mode });
    });
  }

  if (done) {
    const isCreator = done.mode === "create";
    return (
      <div className="animate-fade-up flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-100">
          <Check className="h-6 w-6 text-emerald-600" strokeWidth={2.5} />
        </div>
        <h2 className="mt-5 text-[18px] font-semibold tracking-tight text-zinc-900">
          {isCreator ? "Officine créée 🎉" : "Demande envoyée"}
        </h2>
        <p className="mt-2 max-w-[20rem] text-[14px] leading-relaxed text-zinc-500">
          {isCreator
            ? "Votre compte titulaire est actif. Connectez-vous pour configurer votre équipe et inviter vos collaborateurs."
            : "Un administrateur de votre officine va examiner votre demande. Vous recevrez un email lorsque votre compte sera activé."}
        </p>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="mt-6 text-[13px] font-medium text-violet-600 transition-colors hover:text-violet-700"
        >
          {isCreator ? "Se connecter" : "Retour à la connexion"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── Tabs : Rejoindre / Créer ──────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Mode d'inscription"
        className="inline-flex w-full items-center gap-0.5 rounded-xl bg-zinc-100/70 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "join"}
          onClick={() => {
            setMode("join");
            setError(null);
          }}
          disabled={isPending}
          className={cn(
            "flex-1 px-3 py-2 rounded-lg text-[12.5px] font-medium transition-all",
            mode === "join"
              ? "bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
              : "text-zinc-500 hover:text-zinc-800"
          )}
        >
          Rejoindre une officine
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "create"}
          onClick={() => {
            setMode("create");
            setError(null);
          }}
          disabled={isPending}
          className={cn(
            "flex-1 px-3 py-2 rounded-lg text-[12.5px] font-medium transition-all",
            mode === "create"
              ? "bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
              : "text-zinc-500 hover:text-zinc-800"
          )}
        >
          Créer une officine
        </button>
      </div>

      {/* Helper texte selon mode */}
      <p className="text-[12px] leading-relaxed text-zinc-500">
        {mode === "join"
          ? "Votre admin a déjà créé l'officine ? Saisissez le SIRET, il validera votre accès."
          : "Vous êtes titulaire et vous configurez votre officine pour la première fois ? Votre compte sera créé en tant qu'administrateur."}
      </p>

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

        {/* ─── Champs spécifiques au mode ─────────────────────────── */}
        {mode === "create" && (
          <>
            <FloatingField
              id="pharmacy-name"
              name="pharmacyName"
              type="text"
              label="Nom de l'officine"
              value={pharmacyName}
              onChange={setPharmacyName}
              disabled={isPending}
              required
            />
            <FloatingField
              id="pharmacy-address"
              name="pharmacyAddress"
              type="text"
              label="Adresse (optionnel)"
              autoComplete="street-address"
              value={pharmacyAddress}
              onChange={setPharmacyAddress}
              disabled={isPending}
            />
            <FloatingField
              id="pharmacy-phone"
              name="pharmacyPhone"
              type="tel"
              label="Téléphone (optionnel)"
              autoComplete="tel"
              value={pharmacyPhone}
              onChange={setPharmacyPhone}
              disabled={isPending}
            />
          </>
        )}

        <FloatingField
          id="pharmacy-siret"
          name="pharmacySiret"
          type="text"
          label="SIRET de l'officine (14 chiffres)"
          value={pharmacySiret}
          onChange={setPharmacySiret}
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

        {/* Acceptation CGU + politique de confidentialité */}
        <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            disabled={isPending}
            required
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-violet-600 focus:ring-2 focus:ring-violet-500 focus:ring-offset-1 cursor-pointer"
          />
          <span className="text-[12px] leading-relaxed text-zinc-600">
            J&apos;ai lu et j&apos;accepte les{" "}
            <a
              href="/cgu"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-violet-600 underline underline-offset-2 hover:text-violet-700"
            >
              Conditions Générales d&apos;Utilisation
            </a>{" "}
            et la{" "}
            <a
              href="/confidentialite"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-violet-600 underline underline-offset-2 hover:text-violet-700"
            >
              politique de confidentialité
            </a>
            .
          </span>
        </label>

        <button
          type="submit"
          disabled={isPending || !acceptedTerms}
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
              <span>
                {mode === "create" ? "Créer mon officine" : "Demander un accès"}
              </span>
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}

function messageForError(code: string): string {
  switch (code) {
    case "INVALID_INPUT":
      return "Vérifiez les champs. SIRET = 14 chiffres, mot de passe ≥ 8 caractères.";
    case "EMAIL_TAKEN":
      return "Un compte existe déjà avec cet email.";
    case "PHARMACY_NOT_FOUND":
      return "Aucune officine trouvée avec ce SIRET. Vérifiez le numéro ou créez-la en mode \"Créer une officine\".";
    case "PHARMACY_NOT_INITIALIZED":
      return "Cette officine n'a pas encore d'administrateur actif. La première inscription doit se faire en mode \"Créer une officine\".";
    case "PHARMACY_ALREADY_EXISTS":
      return "Une officine avec ce SIRET existe déjà. Choisissez plutôt \"Rejoindre une officine\".";
    case "RATE_LIMITED":
      return "Trop de tentatives. Réessayez dans quelques minutes.";
    case "SERVICE_UNAVAILABLE":
      return "Service momentanément indisponible (réveil du serveur). Patientez quelques secondes et réessayez.";
    default:
      return "Une erreur est survenue. Réessayez dans un instant.";
  }
}
