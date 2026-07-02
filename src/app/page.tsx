import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import {
  Calendar,
  Users,
  CalendarOff,
  MessageCircle,
  AlarmClock,
  Smartphone,
  ArrowRight,
  Check,
  Zap,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { auth } from "@/auth";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { SavBubble } from "@/components/landing/SavBubble";

export const metadata = {
  title: "PharmaPlanning · Le planning intelligent pour votre officine",
  description:
    "Le planning d'équipe pensé pour les pharmaciens, pas pour les comptables. Glissez-déposez les postes, validez les absences, suivez les heures sup — depuis n'importe quel appareil.",
};

/**
 * Page d'accueil publique — landing page produit.
 *
 * - Visiteur non connecté → présentation + CTA vers /login + /signup
 * - Visiteur connecté → redirect vers l'app :
 *     · téléphone      → /accueil (home tactile + barre d'onglets du bas)
 *     · desktop/tablette → /planning (la grille, avec la sidebar complète)
 *   L'accueil "mobile" faisait doublon avec la sidebar sur grand écran.
 *
 * Le design réutilise le style du layout auth (gradient + blobs + grain)
 * pour une continuité visuelle quand l'utilisateur clique "Se connecter".
 */
export default async function LandingPage() {
  const session = await auth();
  if (session?.user) {
    // Détection téléphone via User-Agent (côté serveur, pas de matchMedia).
    // Les tablettes (iPad, tablette Android) → desktop : la grille y est
    // confortable et tactile-friendly.
    const ua = headers().get("user-agent") ?? "";
    const isPhone =
      /iPhone|iPod|Android.*Mobile|Mobi|IEMobile|BlackBerry|Opera Mini/i.test(ua);
    redirect(isPhone ? "/accueil" : "/planning");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fafaff] text-foreground">
      {/* ─── Couches de fond — même esprit que /login ───────────────── */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-violet-50"
      />
      <div aria-hidden className="blob-stage absolute inset-0 overflow-hidden">
        <div className="animate-blob absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full bg-gradient-to-br from-violet-400/40 to-indigo-500/40 blur-2xl" />
        <div className="animate-blob-slow absolute top-1/3 -right-40 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-fuchsia-300/35 to-violet-400/35 blur-2xl" />
        <div className="animate-blob absolute -bottom-40 left-1/4 h-[480px] w-[480px] rounded-full bg-gradient-to-br from-sky-300/30 to-indigo-300/30 blur-2xl" />
      </div>
      <div aria-hidden className="grain absolute inset-0 pointer-events-none" />

      {/* ─── En-tête : logo + nav minimal ──────────────────────────── */}
      <header className="relative z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6 sm:py-7">
          <div className="flex items-center gap-2.5">
            <BrandLogo size={36} />
            <span className="text-[16px] font-semibold tracking-tight">
              PharmaPlanning
            </span>
          </div>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="text-[13.5px] font-medium text-foreground/85 hover:text-foreground transition-colors px-3 py-2"
            >
              Se connecter
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 hover:bg-violet-700 text-white text-[13.5px] font-medium px-4 py-2 shadow-[0_4px_12px_-2px_rgba(124,58,237,0.4)] transition-all"
            >
              Créer un compte
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </nav>
        </div>
      </header>

      {/* ─── Hero ──────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-5xl px-4 pt-10 pb-12 text-center sm:px-6 sm:pt-16 sm:pb-16">
        <div className="animate-fade-up inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur-md ring-1 ring-violet-200/60 px-3 py-1 text-[11.5px] font-medium text-violet-700">
          <Sparkles className="h-3 w-3" />
          Conçu en France pour les officines françaises
        </div>

        <h1 className="animate-fade-up delay-75 mt-6 text-[34px] sm:text-[54px] md:text-[64px] font-semibold tracking-[-0.025em] leading-[1.04]">
          Le planning d&apos;équipe qui{" "}
          <span className="bg-gradient-to-br from-violet-600 via-fuchsia-500 to-indigo-600 bg-clip-text text-transparent">
            rend Excel obsolète
          </span>
          .
        </h1>

        <p className="animate-fade-up delay-150 mx-auto mt-5 max-w-2xl text-[15px] sm:text-[18px] text-foreground/70 leading-relaxed">
          Glissez-déposez les postes, validez les absences en deux taps, suivez
          les heures sup en temps réel. Votre équipe consulte son planning
          depuis son téléphone, vous reprenez le contrôle de votre semaine.
        </p>

        <div className="animate-fade-up delay-225 mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/signup"
            className="group inline-flex items-center gap-2 rounded-full bg-violet-600 hover:bg-violet-700 text-white text-[15px] font-medium px-7 py-3.5 shadow-[0_8px_24px_-4px_rgba(124,58,237,0.45)] transition-all hover:scale-[1.02]"
          >
            Démarrer gratuitement
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-white/80 backdrop-blur-md text-foreground text-[15px] font-medium px-7 py-3.5 ring-1 ring-zinc-200 hover:bg-white transition-all"
          >
            J&apos;ai déjà un compte
          </Link>
        </div>

        <p className="animate-fade-up delay-300 mt-6 text-[12px] text-muted-foreground/80">
          Aucune carte bancaire requise · Mise en route en 10 minutes · Vos
          données restent en Europe
        </p>

        {/* ─── Mini stats / proof points ────────────────────────────── */}
        <div className="animate-fade-up delay-450 mt-12 grid grid-cols-3 gap-4 sm:gap-6 max-w-2xl mx-auto">
          <ProofPoint
            icon={Zap}
            metric="10×"
            label="plus rapide qu&apos;Excel"
          />
          <ProofPoint
            icon={Smartphone}
            metric="100 %"
            label="mobile & tablette"
          />
          <ProofPoint
            icon={ShieldCheck}
            metric="RGPD"
            label="hébergement européen"
          />
        </div>
      </section>

      {/* ─── Features grid ─────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pt-4 pb-16 sm:px-6 sm:pb-24">
        <div className="text-center mb-10 sm:mb-14">
          <h2 className="text-[26px] sm:text-[36px] font-semibold tracking-tight">
            Tout ce qu&apos;il vous faut. Rien de superflu.
          </h2>
          <p className="mt-3 text-[14px] sm:text-[15px] text-foreground/70 max-w-xl mx-auto">
            Pensé avec des titulaires, codé pour leur quotidien — pas pour
            cocher des cases sur une plaquette commerciale.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          <FeatureCard
            icon={Calendar}
            iconClass="text-violet-600 bg-violet-100"
            title="Planning visuel"
            description="Grille hebdomadaire intuitive, glissez-déposez les postes, créez vos gabarits réutilisables et appliquez-les en un clic. Alertes automatiques quand le comptoir est sous-effectif."
          />
          <FeatureCard
            icon={CalendarOff}
            iconClass="text-amber-600 bg-amber-100"
            title="Absences &amp; congés"
            description="Vos collaborateurs déposent leurs demandes depuis leur téléphone, vous validez en deux taps. Les créneaux concernés deviennent automatiquement des absences sur le planning."
          />
          <FeatureCard
            icon={AlarmClock}
            iconClass="text-emerald-600 bg-emerald-100"
            title="Heures sup &amp; soldes"
            description="Détection automatique des dépassements, solde HS / absences calculé en temps réel sur la période de votre choix. Plus de surprise en fin de semestre."
          />
          <FeatureCard
            icon={MessageCircle}
            iconClass="text-blue-600 bg-blue-100"
            title="Messagerie intégrée"
            description="Toute l&apos;équipe communique sans WhatsApp ni SMS perso. Conversations 1-1 ou groupes, échanges de postes, pièces jointes — le contexte planning toujours sous la main."
          />
          <FeatureCard
            icon={Users}
            iconClass="text-fuchsia-600 bg-fuchsia-100"
            title="Tous les rôles couverts"
            description="Pharmaciens, préparateurs, étudiants, livreurs, back-office, secrétaires, titulaires : chaque statut a ses postes autorisés, ses couleurs, ses règles. Zéro affectation incohérente."
          />
          <FeatureCard
            icon={Smartphone}
            iconClass="text-rose-600 bg-rose-100"
            title="Partout, tout le temps"
            description="App installable sur l&apos;écran d&apos;accueil iPhone et iPad. Vue mobile pensée pour le pouce, grille pleine sur PC, dark mode partout. Le tactile fonctionne aussi bien que la souris."
          />
        </div>
      </section>

      {/* ─── Comment ça marche ─────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-5xl px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="text-center mb-10">
          <h2 className="text-[26px] sm:text-[36px] font-semibold tracking-tight">
            Opérationnel en moins de 10 minutes
          </h2>
          <p className="mt-3 text-[14px] sm:text-[15px] text-foreground/70">
            Pas de migration douloureuse. Pas de formation à l&apos;équipe.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Step
            number="01"
            title="Créez votre officine"
            description="Renseignez le nom de votre pharmacie, votre email — c'est tout. Aucun moyen de paiement demandé pour la phase pilote."
          />
          <Step
            number="02"
            title="Ajoutez votre équipe"
            description="Saisissez vos collaborateurs et leurs heures contractuelles. Ou laissez-les s'inscrire eux-mêmes, vous validez leur compte en un tap."
          />
          <Step
            number="03"
            title="Construisez vos semaines types"
            description="Posez votre rythme habituel une fois (S1, S2, ou n'importe quel autre rythme), puis dupliquez sur tout le semestre."
          />
        </div>
      </section>

      {/* ─── Pour qui ──────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-4xl px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="rounded-3xl bg-white/70 backdrop-blur-xl ring-1 ring-zinc-200/70 px-6 py-10 sm:px-10 sm:py-14 shadow-[0_24px_60px_-20px_rgba(76,29,149,0.18)]">
          <h2 className="text-[24px] sm:text-[32px] font-semibold tracking-tight text-center">
            Pour toutes les officines, sans exception
          </h2>
          <p className="mt-3 text-center text-[14px] sm:text-[15px] text-foreground/70 max-w-xl mx-auto">
            De 2 à 30 collaborateurs, horaires modulables, semaines types
            personnalisées — PharmaPlanning s&apos;adapte à votre fonctionnement,
            pas l&apos;inverse.
          </p>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {[
              "Tous les statuts : pharmaciens, préparateurs, étudiants, livreurs, back-office, secrétaires, titulaires",
              "Compatibilité tactile complète : iPad, tablette Android, iPhone",
              "Validation des absences en deux étapes : collaborateur → admin",
              "Export Excel pour la paie, impression A4 pour l'affichage en pause",
              "Statistiques par collaborateur sur la période de votre choix",
              "Sauvegarde quotidienne, hébergement français, support inclus",
            ].map((point) => (
              <div
                key={point}
                className="flex items-start gap-2.5 text-[13.5px] text-foreground/85 leading-relaxed"
              >
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-violet-600" />
                <span>{point}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA finale ────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-3xl px-4 pb-16 sm:px-6 sm:pb-24 text-center">
        <h2 className="text-[26px] sm:text-[36px] font-semibold tracking-tight">
          Reprenez votre dimanche soir.
        </h2>
        <p className="mt-3 text-[14px] sm:text-[16px] text-foreground/70 max-w-md mx-auto">
          Créez votre compte en moins de 2 minutes. Gratuit pendant la phase
          pilote, vos données restent les vôtres.
        </p>
        <Link
          href="/signup"
          className="group inline-flex items-center gap-2 mt-8 rounded-full bg-violet-600 hover:bg-violet-700 text-white text-[15px] font-medium px-8 py-3.5 shadow-[0_8px_24px_-4px_rgba(124,58,237,0.45)] transition-all hover:scale-[1.02]"
        >
          Démarrer maintenant
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </section>

      {/* ─── Footer ────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-zinc-200/60 bg-white/30 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <BrandLogo size={28} className="opacity-80" />
            <p className="text-[12px] text-muted-foreground">
              © {new Date().getFullYear()} PharmaPlanning · Conçu pour les
              officines françaises
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">
              Connexion
            </Link>
            <Link href="/signup" className="hover:text-foreground transition-colors">
              Inscription
            </Link>
            <Link
              href="/mentions-legales"
              className="hover:text-foreground transition-colors"
            >
              Mentions légales
            </Link>
            <Link
              href="/cgu"
              className="hover:text-foreground transition-colors"
            >
              CGU
            </Link>
            <Link
              href="/confidentialite"
              className="hover:text-foreground transition-colors"
            >
              Confidentialité
            </Link>
          </div>
        </div>
      </footer>

      {/* Bulle SAV flottante (client) — bouton d'aide en bas à droite */}
      <SavBubble />
    </div>
  );
}

/* ─── Sous-composant : card feature ──────────────────────────────── */

function FeatureCard({
  icon: Icon,
  iconClass,
  title,
  description,
}: {
  icon: typeof Calendar;
  iconClass: string;
  title: string;
  description: string;
}) {
  return (
    <article className="group rounded-2xl bg-white/75 backdrop-blur-xl ring-1 ring-zinc-200/60 px-5 py-6 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_32px_-8px_rgba(124,58,237,0.18)] hover:ring-violet-200/80 transition-all duration-300">
      <div
        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconClass} group-hover:scale-110 transition-transform`}
      >
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <h3 className="mt-4 text-[15.5px] font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      <p className="mt-2 text-[13px] text-foreground/70 leading-relaxed">
        {description}
      </p>
    </article>
  );
}

/* ─── Sous-composant : proof point chiffré ───────────────────────── */

function ProofPoint({
  icon: Icon,
  metric,
  label,
}: {
  icon: typeof Calendar;
  metric: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <Icon className="h-4 w-4 text-violet-500/80" strokeWidth={2} />
      <p className="text-[20px] sm:text-[26px] font-semibold tracking-tight bg-gradient-to-br from-violet-600 to-indigo-600 bg-clip-text text-transparent leading-none">
        {metric}
      </p>
      <p
        className="text-[11px] sm:text-[12px] text-foreground/65 leading-tight text-center"
        dangerouslySetInnerHTML={{ __html: label }}
      />
    </div>
  );
}

/* ─── Sous-composant : étape de la timeline "Comment ça marche" ─── */

function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl bg-white/65 backdrop-blur-xl ring-1 ring-zinc-200/60 px-6 py-7 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.04)] relative">
      <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-violet-500/80">
        {number}
      </span>
      <h3 className="mt-2 text-[16px] font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      <p className="mt-2 text-[13px] text-foreground/70 leading-relaxed">
        {description}
      </p>
    </div>
  );
}
