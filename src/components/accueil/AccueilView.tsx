import Link from "next/link";
import {
  Calendar,
  CalendarOff,
  MessageCircle,
  StickyNote,
  User,
  Users,
  BarChart3,
  LayoutTemplate,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MyDayCard } from "@/components/accueil/MyDayCard";
import { MyWeekCard } from "@/components/accueil/MyWeekCard";
import { StaffingStrip } from "@/components/accueil/StaffingStrip";
import { TeamTodayCard } from "@/components/accueil/TeamTodayCard";
import { NextGardeCard } from "@/components/accueil/NextGardeCard";
import { ActionsCard } from "@/components/accueil/ActionsCard";
import { Greeting } from "@/components/accueil/Greeting";
import { AccueilDesktop } from "@/components/accueil/AccueilDesktop";
import type { AccueilData } from "@/components/accueil/types";

/**
 * Page Accueil — tableau de bord.
 *  • ≥ lg : `AccueilDesktop` (large, colonnes).
 *  • < lg : version mobile ci-dessous (une colonne, tactile).
 *
 * En un coup d'œil : salutation, alertes actionnables, ma journée / ma semaine,
 * affluence de l'équipe, équipe du jour, prochaine garde, accès rapides.
 */
export function AccueilView(data: AccueilData) {
  const {
    firstName,
    dateLabel,
    isAdmin,
    myDay,
    myWeek,
    nextSlot,
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
  } = data;

  const tiles = [
    { href: "/planning", label: "Planning", icon: Calendar, tone: "violet" },
    { href: "/absences", label: "Absences", icon: CalendarOff, tone: "amber" },
    { href: "/messages", label: "Messages", icon: MessageCircle, tone: "blue" },
    { href: "/notes", label: "Notes", icon: StickyNote, tone: "emerald" },
    ...(isAdmin
      ? [
          { href: "/employes", label: "Équipe", icon: Users, tone: "violet" },
          { href: "/stats", label: "Stats", icon: BarChart3, tone: "blue" },
          { href: "/gabarits", label: "Gabarits", icon: LayoutTemplate, tone: "amber" },
        ]
      : []),
    { href: "/profil", label: "Profil", icon: User, tone: "zinc" },
  ];

  const toneClass: Record<string, string> = {
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    zinc: "bg-muted text-foreground/70",
  };

  const showMsgAlert = unreadMessages > 0;

  return (
    <>
      {/* ≥ lg : tableau de bord large */}
      <AccueilDesktop {...data} />

      {/* < lg : version mobile */}
      <div className="lg:hidden p-4 md:px-6 md:py-5 space-y-4 max-w-2xl mx-auto">
        {/* Salutation */}
        <header>
          <h1 className="text-[22px] md:text-[26px] font-semibold tracking-tight text-foreground">
            <Greeting firstName={firstName} />
          </h1>
          <p className="text-[13px] text-muted-foreground capitalize mt-0.5">{dateLabel}</p>
        </header>

        {/* À traiter (responsables) — absences / inscriptions / échanges */}
        {isAdmin && (
          <ActionsCard
            pendingAbsences={pendingAbsences}
            pendingUsers={pendingUsers}
            pendingSwaps={pendingSwaps}
            hideWhenEmpty
          />
        )}

        {/* Messages non lus */}
        {showMsgAlert && (
          <Link
            href="/messages"
            className="flex items-center gap-3 rounded-xl border border-blue-200/70 bg-blue-50/70 dark:border-blue-900/40 dark:bg-blue-950/20 px-3.5 py-3 active:scale-[0.99] transition-transform"
          >
            <MessageCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <p className="flex-1 text-[13.5px] font-medium text-blue-900 dark:text-blue-200">
              <span className="tabular-nums font-bold">{unreadMessages}</span> message
              {unreadMessages > 1 ? "s" : ""} non lu{unreadMessages > 1 ? "s" : ""}
            </p>
            <ChevronRight className="h-4 w-4 text-blue-600/60 shrink-0" />
          </Link>
        )}

        {/* Ma journée */}
        {myDay && <MyDayCard hours={myDay.hours} blocks={myDay.blocks} nextSlot={nextSlot} />}

        {/* Ma semaine */}
        {myWeek && myWeek.contract > 0 && (
          <MyWeekCard done={myWeek.done} contract={myWeek.contract} />
        )}

        {/* Affluence de l'équipe */}
        <StaffingStrip presentBySlot={presentBySlot} minStaff={minStaff} />

        {/* L'équipe aujourd'hui (présents / absents) */}
        <TeamTodayCard present={presentToday} absents={absentsToday} teamSize={teamSize} />

        {/* Prochaine garde */}
        {nextGarde && <NextGardeCard garde={nextGarde} />}

        {/* Accès rapides */}
        <section>
          <h2 className="px-1 pb-2 text-[13px] uppercase tracking-[0.06em] font-semibold text-muted-foreground/70">
            Accès rapides
          </h2>
          <div className="grid grid-cols-3 gap-2.5">
            {tiles.map((t) => {
              const Icon = t.icon;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-card py-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-[0.97] transition-transform"
                >
                  <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", toneClass[t.tone])}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-[12px] font-medium text-foreground">{t.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
