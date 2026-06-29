"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Calendar,
  CalendarOff,
  MessageCircle,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@prisma/client";

/**
 * Barre de navigation principale en bas d'écran sur mobile.
 *
 * Pattern iOS/Android natif : 5 onglets persistants accessibles au pouce
 * (zone confortable du bas de l'écran), badge de notification par onglet,
 * `safe-area-inset-bottom` respecté pour les iPhones avec home bar.
 *
 * Principes de choix des 5 tabs :
 *  - Accueil  : tableau de bord mobile (ma journée, équipe, accès rapides)
 *  - Planning : la raison d'être de l'app
 *  - Absences : action quotidienne (poser un congé, valider)
 *  - Messages : communication équipe
 *  - Profil   : avatar, mot de passe, mes heures — accès rapide
 *
 * Notes (régul paie) + pages secondaires (Gabarits, Équipe, Stats,
 * Rémunération, Utilisateurs, Paramètres) restent accessibles via le burger
 * en haut à gauche et/ou la page Accueil — pour garder une nav réduite à 5.
 */

type TabKey = "accueil" | "planning" | "absences" | "messages" | "profil";
type TabItem = {
  key: TabKey;
  href: string;
  label: string;
  icon: typeof Calendar;
};

const TABS: TabItem[] = [
  { key: "accueil", href: "/accueil", label: "Accueil", icon: Home },
  { key: "planning", href: "/planning", label: "Planning", icon: Calendar },
  { key: "absences", href: "/absences", label: "Absences", icon: CalendarOff },
  { key: "messages", href: "/messages", label: "Messages", icon: MessageCircle },
  { key: "profil", href: "/profil", label: "Profil", icon: User },
];

export function MobileTabBar({
  userRole,
  pendingAbsencesCount = 0,
  unreadSwapMessages = 0,
  unreadTextMessages = 0,
  pendingSwapsCount = 0,
}: {
  userRole: UserRole;
  pendingAbsencesCount?: number;
  unreadSwapMessages?: number;
  unreadTextMessages?: number;
  pendingSwapsCount?: number;
}) {
  const pathname = usePathname();
  const isAdmin = userRole === "ADMIN";

  // Badge messages : même logique que la sidebar — priorité au rouge (swap)
  // sur le bleu (texte) si les deux sont présents.
  const swapBadge = isAdmin
    ? Math.max(pendingSwapsCount, unreadSwapMessages)
    : unreadSwapMessages;
  const messagesBadge = swapBadge > 0 ? swapBadge : unreadTextMessages;

  return (
    <nav
      aria-label="Navigation principale"
      className={cn(
        "no-print md:hidden fixed bottom-0 left-0 right-0 z-40",
        "bg-card/95 backdrop-blur-xl border-t border-border",
        // Padding bottom = safe-area iOS (home bar). Sur Android et iPhones
        // sans notch ça vaut 0, donc pas de surcoût.
        "pb-[env(safe-area-inset-bottom,0px)]"
      )}
    >
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          const Icon = tab.icon;
          // Tonalité du badge :
          //   - Absences (admin uniquement) : rouge — urgent à valider
          //   - Messages : rouge si swap pending, sinon bleu
          //   - Autres : pas de badge pour l'instant
          const badgeCount =
            tab.key === "absences" && isAdmin
              ? pendingAbsencesCount
              : tab.key === "messages"
                ? messagesBadge
                : 0;
          const showBadge = badgeCount > 0;
          const badgeTone =
            tab.key === "messages" && swapBadge === 0
              ? "bg-blue-500"
              : "bg-red-500";

          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5",
                  "min-h-[56px] py-1.5 transition-colors",
                  // Indicateur actif : barre violette en haut + texte/icône
                  // colorés. Style proche de iOS/Material You.
                  active
                    ? "text-violet-600 dark:text-violet-400"
                    : "text-muted-foreground/80 hover:text-foreground active:text-foreground"
                )}
              >
                {/* Petite barre haut quand actif — signal visuel discret */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-violet-500"
                  />
                )}
                <div className="relative">
                  <Icon
                    className={cn(
                      "h-[22px] w-[22px] transition-transform",
                      active && "scale-105"
                    )}
                    strokeWidth={active ? 2.2 : 1.6}
                  />
                  {showBadge && (
                    <span
                      aria-label={`${badgeCount} en attente`}
                      className={cn(
                        "absolute -top-1 -right-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white ring-2 ring-card",
                        badgeTone
                      )}
                    >
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10.5px] tracking-tight",
                    active ? "font-semibold" : "font-medium"
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
