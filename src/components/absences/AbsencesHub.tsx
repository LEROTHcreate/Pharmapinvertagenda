"use client";

import { useState } from "react";
import { CalendarCheck, CalendarOff, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@prisma/client";
import { isAdminLevel } from "@/lib/permissions";
import { AbsencesView } from "@/components/absences/AbsencesView";
import { AvailabilityWishesView } from "@/components/disponibilites/AvailabilityWishesView";
import {
  CreneauxView,
  type EmployeeRef,
} from "@/components/creneaux/CreneauxView";

export type AbsencesHubTab = "absences" | "disponibilites" | "creneaux";

type Props = {
  currentUser: { role: UserRole; employeeId: string | null };
  initialTab?: AbsencesHubTab;
  /** Manageur+ : peut créer / assigner des créneaux à couvrir. */
  canManage: boolean;
  /** Collaborateurs actifs (pour l'onglet Créneaux à couvrir). */
  employees: EmployeeRef[];
};

/**
 * Regroupe les trois facettes de « qui est là / pas là / à remplacer » dans une
 * même page à onglets :
 *  · Absences — demandes & validations ;
 *  · Disponibilités — souhaits / indisponibilités ;
 *  · Créneaux à couvrir — trous de planning à pourvoir (volontariat + assignation).
 * Enchaînement naturel : une absence crée un trou → on le comble selon les dispos.
 */
export function AbsencesHub({
  currentUser,
  initialTab = "absences",
  canManage,
  employees,
}: Props) {
  const [tab, setTab] = useState<AbsencesHubTab>(initialTab);
  const isAdmin = isAdminLevel(currentUser.role);

  const tabs: {
    key: AbsencesHubTab;
    label: string;
    icon: typeof CalendarOff;
  }[] = [
    { key: "absences", label: "Absences", icon: CalendarOff },
    { key: "disponibilites", label: "Disponibilités", icon: CalendarCheck },
    { key: "creneaux", label: "Créneaux à couvrir", icon: ClipboardList },
  ];

  const subtitle =
    tab === "absences"
      ? isAdmin
        ? "Validez ou refusez les demandes des collaborateurs"
        : "Vos demandes d'absence et leur statut"
      : tab === "disponibilites"
        ? "Indisponibilités et préférences à prendre en compte dans le planning"
        : canManage
          ? "Signalez les trous à pourvoir et assignez les volontaires"
          : "Positionnez-vous sur les créneaux à couvrir";

  return (
    <div className="p-3 md:p-4 space-y-4">
      <header>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          Absences &amp; remplacements
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </header>

      {/* Onglets */}
      <div className="inline-flex flex-wrap rounded-full border border-border bg-card p-0.5">
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
      ) : tab === "disponibilites" ? (
        <AvailabilityWishesView
          isAdmin={isAdmin}
          hasEmployee={!!currentUser.employeeId}
        />
      ) : (
        <CreneauxView
          canManage={canManage}
          myEmployeeId={currentUser.employeeId}
          employees={employees}
        />
      )}
    </div>
  );
}
