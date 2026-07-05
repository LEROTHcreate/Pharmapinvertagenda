"use client";

import { useState } from "react";
import { CalendarCheck, CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@prisma/client";
import { AbsencesView } from "@/components/absences/AbsencesView";
import { AvailabilityWishesView } from "@/components/disponibilites/AvailabilityWishesView";

type Tab = "absences" | "disponibilites";

type Props = {
  currentUser: { role: UserRole; employeeId: string | null };
  initialTab?: Tab;
};

/**
 * Regroupe Absences (demandes/validations) et Disponibilités (souhaits) dans
 * une même page à onglets — deux facettes de « qui est là / pas là » utiles
 * au moment de bâtir le planning.
 */
export function AbsencesHub({ currentUser, initialTab = "absences" }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const isAdmin = currentUser.role === "ADMIN";

  const tabs: { key: Tab; label: string; icon: typeof CalendarOff }[] = [
    { key: "absences", label: "Absences", icon: CalendarOff },
    { key: "disponibilites", label: "Disponibilités", icon: CalendarCheck },
  ];

  return (
    <div className="p-3 md:p-4 space-y-4">
      <header>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          Absences &amp; disponibilités
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {tab === "absences"
            ? isAdmin
              ? "Validez ou refusez les demandes des collaborateurs"
              : "Vos demandes d'absence et leur statut"
            : "Indisponibilités et préférences à prendre en compte dans le planning"}
        </p>
      </header>

      {/* Onglets */}
      <div className="inline-flex rounded-full border border-border bg-card p-0.5">
        {tabs.map((t) => {
          const active = tab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 h-8 text-[13px] font-medium transition-colors",
                active
                  ? "bg-violet-600 text-white"
                  : "text-foreground/70 hover:bg-accent/60"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Contenu de l'onglet actif */}
      {tab === "absences" ? (
        <AbsencesView currentUser={currentUser} embedded />
      ) : (
        <AvailabilityWishesView
          isAdmin={isAdmin}
          hasEmployee={!!currentUser.employeeId}
        />
      )}
    </div>
  );
}
