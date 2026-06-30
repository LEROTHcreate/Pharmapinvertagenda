import Link from "next/link";
import { ArrowRight, CalendarRange, LayoutTemplate, Users } from "lucide-react";

/**
 * État d'accueil affiché sur la page planning quand l'officine n'a encore
 * AUCUN collaborateur (typiquement juste après la création par le titulaire).
 * Évite la grille vide déroutante et guide vers les 3 premières étapes.
 *
 * Pour un admin : CTA vers la gestion d'équipe. Pour un non-admin (cas rare —
 * un employé sans collègues) : message neutre, sans bouton d'action.
 */
export function OnboardingEmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-border/60 bg-card/60 px-6 py-10 text-center sm:px-10 sm:py-12">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-600/25">
        <CalendarRange className="h-7 w-7" strokeWidth={2} />
      </div>
      <h2 className="mt-5 text-[20px] font-bold tracking-tight text-foreground">
        {isAdmin ? "Bienvenue dans votre officine 🎉" : "Aucun planning pour l'instant"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-muted-foreground">
        {isAdmin
          ? "Votre espace est prêt. Trois étapes pour démarrer votre premier planning."
          : "Votre administrateur n'a pas encore configuré l'équipe. Revenez bientôt."}
      </p>

      {isAdmin && (
        <>
          <ol className="mx-auto mt-7 max-w-sm space-y-3 text-left">
            <Step
              icon={<Users className="h-4 w-4" />}
              n={1}
              title="Ajoutez vos collaborateurs"
              desc="Pharmaciens, préparateurs, livreurs…"
              active
            />
            <Step
              icon={<LayoutTemplate className="h-4 w-4" />}
              n={2}
              title="Créez une semaine type"
              desc="Un gabarit S1/S2 réutilisable."
            />
            <Step
              icon={<CalendarRange className="h-4 w-4" />}
              n={3}
              title="Planifiez la semaine"
              desc="Appliquez le gabarit, ajustez au besoin."
            />
          </ol>

          <Link
            href="/employes"
            className="group mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 px-6 text-[14px] font-medium text-white shadow-lg shadow-violet-600/25 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-600/35"
          >
            Ajouter mon équipe
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </>
      )}
    </div>
  );
}

function Step({
  icon,
  n,
  title,
  desc,
  active = false,
}: {
  icon: React.ReactNode;
  n: number;
  title: string;
  desc: string;
  active?: boolean;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold " +
          (active
            ? "bg-violet-100 text-violet-700 ring-1 ring-violet-200"
            : "bg-muted text-muted-foreground")
        }
      >
        {n}
      </span>
      <div>
        <p className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </p>
        <p className="text-[12.5px] text-muted-foreground">{desc}</p>
      </div>
    </li>
  );
}
