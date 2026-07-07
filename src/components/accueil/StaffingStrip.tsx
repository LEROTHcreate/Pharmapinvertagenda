"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { TIME_SLOTS } from "@/types";
import { cn } from "@/lib/utils";

/**
 * « Affluence de l'équipe aujourd'hui » — mini-visualisation de l'effectif en
 * poste par créneau sur les heures d'ouverture (08:00 → 20:00). Barre par
 * créneau (hauteur ∝ effectif), créneau en cours surligné + repère « maintenant ».
 *
 * S'appuie sur `presentBySlot` déjà calculé côté serveur. Le créneau courant
 * est déterminé à l'heure locale du navigateur (rafraîchi chaque minute).
 */

const OPEN_SLOTS = TIME_SLOTS.filter((s) => s >= "08:00" && s < "20:00");

export function StaffingStrip({
  presentBySlot,
}: {
  presentBySlot: Record<string, number>;
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

  const max = Math.max(1, ...OPEN_SLOTS.map((s) => presentBySlot[s] ?? 0));
  const peak = OPEN_SLOTS.reduce(
    (acc, s) => Math.max(acc, presentBySlot[s] ?? 0),
    0
  );
  const nowCount = slotNow ? presentBySlot[slotNow] ?? 0 : null;

  return (
    <Link
      href="/planning"
      className="group block rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-violet-300 dark:hover:border-violet-800"
    >
      <div className="mb-3 flex items-center justify-between">
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

      {/* Barres par créneau */}
      <div className="flex h-16 items-end gap-[3px]">
        {OPEN_SLOTS.map((s) => {
          const v = presentBySlot[s] ?? 0;
          const h = Math.round((v / max) * 100);
          const isNow = s === slotNow;
          return (
            <div
              key={s}
              title={`${s} · ${v} en poste`}
              className="flex-1"
              style={{ height: "100%", display: "flex", alignItems: "flex-end" }}
            >
              <div
                className={cn(
                  "w-full rounded-t-[2px] transition-colors",
                  isNow
                    ? "bg-violet-600"
                    : v === 0
                      ? "bg-muted"
                      : "bg-violet-300/70 group-hover:bg-violet-400/80 dark:bg-violet-500/40"
                )}
                style={{ height: `${Math.max(v === 0 ? 6 : 10, h)}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* Repères horaires */}
      <div className="mt-1.5 flex justify-between text-[10px] font-medium tabular-nums text-muted-foreground/70">
        <span>8h</span>
        <span>12h</span>
        <span>16h</span>
        <span>20h</span>
      </div>
    </Link>
  );
}
