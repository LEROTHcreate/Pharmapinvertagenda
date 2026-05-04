"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2, KeyRound, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChangePasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [show, setShow] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (next.length < 8) {
      setError("Le nouveau mot de passe doit faire au moins 8 caractères.");
      return;
    }
    if (next !== confirm) {
      setError("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Erreur lors du changement de mot de passe.");
        return;
      }
      setSuccess(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-md">
      <Field
        label="Mot de passe actuel"
        type={show ? "text" : "password"}
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
        disabled={isPending}
        required
      />
      <Field
        label="Nouveau mot de passe (8 caractères min.)"
        type={show ? "text" : "password"}
        value={next}
        onChange={setNext}
        autoComplete="new-password"
        disabled={isPending}
        required
      />
      <Field
        label="Confirmer le nouveau mot de passe"
        type={show ? "text" : "password"}
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        disabled={isPending}
        required
      />

      <label className="flex items-center gap-2 text-[13px] text-foreground/70 cursor-pointer select-none">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={show}
          onChange={(e) => setShow(e.target.checked)}
        />
        {show ? (
          <span className="inline-flex items-center gap-1">
            <EyeOff className="h-3.5 w-3.5" /> Masquer les mots de passe
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" /> Afficher les mots de passe
          </span>
        )}
      </label>

      {error && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-[13px] font-medium text-red-700 dark:text-red-300 ring-1 ring-inset ring-red-100 dark:ring-red-900/40"
        >
          {error}
        </div>
      )}
      {success && (
        <div
          role="status"
          className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-[13px] font-medium text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-100 dark:ring-emerald-900/40 flex items-center gap-2"
        >
          <Check className="h-4 w-4" />
          Mot de passe mis à jour. Tu peux maintenant l&apos;utiliser à ta prochaine
          connexion.
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className={cn(
          "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 px-6 text-[14px] font-medium text-white shadow-md shadow-violet-600/20 transition-all",
          "hover:shadow-lg hover:shadow-violet-600/30 hover:-translate-y-0.5",
          "active:translate-y-0 active:scale-[0.99]",
          "disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
        )}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <KeyRound className="h-4 w-4" />
        )}
        Mettre à jour mon mot de passe
      </button>
    </form>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  disabled,
  required,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-foreground/70 mb-1.5">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        required={required}
        className="block w-full h-11 rounded-xl border border-border bg-white px-3.5 text-[14px] text-foreground outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:opacity-60"
      />
    </label>
  );
}
