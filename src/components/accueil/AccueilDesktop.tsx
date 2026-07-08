import Link from "next/link";
import {
  Calendar,
  CalendarOff,
  MessageCircle,
  StickyNote,
  Users,
  BarChart3,
  Banknote,
  ShieldCheck,
  LayoutTemplate,
  UserCog,
  ChevronRight,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MyDayCard } from "@/components/accueil/MyDayCard";
import { MyWeekCard } from "@/components/accueil/MyWeekCard";
import { TeamNowStat } from "@/components/accueil/TeamNowStat";
import { StaffingStrip } from "@/components/accueil/StaffingStrip";
import { TeamTodayCard } from "@/components/accueil/TeamTodayCard";
import { NextGardeCard } from "@/components/accueil/NextGardeCard";
import { ActionsCard } from "@/components/accueil/ActionsCard";
import { AccueilNews } from "@/components/accueil/AccueilNews";
import { OnboardingChecklist } from "@/components/accueil/OnboardingChecklist";
import { Greeting } from "@/components/accueil/Greeting";
import { WeatherChip } from "@/components/accueil/WeatherChip";
import { canEditPlanning } from "@/lib/permissions";
import type { AccueilData } from "@/components/accueil/types";
import { TodayEventCelebration } from "@/components/team/EventCelebration";

/**
 * Tableau de bord ACCUEIL — version desktop (large écran, ≥ lg).
 *
 * Bandeau de KPIs cliquables → colonne principale (ma journée, affluence,
 * ma semaine) + colonne latérale (équipe du jour, prochaine garde, raccourcis).
 * Toutes les données viennent de la page ; aucune requête ici.
 */

const TONE: Record<string, { box: string; hover: string }> = {
  amber: {
    box: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
    hover: "hover:border-amber-300 dark:hover:border-amber-800",
  },
  blue: {
    box: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300",
    hover: "hover:border-blue-300 dark:hover:border-blue-800",
  },
  violet: {
    box: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
    hover: "hover:border-violet-300 dark:hover:border-violet-800",
  },
  emerald: {
    box: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    hover: "hover:border-emerald-300 dark:hover:border-emerald-800",
  },
};

