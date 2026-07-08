"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Cake,
  CalendarClock,
  CalendarHeart,
  CalendarOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  RotateCcw,
  ExternalLink,
  Flame,
  Lightbulb,
  Newspaper,
  PackageX,
  ShieldPlus,
  Truck,
  UserPlus,
  Users,
} from "lucide-react";
import type { CoverageWarning } from "@/lib/coverage-analysis";
import type { CcnViolation } from "@/lib/ccn-compliance";
import type { NewsItem } from "@/lib/pharmacy-news";
import type { PlanningTip } from "@/lib/planning-tips";
import { CcnComplianceWarnings } from "@/components/planning/CcnComplianceWarnings";
import { cn } from "@/lib/utils";

/** Absences groupées par jour de la semaine affichée. */
export type AbsentsDay = {
  date: string;
  dateLabel: string;
  people: { id: string; name: string; label: string | null }[];
};

/** Férié à venir (déjà formaté côté serveur pour rester déterministe). */
export type UpcomingHoliday = {
  date: string;
  name: string;
  dateLabel: string;
  daysUntil: number;
};

/** Souhait de dispo posé par un salarié pour un jour à venir. */
export type UpcomingWish = {
  id: string;
  employeeName: string;
  dateLabel: string;
  daysUntil: number;
  kind: "UNAVAILABLE" | "PREFER_OFF" | "PREFER_WORK";
  note: string | null;
};

/** Prochaine pharmacie de garde. */
export type UpcomingGarde = {
  id: string;
  pharmacistName: string;
  dateLabel: string;
  daysUntil: number;
  typeLabel: string;
};

/** Anniversaire d'ancienneté à fêter prochainement. */
export type WorkAnniversary = {
  id: string;
  name: string;
  years: number;
  dateLabel: string;
  daysUntil: number;
};

/** Dépassement d'heures contractuelles sur la semaine en cours. */
export type OvertimeItem = {
  id: string;
  name: string;
  contractHours: number;
  workedHours: number;
  overtimeHours: number;
};

export type InfosData = {
  isAdmin: boolean;
  weekLabel: string;
  /** Décalage de la semaine consultée vs la semaine courante (0 = cette semaine). */
  weekOffset: number;
  coverageWarnings: CoverageWarning[];
  ccnViolations: CcnViolation[];
  absentsByDay: AbsentsDay[];
  tips: PlanningTip[];
  holidays: UpcomingHoliday[];
  pending: { absences: number; users: number };
  upcomingWishes: UpcomingWish[];
  upcomingGardes: UpcomingGarde[];
  anniversaries: WorkAnniversary[];
  overtime: OvertimeItem[];
  /** Actualité pharmacie (flux Google Actualités, liens externes). */
  news: NewsItem[];
  /** Ruptures de stock & rappels de lots de médicaments (flux dédié). */
  alerts: NewsItem[];
};

const WISH_LABELS: Record<UpcomingWish["kind"], string> = {
  UNAVAILABLE: "Indisponible",
  PREFER_OFF: "Préfère off",
  PREFER_WORK: "Souhaite bosser",
};

const WISH_STYLES: Record<UpcomingWish["kind"], string> = {
  UNAVAILABLE: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  PREFER_OFF: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  PREFER_WORK: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
};

/** « dans X j » lisible (aujourd'hui / demain / dans N j). */
function daysUntilLabel(days: number): string {
  return days <= 0 ? "aujourd'hui" : days === 1 ? "demain" : `dans ${days} j`;
}

// Bornes de navigation (doivent rester alignées avec la page serveur).
const WEEK_MIN = -4;
const WEEK_MAX = 26;

/** Libellé relatif de la semaine consultée (« cette semaine », « dans 3 sem. »). */
function weekOffsetLabel(offset: number): string {
  if (offset === 0) return "cette semaine";
  if (offset === 1) return "semaine prochaine";
  if (offset === -1) return "semaine dernière";
  if (offset > 1) return `dans ${offset} sem.`;
  return `il y a ${-offset} sem.`;
}

