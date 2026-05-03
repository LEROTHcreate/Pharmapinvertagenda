import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "@/components/profil/ChangePasswordForm";
import { AvatarPicker } from "@/components/profil/AvatarPicker";
import { startOfWeek, toIsoDate, weekDays } from "@/lib/planning-utils";
import { computeStats } from "@/lib/stats";
import { ABSENCE_LABELS, STATUS_LABELS } from "@/types";
import { ArrowRight, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon profil · PharmaPlanning" };

export default async function ProfilPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // ─── Avatar choisi par l'utilisateur (User.avatarId) ────────────
  const sessionUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { avatarId: true },
  });

  // ─── Profil métier (si lié à une fiche planning) ────────────────
  const employee = session.user.employeeId
    ? await prisma.employee.findFirst({
        where: {
          id: session.user.employeeId,
          pharmacyId: session.user.pharmacyId,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          weeklyHours: true,
          displayColor: true,
          hireDate: true,
        },
      })
    : null;

  // ─── Heures de la semaine en cours + stats semestre + absences à venir ──
  let weekHours = 0;
  let myStat: {
    periodLabel: string;
    taskHours: number;
    overtimeHours: number;
    absenceHours: number;
    hsAbsBalance: number;
  } | null = null;
  let upcomingAbsences: Array<{
    id: string;
    dateStart: string;
    dateEnd: string;
    absenceCode: "ABSENT" | "CONGE" | "MALADIE" | "FORMATION_ABS";
    status: "PENDING" | "APPROVED" | "REJECTED";
    reason: string | null;
  }> = [];
  let weekStart = "";

  if (employee) {
    const monday = startOfWeek(new Date());
    const days = weekDays(monday);
    weekStart = toIsoDate(monday);
    const weekEnd = toIsoDate(days[5]);

    const [weekEntries, stats, absences] = await Promise.all([
      prisma.scheduleEntry.findMany({
        where: {
          employeeId: employee.id,
          date: {
            gte: new Date(`${weekStart}T00:00:00Z`),
            lte: new Date(`${weekEnd}T23:59:59Z`),
          },
          type: "TASK",
        },
        select: { id: true },
      }),
      computeStats(session.user.pharmacyId, "semester"),
      prisma.absenceRequest.findMany({
        where: {
          employeeId: employee.id,
          dateEnd: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          status: { in: ["PENDING", "APPROVED"] },
        },
        orderBy: { dateStart: "asc" },
        take: 5,
        select: {
          id: true,
          dateStart: true,
          dateEnd: true,
          absenceCode: true,
          status: true,
          reason: true,
        },
      }),
    ]);

    weekHours = weekEntries.length * 0.5;
    const stat = stats.employees.find((e) => e.id === employee.id);
    if (stat) {
      myStat = {
        periodLabel: stats.periodLabel,
        taskHours: stat.taskHours,
        overtimeHours: stat.overtimeHours,
        absenceHours: stat.absenceHours,
        hsAbsBalance: stat.hsAbsBalance,
      };
    }
    upcomingAbsences = absences.map((a) => ({
      id: a.id,
      dateStart: a.dateStart.toISOString().slice(0, 10),
      dateEnd: a.dateEnd.toISOString().slice(0, 10),
      absenceCode: a.absenceCode,
      status: a.status,
      reason: a.reason,
    }));
  }

  const weekDelta = employee ? weekHours - employee.weeklyHours : 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          Mon profil
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Vos informations, vos heures et la sécurité de votre compte
        </p>
      </div>

      {/* ─── Identité ────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/70 mb-3">
          Compte
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13.5px]">
          <div>
            <p className="text-muted-foreground text-[11.5px] mb-0.5">Nom</p>
            <p className="font-medium text-foreground flex items-center gap-2">
              {employee && (
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ background: employee.displayColor }}
                />
              )}
              {session.user.name}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-[11.5px] mb-0.5">Email</p>
            <p className="font-medium text-foreground truncate">
              {session.user.email}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-[11.5px] mb-0.5">Rôle</p>
            <p className="font-medium text-foreground">
              {session.user.role === "ADMIN"
                ? "Administrateur"
                : "Collaborateur"}
            </p>
          </div>
          {employee && (
            <>
              <div>
                <p className="text-muted-foreground text-[11.5px] mb-0.5">Statut</p>
                <p className="font-medium text-foreground">
                  {STATUS_LABELS[employee.status]}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[11.5px] mb-0.5">
                  Contrat hebdomadaire
                </p>
                <p className="font-medium text-foreground tabular-nums">
                  {employee.weeklyHours}h / semaine
                </p>
              </div>
              {employee.hireDate && (
                <div>
                  <p className="text-muted-foreground text-[11.5px] mb-0.5">
                    Date d'embauche
                  </p>
                  <p className="font-medium text-foreground tabular-nums">
                    {employee.hireDate.toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ─── Heures et solde (si profil métier) ────────────────────── */}
      {employee && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
            <p className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/70">
              Mes heures
            </p>
            <div className="flex items-center gap-3">
              <Link
                href={`/planning/collaborateur/${employee.id}/imprimer?week=${weekStart}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-600 hover:text-violet-700 transition-colors"
                title="Ouvrir une version imprimable A4 de ma semaine"
              >
                <Printer className="h-3 w-3" />
                Imprimer ma semaine
              </Link>
              <Link
                href={`/planning/collaborateur/${employee.id}?view=week&week=${weekStart}`}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-violet-600 hover:text-violet-700 transition-colors"
              >
                Voir mon planning
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatCard
              label="Cette semaine"
              value={`${weekHours.toFixed(1)}h`}
              hint={
                Math.abs(weekDelta) < 0.5
                  ? "à l'équilibre du contrat"
                  : weekDelta > 0
                    ? `+${weekDelta.toFixed(1)}h vs contrat`
                    : `${weekDelta.toFixed(1)}h vs contrat`
              }
              tone={
                Math.abs(weekDelta) < 0.5
                  ? "neutral"
                  : weekDelta > 0
                    ? "rose"
                    : "amber"
              }
            />
            {myStat && (
              <StatCard
                label={`Solde HS-Abs · ${myStat.periodLabel}`}
                value={`${myStat.hsAbsBalance > 0 ? "+" : ""}${myStat.hsAbsBalance.toFixed(1)}h`}
                hint={`${myStat.overtimeHours.toFixed(1)}h sup. − ${myStat.absenceHours.toFixed(1)}h d'absence`}
                tone={
                  Math.abs(myStat.hsAbsBalance) < 0.5
                    ? "neutral"
                    : myStat.hsAbsBalance > 0
                      ? "rose"
                      : "emerald"
                }
              />
            )}
          </div>
        </section>
      )}

      {/* ─── Prochaines absences ──────────────────────────────────── */}
      {employee && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/70">
              Mes prochaines absences
            </p>
            <Link
              href="/absences"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-violet-600 hover:text-violet-700 transition-colors"
            >
              Voir tout
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {upcomingAbsences.length === 0 ? (
            <p className="text-[13px] italic text-muted-foreground/70">
              Aucune absence à venir.
            </p>
          ) : (
            <ul className="space-y-2">
              {upcomingAbsences.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground">
                      {ABSENCE_LABELS[a.absenceCode]}
                    </p>
                    <p className="text-[12px] text-muted-foreground tabular-nums">
                      {new Date(a.dateStart).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                      })}
                      {a.dateStart !== a.dateEnd && (
                        <>
                          {" → "}
                          {new Date(a.dateEnd).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </>
                      )}
                      {a.reason && (
                        <span className="text-muted-foreground/70 italic">
                          {" "}
                          · {a.reason}
                        </span>
                      )}
                    </p>
                  </div>
                  {a.status === "PENDING" && (
                    <Badge variant="warning">En attente</Badge>
                  )}
                  {a.status === "APPROVED" && (
                    <Badge variant="success">Validée</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ─── Avatar (perso médicament façon mascotte) ───────────────── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/70 mb-1">
          Avatar
        </p>
        <h2 className="text-base font-semibold tracking-tight text-foreground mb-1">
          Mon personnage
        </h2>
        <p className="text-[13px] text-muted-foreground mb-4">
          Choisis ton perso — il apparaîtra dans le bandeau de bienvenue, dans
          la liste des utilisateurs et dans les conversations. Tu peux changer
          quand tu veux.
        </p>
        <AvatarPicker
          currentAvatarId={sessionUser?.avatarId ?? null}
          firstName={
            employee?.firstName ??
            (session.user.name ?? "").trim().split(/\s+/).pop() ??
            ""
          }
          color={employee?.displayColor}
        />
      </section>

      {/* ─── Sécurité — changement de mot de passe ─────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/70 mb-1">
          Sécurité
        </p>
        <h2 className="text-base font-semibold tracking-tight text-foreground mb-1">
          Changer mon mot de passe
        </h2>
        <p className="text-[13px] text-muted-foreground mb-5">
          Saisis ton mot de passe actuel pour le confirmer, puis le nouveau (8
          caractères minimum).
        </p>
        <ChangePasswordForm />
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "neutral" | "rose" | "amber" | "emerald";
}) {
  const toneClasses = {
    neutral: "text-foreground/85",
    rose: "text-rose-600",
    amber: "text-amber-600",
    emerald: "text-emerald-700",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <p className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold font-mono tabular-nums ${toneClasses}`}
      >
        {value}
      </p>
      <p className="text-[11.5px] text-muted-foreground mt-0.5">{hint}</p>
    </div>
  );
}
