import Link from "next/link";
import {
  Rocket,
  Check,
  Users,
  LayoutTemplate,
  CalendarRange,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type OnboardingState = {
  hasTeam: boolean;
  hasTemplate: boolean;
  hasPlanning: boolean;
};

/**
 * Checklist de démarrage — affichée sur l'accueil aux responsables tant que
 * l'officine n'est pas configurée (équipe → gabarit → planning). Disparaît
 * d'elle-même une fois les 3 étapes faites. Guide un titulaire qui vient de
 * créer son officine plutôt que de le laisser devant un tableau de bord vide.
 */
export function OnboardingChecklist({ state }: { state: OnboardingState }) {
  const steps = [
    {
      done: state.hasTeam,
      icon: Users,
      title: "Ajoutez votre équipe",
      desc: "Créez les fiches de vos collaborateurs (nom, statut, heures).",
      href: "/employes",
      cta: "Gérer l'équipe",
    },
    {
      done: state.hasTemplate,
      icon: LayoutTemplate,
      title: "Créez un gabarit de semaine",
      desc: "Un modèle S1/S2 réutilisable pour pré-remplir vos semaines.",
      href: "/gabarits",
      cta: "Créer un gabarit",
    },
    {
      done: state.hasPlanning,
      icon: CalendarRange,
      title: "Bâtissez le planning de la semaine",
      desc: "Appliquez un gabarit ou remplissez la grille, c'est parti !",
      href: "/planning",
      cta: "Ouvrir le planning",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null; // configuré → on n'affiche plus

  // 1re étape non faite = celle qu'on met en avant.
  const nextIdx = steps.findIndex((s) => !s.done);

  return (
    <section className="rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50/80 to-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-violet-900/50 dark:from-violet-950/20">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white">
          <Rocket className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold tracking-tight text-foreground">
            Bienvenue ! Configurez votre officine en 3 étapes
          </h2>
          <p className="text-[12px] text-muted-foreground">
            {doneCount}/{steps.length} fait · quelques minutes suffisent
          </p>
        </div>
        {/* Mini progression */}
        <div className="hidden items-center gap-1 sm:flex">
          {steps.map((s, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 w-6 rounded-full",
                s.done ? "bg-violet-600" : "bg-violet-200 dark:bg-violet-900/60"
              )}
            />
          ))}
        </div>
      </div>

      <ol className="space-y-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isNext = i === nextIdx;
          return (
            <li
              key={i}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                s.done
                  ? "border-border/50 bg-muted/20"
                  : isNext
                    ? "border-violet-300 bg-card dark:border-violet-800"
                    : "border-border/50 bg-card"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  s.done
                    ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : "bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300"
                )}
              >
                {s.done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-[13px] font-semibold leading-tight",
                    s.done ? "text-muted-foreground line-through" : "text-foreground"
                  )}
                >
                  {s.title}
                </p>
                {!s.done && (
                  <p className="mt-0.5 text-[12px] text-muted-foreground">{s.desc}</p>
                )}
              </div>
              {!s.done && (
                <Link
                  href={s.href}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                    isNext
                      ? "bg-violet-600 text-white hover:bg-violet-700"
                      : "border border-border bg-card text-foreground/80 hover:bg-muted/40"
                  )}
                >
                  {s.cta}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