/**
 * Navigateur de semaine — permet d'anticiper : voir en amont les conseils,
 * absents, souhaits et alertes de la semaine (ou du mois) suivante. Simple
 * jeu de liens `?w=` re-rendus côté serveur (la page est `force-dynamic`).
 */
function WeekNav({ offset }: { offset: number }) {
  const href = (o: number) => (o === 0 ? "/infos" : `/infos?w=${o}`);
  const canPrev = offset > WEEK_MIN;
  const canNext = offset < WEEK_MAX;
  const arrow =
    "flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  const disabled = "pointer-events-none opacity-40";

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {offset !== 0 && (
        <Link
          href="/infos"
          className="mr-0.5 inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Aujourd&apos;hui
        </Link>
      )}
      <Link
        href={href(offset - 1)}
        aria-label="Semaine précédente"
        className={cn(arrow, !canPrev && disabled)}
        aria-disabled={!canPrev}
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <span className="min-w-[8.5rem] text-center text-[12.5px] font-medium capitalize text-foreground">
        {weekOffsetLabel(offset)}
      </span>
      <Link
        href={href(offset + 1)}
        aria-label="Semaine suivante"
        className={cn(arrow, !canNext && disabled)}
        aria-disabled={!canNext}
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

/**
 * Centre « Infos & conseils » : regroupe en une seule page tout ce qui était
 * auparavant éparpillé (ampoule du planning, panneau statut équipe, badges).
 *
 * Sections :
 *  1. À traiter   — validations en attente + manquements de couverture (admin)
 *  2. Absents     — qui manque cette semaine, par jour
 *  3. Conseils    — anticipation (ponts, veilles de fériés, saison)
 *  4. Fériés      — prochains jours fériés (officine fermée)
 */
export function InfosView(data: InfosData) {
  const {
    isAdmin,
    weekLabel,
    weekOffset,
    coverageWarnings,
    ccnViolations,
    absentsByDay,
    tips,
    holidays,
    pending,
    upcomingWishes,
    upcomingGardes,
    anniversaries,
    overtime,
    news,
    alerts,
  } = data;

  // Libellé relatif de la semaine consultée, réutilisé dans les titres/sous-
  // titres pour ne pas dire « cette semaine » quand on consulte une semaine future.
  const wk = weekOffsetLabel(weekOffset);

  const totalAbsents = absentsByDay.reduce((n, d) => n + d.people.length, 0);
  const urgentCount = isAdmin
    ? pending.absences +
      pending.users +
      coverageWarnings.length +
      ccnViolations.length
    : 0;

  return (
    <div className="p-3 md:p-4 lg:p-6 pb-16">
      {/* En-tête (pleine largeur) */}
      <header className="mb-5 flex flex-wrap items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
          <Lightbulb className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Infos &amp; conseils
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Tout ce qu&apos;il faut anticiper, réuni ici ·{" "}
            <span className="capitalize">{weekLabel}</span>
          </p>
        </div>
        {/* Navigation semaine — anticiper les semaines/mois suivants. */}
        <div className="ml-auto mt-0.5">
          <WeekNav offset={weekOffset} />
        </div>
      </header>

      {/* Layout : à GAUCHE les sections opérationnelles / équipe en masonry
          (2 colonnes dès md, occupe 2/3 de la largeur sur xl) ; à DROITE une
          COLONNE DÉDIÉE à l'actualité pharmacie. `items-start` évite d'étirer
          les deux zones à la même hauteur. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3 xl:items-start">
        {/* Zone gauche — masonry des sections opérationnelles / équipe. */}
        <div className="xl:col-span-2 columns-1 gap-5 md:columns-2">
      {/* ─── 1. À traiter (admin) ─────────────────────────────────── */}
      {isAdmin && (
        <Section
          title="À traiter"
          icon={<AlertTriangle className="h-4 w-4" />}
          count={urgentCount}
          tone={urgentCount > 0 ? "amber" : "emerald"}
        >
          {urgentCount === 0 ? (
            <EmptyRow
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Tout est sous contrôle"
              subtitle={`Aucune validation en attente ni manquement de couverture ${wk}.`}
            />
          ) : (
            <div className="space-y-2">
              {/* Validations en attente */}
              {pending.absences > 0 && (
                <ActionLink
                  href="/absences"
                  icon={<CalendarOff className="h-4 w-4" />}
                  tone="red"
                  title={`${pending.absences} demande${pending.absences > 1 ? "s" : ""} d'absence à valider`}
                  subtitle="Approuver ou refuser les congés / arrêts en attente."
                />
              )}
              {pending.users > 0 && (
                <ActionLink
                  href="/utilisateurs"
                  icon={<UserPlus className="h-4 w-4" />}
                  tone="violet"
                  title={`${pending.users} demande${pending.users > 1 ? "s" : ""} d'inscription`}
                  subtitle="De nouveaux comptes attendent votre validation."
                />
              )}

              {/* Manquements de couverture */}
              {coverageWarnings.map((w, i) => (
                <CoverageCard key={`${w.kind}-${i}`} warning={w} />
              ))}

              {/* Conformité Convention collective (bandeau, masqué si conforme) */}
              <CcnComplianceWarnings violations={ccnViolations} />
            </div>
          )}
        </Section>
      )}

      {/* ─── 2. Absents (semaine consultée) ───────────────────────── */}
      <Section
        title={`Absents ${wk}`}
        icon={<Users className="h-4 w-4" />}
        count={totalAbsents}
        tone="slate"
      >
        {totalAbsents === 0 ? (
          <EmptyRow
            icon={<CheckCircle2 className="h-5 w-5" />}
            title="Équipe au complet"
            subtitle={`Personne d'absent ${wk}.`}
          />
        ) : (
          <ul className="space-y-2">
            {absentsByDay
              .filter((d) => d.people.length > 0)
              .map((d) => (
                <li
                  key={d.date}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
                >
                  <span className="w-24 shrink-0 text-[12px] font-semibold capitalize text-foreground">
                    {d.dateLabel}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {d.people.map((p) => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[12px] tracking-tight text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      >
                        {p.name}
                        {p.label && (
                          <span className="text-[10px] text-amber-600/80 dark:text-amber-400/70">
                            · {p.label}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
          </ul>
        )}
      </Section>

      {/* ─── 3. Conseils & anticipation ───────────────────────────── */}
      <Section
        title="Conseils & anticipation"
        icon={<Lightbulb className="h-4 w-4" />}
        count={tips.length}
        tone="amber"
      >
        {tips.length === 0 ? (
          <EmptyRow
            icon={<CheckCircle2 className="h-5 w-5" />}
            title="Rien de particulier en vue"
            subtitle="Aucun pic d'activité ou pont à anticiper dans les prochains jours."
          />
        ) : (
          <ul className="space-y-2">
            {tips.map((tip, i) => {
              const warn = tip.level === "warning";
              const Icon = warn ? AlertTriangle : CalendarClock;
              return (
                <li
                  key={`${tip.date}-${i}`}
                  className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      warn
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                        : "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold leading-snug text-foreground">
                      {tip.title}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                      {tip.description}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* ─── 4. Jours fériés à venir ──────────────────────────────── */}
      <Section
        title="Jours fériés à venir"
        icon={<CalendarClock className="h-4 w-4" />}
        count={holidays.length}
        tone="rose"
      >
        <ul className="space-y-2">
          {holidays.map((h) => (
            <li
              key={h.date}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-[10px] font-bold uppercase tracking-wide text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                Fer.
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-tight text-foreground">
                  {h.name}
                </p>
                <p className="mt-0.5 text-[12px] capitalize text-muted-foreground">
                  {h.dateLabel}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                {h.daysUntil === 0
                  ? "aujourd'hui"
                  : h.daysUntil === 1
                    ? "demain"
                    : `dans ${h.daysUntil} j`}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* ─── Souhaits de dispo à venir (admin) ────────────────────── */}
      {isAdmin && (
        <Section
          title="Souhaits de dispo"
          icon={<CalendarHeart className="h-4 w-4" />}
          count={upcomingWishes.length}
          tone="teal"
        >
          {upcomingWishes.length === 0 ? (
            <EmptyRow
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Aucun souhait posé"
              subtitle="Personne n'a signalé d'indispo ou de préférence pour les 14 prochains jours."
            />
          ) : (
            <ul className="space-y-2">
              {upcomingWishes.map((w) => (
                <li
                  key={w.id}
                  className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      WISH_STYLES[w.kind]
                    )}
                  >
                    {WISH_LABELS[w.kind]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold leading-tight text-foreground">
                      {w.employeeName}
                    </p>
                    <p className="mt-0.5 text-[12px] capitalize text-muted-foreground">
                      {w.dateLabel} · {daysUntilLabel(w.daysUntil)}
                    </p>
                    {w.note && (
                      <p className="mt-1 text-[11.5px] italic leading-snug text-muted-foreground/80">
                        « {w.note} »
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* ─── Prochaines gardes (tous) ──────────────────────────────── */}
      <Section
        title="Prochaines gardes"
        icon={<ShieldPlus className="h-4 w-4" />}
        count={upcomingGardes.length}
        tone="indigo"
      >
        {upcomingGardes.length === 0 ? (
          <EmptyRow
            icon={<CheckCircle2 className="h-5 w-5" />}
            title="Aucune garde programmée"
            subtitle="Aucune pharmacie de garde n'est planifiée pour le moment."
          />
        ) : (
          <ul className="space-y-2">
            {upcomingGardes.map((g) => (
              <li
                key={g.id}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                  <ShieldPlus className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-tight text-foreground">
                    {g.pharmacistName}
                    <span className="ml-1.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                      {g.typeLabel}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[12px] capitalize text-muted-foreground">
                    {g.dateLabel}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {daysUntilLabel(g.daysUntil)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ─── Anniversaires d'ancienneté (tous) ─────────────────────── */}
      {anniversaries.length > 0 && (
        <Section
          title="Anniversaires d'ancienneté"
          icon={<Cake className="h-4 w-4" />}
          count={anniversaries.length}
          tone="rose"
        >
          <ul className="space-y-2">
            {anniversaries.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                  <Cake className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-tight text-foreground">
                    {a.name}
                    <span className="ml-1.5 font-bold text-rose-600 dark:text-rose-300">
                      {a.years} an{a.years > 1 ? "s" : ""}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[12px] capitalize text-muted-foreground">
                    {a.dateLabel} · {daysUntilLabel(a.daysUntil)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ─── Heures sup de la semaine (admin) ──────────────────────── */}
      {isAdmin && (
        <Section
          title={`Heures sup ${wk}`}
          icon={<Clock className="h-4 w-4" />}
          count={overtime.length}
          tone="amber"
        >
          {overtime.length === 0 ? (
            <EmptyRow
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Rien à signaler"
              subtitle={`Aucun salarié ne dépasse son contrat ${wk}.`}
            />
          ) : (
            <ul className="space-y-2">
              {overtime.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    <Clock className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold leading-tight text-foreground">
                      {o.name}
                    </p>
                    <p className="mt-0.5 text-[12px] tabular-nums text-muted-foreground">
                      {o.workedHours}h faites / {o.contractHours}h au contrat
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    +{o.overtimeHours}h
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

        </div>

        {/* ═══ COLONNE DÉDIÉE : Actualité pharmacie ═══════════════════ */}
        <aside className="space-y-5">
      {/* ─── Actu pharmacie (Google Actualités — liens externes) ──── */}
      {news.length > 0 && (
        <Section
          title="Actu pharmacie"
          icon={<Newspaper className="h-4 w-4" />}
          count={news.length}
          tone="indigo"
        >
          <ul className="space-y-2">
            {news.map((n) => (
              <li key={n.link}>
                <a
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                    <Newspaper className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold leading-snug text-foreground group-hover:text-indigo-700 dark:group-hover:text-indigo-300">
                      {n.title}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="truncate">{n.source}</span>
                      {n.dateLabel && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="shrink-0 tabular-nums">{n.dateLabel}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ─── Ruptures de stock & rappels de lots (flux dédié) ──────── */}
      {alerts.length > 0 && (
        <Section
          title="Ruptures & rappels"
          icon={<PackageX className="h-4 w-4" />}
          count={alerts.length}
          tone="rose"
        >
          <ul className="space-y-2">
            {alerts.map((n) => (
              <li key={n.link}>
                <a
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                    <PackageX className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold leading-snug text-foreground group-hover:text-rose-700 dark:group-hover:text-rose-300">
                      {n.title}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="truncate">{n.source}</span>
                      {n.dateLabel && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="shrink-0 tabular-nums">{n.dateLabel}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}
        </aside>
      </div>
    </div>
  );
}

/* ─── Sous-composants ────────────────────────────────────────────── */

const TONE_STYLES = {
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  slate: "bg-muted text-muted-foreground",
} as const;

function Section({
  title,
  icon,
  count,
  tone,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  tone: keyof typeof TONE_STYLES;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 break-inside-avoid rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.06)]">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full",
            TONE_STYLES[tone]
          )}
        >
          {icon}
        </span>
        <h2 className="text-[14px] font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {count > 0 && (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyRow({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-emerald-50/50 px-3 py-3 dark:bg-emerald-950/20">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground">{title}</p>
        <p className="text-[12px] text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

const ACTION_TONE = {
  red: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
} as const;

function ActionLink({
  href,
  icon,
  tone,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  tone: keyof typeof ACTION_TONE;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/50"
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          ACTION_TONE[tone]
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-tight text-foreground">
          {title}
        </p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Carte descriptive d'un manquement de couverture (sous-effectif…). */
function CoverageCard({ warning: w }: { warning: CoverageWarning }) {
  const day = formatDayShort(w.date);
  let icon: React.ReactNode;
  let tone: "red" | "amber" | "indigo";
  let title: string;
  let subtitle: string;

  if (w.kind === "no-pharmacist") {
    icon = <AlertTriangle className="h-4 w-4" />;
    tone = "red";
    title = `Aucun pharmacien — ${day}`;
    subtitle = `Créneaux sans pharmacien : ${w.slots.join(", ")}.`;
  } else if (w.kind === "few-preparers") {
    icon = <AlertTriangle className="h-4 w-4" />;
    tone = "amber";
    title = `${w.minCount === 0 ? "Aucun" : w.minCount} préparateur${w.minCount > 1 ? "s" : ""} — ${day}`;
    subtitle = `Sous l'objectif de 2 sur : ${w.slots.join(", ")}.`;
  } else if (w.kind === "livreur-absent") {
    icon = <Truck className="h-4 w-4" />;
    tone = "indigo";
    title = `${w.employeeName} (livreur) absent — ${day}`;
    subtitle = "Prévoir un titulaire sur les tournées de livraison.";
  } else {
    icon = <Flame className="h-4 w-4" />;
    tone = "red";
    title = `Grosse journée sous-staffée — ${day}`;
    subtitle = `${capitalize(w.reason)} : effectif minimal ${w.minCount}/${w.threshold}, pensez à renforcer.`;
  }

  const toneCls = {
    red: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  }[tone];

  return (
    <Link
      href="/planning"
      className="group flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/50"
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          toneCls
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-tight text-foreground">
          {title}
        </p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      </div>
      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function formatDayShort(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
