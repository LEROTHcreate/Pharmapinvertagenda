"use client";

import { useState } from "react";
import { Check, Coins, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

/**
 * Réglage réservé aux TITULAIRE : comment leurs heures sont comptées dans les
 * stats.
 *  - "fixe" (countsOvertime = false, défaut) : rémunéré en dividendes / salaire
 *    fixe → les heures supplémentaires ne sont PAS comptabilisées (il travaille
 *    quoi qu'il arrive). Solde HS-Abs neutralisé.
 *  - "classique" (countsOvertime = true) : compté comme un collaborateur — les
 *    heures au-delà du contrat remontent en heures sup.
 */
export function TitulairePayModeCard({
  initialCountsOvertime,
}: {
  initialCountsOvertime: boolean;
}) {
  const { toast } = useToast();
  const [countsOvertime, setCountsOvertime] = useState(initialCountsOvertime);
  const [saving, setSaving] = useState(false);

  async function choose(next: boolean) {
    if (next === countsOvertime || saving) return;
    const previous = countsOvertime;
    setCountsOvertime(next); // optimiste
    setSaving(true);
    try {
      const res = await fetch("/api/profil/titulaire-pay-mode", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ countsOvertime: next }),
      });
      if (!res.ok) throw new Error();
      toast({
        tone: "success",
        title: "Préférence enregistrée",
        description: next
          ? "Vos heures supplémentaires sont désormais comptées."
          : "Vos heures supplémentaires ne sont plus comptées.",
      });
    } catch {
      setCountsOvertime(previous); // rollback
      toast({
        tone: "error",
        title: "Échec de l'enregistrement",
        description: "Réessayez dans un instant.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/70 mb-1">
        Titulaire
      </p>
      <h2 className="text-base font-semibold tracking-tight text-foreground mb-1">
        Comptage de mes heures
      </h2>
      <p className="text-[13px] text-muted-foreground mb-4">
        En tant que titulaire, vous travaillez souvent au-delà de votre contrat.
        Choisissez si vos heures supplémentaires doivent apparaître dans les
        statistiques.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <ModeOption
          active={!countsOvertime}
          disabled={saving}
          onClick={() => choose(false)}
          icon={<Coins className="h-4 w-4" />}
          title="Salaire fixe / dividendes"
          desc="Heures sup NON comptées (par défaut). Je travaille quoi qu'il arrive."
        />
        <ModeOption
          active={countsOvertime}
          disabled={saving}
          onClick={() => choose(true)}
          icon={<Clock className="h-4 w-4" />}
          title="Classique"
          desc="Comme un collaborateur : les heures au-delà du contrat comptent en heures sup."
        />
      </div>
    </section>
  );
}

function ModeOption({
  active,
  disabled,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "group relative flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors disabled:opacity-60",
        active
          ? "border-violet-400 bg-violet-50/70 dark:border-violet-700 dark:bg-violet-950/30"
          : "border-border bg-muted/20 hover:bg-muted/40"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full",
          active
            ? "bg-violet-600 text-white"
            : "bg-muted text-muted-foreground"
        )}
      >
        {icon}
      </span>
      <span className="flex w-full items-center gap-1.5">
        <span className="text-[13px] font-semibold text-foreground">{title}</span>
        {active && (
          <Check className="ml-auto h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
        )}
      </span>
      <span className="text-[11.5px] leading-relaxed text-muted-foreground">
        {desc}
      </span>
    </button>
  );
}
