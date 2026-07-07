"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { TIME_SLOTS } from "@/types";
import { cn } from "@/lib/utils";

/**
 * « Affluence de l'équipe aujourd'hui » — effectif en poste par créneau sur les
 * heures d'ouverture (08:30 → 19:30), coloré selon le seuil d'effectif minimum
 * de l'officine (vert ≥ seuil · orange sous le seuil · rouge < 50 % du seuil),
 * avec une ligne de seuil et le créneau en cours surligné.
 *
 * Convention couleur alignée sur la règle produit (cf. CLAUDE.md / StaffingBadge).
 * S'appuie sur `presentBySlot` déjà calculé côté serveur ; le créneau courant
 * est déterminé à l'heure locale (rafraîchi chaque minute).
 */

const OPEN_SLOTS = TIME_SLOTS.filter((s) => s >= "08:30" && s < "19:30");

type Tone = "ok" | "low" | "critical" | "empty";

function toneFor(v: number, minStaff: number): Tone {
  if (v <= 0) return "empty";
  if (v >= minStaff) return "ok";
  if (v < minStaff * 0.5) return "critical";
  return "low";
}

const BAR: Record<Tone, { base: string; now: string }> = {
  ok: { base: "bg-emerald-400/70 dark:bg-emerald-500/40", now: "bg-emerald-600" },
  low: { base: "bg-amber-400/80 dark:bg-amber-500/50", now: "bg-amber-600" },
  critical: { base: "bg-red-400/80 dark:bg-red-500/50", now: "bg-red-600" },
  empty: { base: "bg-muted", now: "bg-zinc-400" },
};

export function StaffingStrip({
  presentBySlot,
  minStaff,
}: {
  presentBySlot: Record<string, number>;
  minStaff: number;
}) {
  const [slotNow, setSlotNow] = useState<string | null>(null);
  useEffect(() => {
    const compute = () => {
      const n = new Date();
      setSlotNow(
        `${String(n.getHours()).padStart(2, "0")}:${n.getMinutes() < 30 ? "00" : "30"}`
      );
    };
    compute();
    const id = setInterval(compute, 60_000);
    return () => clearInterval(id);
  }, []);

  const values = OPEN_SLOTS.map((s) => presentBySlot[s] ?? 0);
  const peak = Math.max(0, ...values);
  const max = Math.max(minStaff, peak, 1); // le seuil reste visible même si peak bas
  const understaffed = values.filter((v) => v < minStaff).length;
  const nowCount = slotNow ? presentBySlot[slotNow] ?? 0 : null;

  // Position (%) de la ligne de seuil dans la zone des barres.
  const thresholdPct = Math.min(100, (minStaff / max) * 100);

  return (
    <Link
      href="/planning"
      className="group block rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-violet-300 dark:hover:border-violet-800"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
            <Users className="h-4 w-4" />
          </span>
          <h2 className="text-[13.5px] font-semibold tracking-tight text-foreground">
            Affluence de l&apos;équipe
          </h2>
        </div>
        <span className="text-[11.5px] text-muted-foreground">
          pic <span className="font-semibold tabular-nums text-foreground">{peak}</span>
          {nowCount !== null && (
            <>
              {" · "}maintenant{" "}
              <span className="font-semibold tabular-nums text-foreground">{nowCount}</span>
            </>
          )}
        </span>
      </div>

      {/* Zone des barres + ligne de seuil */}
      <div className="relative flex h-16 items-end gap-[3px]">
        {/* Ligne de seuil (effectif minimum) */}
        {peak > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/25"
            style={{ bottom: `${thresholdPct}%` }}
          />
        )}
        {OPEN_SLOTS.map((s) => {
          const v = presentBySlot[s] ?? 0;
          const h = Math.round((v / max) * 100);
          const isNow = s === slotNow;
          const tone = toneFor(v, minStaff);
          return (
            <div
              key={s}
              title={`${s} · ${v} en poste${v < minStaff ? ` (seuil ${minStaff})` : ""}`}
              className="flex h-full flex-1 items-end"
            >
              <div
                className={cn(
                  "w-full rounded-t-[2px] transition-colors",
                  isNow ? BAR[tone].now : BAR[tone].base
                )}
                style={{ height: `${Math.max(v === 0 ? 6 : 10, h)}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* Repères horaires */}
      <div className="mt-1.5 flex justify-between text-[10px] font-medium tabular-nums text-muted-foreground/70">
        <span>8h30</span>
        <span>12h</span>
        <span>16h</span>
        <span>19h30</span>
      </div>

      {/* Note de couverture */}
      {peak > 0 && (
        <p className="mt-2 text-[12px]">
          {understaffed === 0 ? (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              Couverture assurée toute la journée
            </span>
          ) : (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {understaffed} créneau{understaffed > 1 ? "x" : ""} sous le seuil de{" "}
              {minStaff}
            </span>
          )}
        </p>
      )}
    </Link>
  );
}
