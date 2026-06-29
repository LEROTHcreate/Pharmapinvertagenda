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
  Coffee,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Page Accueil — tableau de bord pensé pour le mobile.
 *
 * Donne en un coup d'œil : ma journée, l'état de l'équipe aujourd'hui, et des
 * accès rapides vers tout le reste (dont Notes, sortie de la barre d'onglets).
 * Volontairement simple et lisible au pouce ; on l'enrichira au fil de l'eau.
 */

type DayBlock = { from: string; to: string; label: string; isAbsence: boolean };

export function AccueilView({
  firstName,
  dateLabel,
  isAdmin,
  myDay,
  teamPresent,
}: {
  firstName: string | null;
  dateLabel: string;
  isAdmin: boolean;
  myDay: { hours: number; blocks: DayBlock[] } | null;
  teamPresent: number;
}) {
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

  return (
    <div className="p-4 md:px-6 md:py-5 space-y-4 max-w-2xl mx-auto">
      {/* Salutation */}
      <header>
        <h1 className="text-[22px] md:text-[26px] font-semibold tracking-tight text-foreground">
          Bonjour{firstName ? ` ${firstName}` : ""} 👋
        </h1>
        <p className="text-[13px] text-muted-foreground capitalize mt-0.5">
          {dateLabel}
        </p>
      </header>

      {/* Ma journée */}
      {myDay && (
        <Link
          href="/planning"
          className="block rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[13px] uppercase tracking-[0.06em] font-semibold text-muted-foreground/70">
              Ma journée
            </h2>
            <span className="font-mono text-[13px] font-bold tabular-nums text-foreground">
              {myDay.hours > 0
                ? `${myDay.hours % 1 === 0 ? myDay.hours : myDay.hours.toFixed(1)}h`
                : ""}
            </span>
          </div>
          {myDay.blocks.length === 0 ? (
            <div className="flex items-center gap-2 text-foreground">
              <Coffee className="h-5 w-5 text-amber-500/80 shrink-0" />
              <span className="text-[14px] font-medium">Repos aujourd'hui — profite !</span>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {myDay.blocks.map((b, i) => (
                <li key={i} className="flex items-center gap-3 text-[13.5px]">
                  <span className="font-mono tabular-nums text-muted-foreground w-[92px] shrink-0">
                    {b.from}–{b.to}
                  </span>
                  <span
                    className={cn(
                      "font-medium",
                      b.isAbsence ? "text-amber-600 dark:text-amber-400" : "text-foreground"
                    )}
                  >
                    {b.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2.5 flex items-center gap-1 text-[12px] font-medium text-violet-600 dark:text-violet-400">
            Voir le planning <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </Link>
      )}

      {/* L'équipe aujourd'hui */}
      <Link
        href="/planning"
        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-[0.99] transition-transform"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-950/40">
          <Users className="h-5 w-5 text-violet-600 dark:text-violet-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-foreground">
            <span className="tabular-nums">{teamPresent}</span> au travail aujourd'hui
          </p>
          <p className="text-[12px] text-muted-foreground">Voir le planning de l'équipe</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
      </Link>

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
  );
}