/** Tuile KPI (libellé + grand chiffre + note contextuelle, cliquable). */
function StatCard({
  href,
  label,
  value,
  hint,
  icon: Icon,
  tone,
  alert,
}: {
  href: string;
  label: string;
  value: number | string;
  hint?: string;
  icon: typeof Users;
  tone: keyof typeof TONE;
  alert?: boolean;
}) {
  const t = TONE[tone];
  return (
    <Link
      href={href}
      className={cn(
        "rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors",
        alert ? "border-amber-300/80 dark:border-amber-800/80" : "border-border",
        t.hover
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", t.box)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-1.5 font-mono text-[30px] font-semibold tabular-nums leading-none text-foreground">
        {value}
      </div>
      {hint && <div className="mt-1 text-[11.5px] text-muted-foreground">{hint}</div>}
    </Link>
  );
}

export function AccueilDesktop(data: AccueilData) {
  const {
    firstName,
    dateLabel,
    isAdmin,
    myDay,
    myWeek,
    nextSlot,
    role,
    canViewPayroll,
    news,
    alerts,
    onboarding,
    teamPresent,
    teamSize,
    minStaff,
    presentBySlot,
    presentToday,
    absentsToday,
    nextGarde,
    pendingAbsences,
    pendingUsers,
    pendingSwaps,
    unreadMessages,
    todayEvents,
  } = data;

  const hasPersonal = !!myDay || (!!myWeek && myWeek.contract > 0);
  // MANAGEUR : accède au planning, aux gabarits et à l'équipe (canEditPlanning).
  const isManager = canEditPlanning(role);

  // Raccourcis gatés par CAPACITÉ (conforme aux 4 rôles) :
  //  · tous : planning, absences, messages, notes
  //  · manageur+ : gabarits, équipe
  //  · titulaire/créateur : stats, gardes, utilisateurs
  //  · module paie : uniquement si autorisé (canViewPayroll)
  const shortcuts = [
    { href: "/planning", label: "Planning", icon: Calendar, tone: "violet" as const },
    { href: "/absences", label: "Absences & dispos", icon: CalendarOff, tone: "amber" as const },
    { href: "/messages", label: "Messages", icon: MessageCircle, tone: "blue" as const },
    { href: "/notes", label: "Notes", icon: StickyNote, tone: "emerald" as const },
    ...(isManager
      ? [
          { href: "/gabarits", label: "Gabarits", icon: LayoutTemplate, tone: "amber" as const },
          { href: "/employes", label: "Équipe", icon: Users, tone: "violet" as const },
        ]
      : []),
    ...(isAdmin
      ? [
          { href: "/stats", label: "Statistiques", icon: BarChart3, tone: "blue" as const },
          { href: "/gardes", label: "Gardes", icon: ShieldCheck, tone: "violet" as const },
          { href: "/utilisateurs", label: "Utilisateurs", icon: UserCog, tone: "violet" as const },
        ]
      : []),
    ...(canViewPayroll
      ? [{ href: "/remuneration", label: "Rémunération", icon: Banknote, tone: "emerald" as const }]
      : []),
  ];

  // Cartes « à venir » (ma semaine / prochaine garde) réellement présentes —
  // rendues dans une rangée pleine largeur (plus de colonne latérale fourre-tout).
  const hasUpcoming = (!!myWeek && myWeek.contract > 0) || !!nextGarde;

  return (
    <div className="hidden lg:block w-full px-6 xl:px-8 py-7 space-y-6">
      {/* En-tête */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-foreground">
            <Greeting firstName={firstName} />
          </h1>
          <p className="mt-0.5 text-[14px] capitalize text-muted-foreground">{dateLabel}</p>
        </div>
        <WeatherChip className="mt-1 shrink-0" />
      </header>

      {/* Fête « jour d'événement » — confettis + bandeau si un moment d'équipe aujourd'hui */}
      {todayEvents.length > 0 && <TodayEventCelebration events={todayEvents} />}

      {/* Checklist de démarrage (manageur+, tant que non configuré) */}
      {isManager && <OnboardingChecklist state={onboarding} />}

      {/* Bandeau KPIs — pleine largeur */}
      <div className={cn("grid gap-4", isAdmin ? "grid-cols-4" : "grid-cols-3")}>
        <TeamNowStat presentBySlot={presentBySlot} dayTotal={teamPresent} />
        <StatCard
          href="/planning"
          label="Effectif du jour"
          value={teamPresent}
          hint={`sur ${teamSize} dans l'équipe`}
          icon={Users}
          tone="violet"
        />
        {isAdmin && (
          <StatCard
            href="/absences"
            label="Absences à valider"
            value={pendingAbsences}
            hint={pendingAbsences > 0 ? "en attente" : "rien à traiter"}
            icon={CalendarOff}
            tone="amber"
            alert={pendingAbsences > 0}
          />
        )}
        <StatCard
          href="/messages"
          label="Messages non lus"
          value={unreadMessages}
          hint={unreadMessages > 0 ? "à lire" : "boîte à jour"}
          icon={MessageCircle}
          tone="blue"
          alert={unreadMessages > 0}
        />
      </div>

      {/* Actus + ruptures — 2 colonnes qui défilent */}
      <AccueilNews news={news} alerts={alerts} />

      {/* Actions admin à traiter — pleine largeur */}
      {isAdmin && (
        <ActionsCard
          pendingAbsences={pendingAbsences}
          pendingUsers={pendingUsers}
          pendingSwaps={pendingSwaps}
        />
      )}

      {/* Aujourd'hui : ma journée (large) + équipe du jour (compacte) */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          {myDay ? (
            <MyDayCard hours={myDay.hours} blocks={myDay.blocks} nextSlot={nextSlot} />
          ) : (
            <Link
              href="/planning"
              className="flex h-full items-center gap-4 rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-violet-300 dark:hover:border-violet-800"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                <LayoutDashboard className="h-6 w-6" />
              </span>
              <div className="flex-1">
                <p className="text-[15px] font-semibold text-foreground">Vue d&apos;ensemble</p>
                <p className="text-[13px] text-muted-foreground">
                  {hasPersonal
                    ? "Vous n'êtes pas planifié aujourd'hui — ouvrez le planning de l'équipe."
                    : "Ouvrez le planning de l'équipe pour voir la journée."}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground/50" />
            </Link>
          )}
        </div>
        <TeamTodayCard
          present={presentToday}
          absents={absentsToday}
          teamSize={teamSize}
        />
      </div>

      {/* Affluence par créneau — pleine largeur */}
      <StaffingStrip presentBySlot={presentBySlot} minStaff={minStaff} />

      {/* À venir : ma semaine + prochaine garde — rangée équilibrée */}
      {hasUpcoming && (
        <div className="grid grid-cols-2 gap-6">
          {myWeek && myWeek.contract > 0 && (
            <MyWeekCard done={myWeek.done} contract={myWeek.contract} />
          )}
          {nextGarde && <NextGardeCard garde={nextGarde} />}
        </div>
      )}

      {/* Accès rapides — grille horizontale pleine largeur (plus de nav en colonne) */}
      <section>
        <h2 className="px-1 pb-2.5 text-[12px] uppercase tracking-[0.06em] font-semibold text-muted-foreground/70">
          Accès rapides
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {shortcuts.map((s) => {
            const Icon = s.icon;
            const t = TONE[s.tone];
            return (
              <Link
                key={s.href}
                href={s.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors",
                  t.hover
                )}
              >
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", t.box)}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-[13.5px] font-medium text-foreground">{s.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
