"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PharmacyLogo } from "@/components/layout/PharmacyLogo";
import {
  Home,
  Calendar,
  Users,
  CalendarOff,
  BarChart3,
  Banknote,
  LogOut,
  UserCog,
  LayoutTemplate,
  Lightbulb,
  MessageCircle,
  Settings,
  StickyNote,
  ShieldCheck,
} from "lucide-react";
import { logoutAction } from "@/lib/auth-actions";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { UserRole } from "@prisma/client";
import { isAdminLevel, canEditPlanning } from "@/lib/permissions";

type NavKey =
  | "accueil"
  | "planning"
  | "infos"
  | "gabarits"
  | "employes"
  | "absences"
  | "messages"
  | "notes"
  | "stats"
  | "remuneration"
  | "gardes"
  | "utilisateurs"
  | "parametres";
type NavItem = {
  key: NavKey;
  href: string;
  label: string;
  icon: typeof Calendar;
  adminOnly?: boolean;
  /** Item admin que le MANAGEUR peut aussi voir (planning : gabarits, équipe). */
  manager?: boolean;
};

const NAV: NavItem[] = [
  { key: "accueil", href: "/accueil", label: "Accueil", icon: Home },
  { key: "planning", href: "/planning", label: "Planning", icon: Calendar },
  { key: "infos", href: "/infos", label: "Infos & conseils", icon: Lightbulb },
  { key: "gabarits", href: "/gabarits", label: "Gabarits", icon: LayoutTemplate, adminOnly: true, manager: true },
  { key: "employes", href: "/employes", label: "Équipe", icon: Users, adminOnly: true, manager: true },
  { key: "absences", href: "/absences", label: "Absences & dispos", icon: CalendarOff },
  { key: "messages", href: "/messages", label: "Messages", icon: MessageCircle },
  { key: "notes", href: "/notes", label: "Notes", icon: StickyNote },
  { key: "stats", href: "/stats", label: "Statistiques", icon: BarChart3, adminOnly: true },
  { key: "remuneration", href: "/remuneration", label: "Rémunération", icon: Banknote, adminOnly: true },
  { key: "gardes", href: "/gardes", label: "Gardes", icon: ShieldCheck, adminOnly: true },
  { key: "utilisateurs", href: "/utilisateurs", label: "Utilisateurs", icon: UserCog, adminOnly: true },
  // Paramètres : visible par TOUS (lecture) ; édition gatée dans la page
  // (canEditSettings) + serveur. Bloc paie masqué aux non-autorisés. Cf. CLAUDE.md.
  { key: "parametres", href: "/parametres", label: "Paramètres", icon: Settings },
];

export function Sidebar({
  pharmacyName,
  pharmacyLogoUrl,
  userName,
  userRole,
  pendingUsersCount = 0,
  pendingSwapsCount = 0,
  pendingAbsencesCount = 0,
  unreadSwapMessages = 0,
  unreadTextMessages = 0,
  canViewPayroll = false,
}: {
  pharmacyName: string;
  pharmacyLogoUrl?: string | null;
  userName: string;
  userRole: UserRole;
  pendingUsersCount?: number;
  pendingSwapsCount?: number;
  pendingAbsencesCount?: number;
  /** Messages SWAP_REQUEST non lus reçus par l'utilisateur (badge rouge). */
  unreadSwapMessages?: number;
  /** Messages TEXT non lus reçus par l'utilisateur (badge bleu). */
  unreadTextMessages?: number;
  /** Affiche l'item "Rémunération" (super-admin OU admin titulaire autorisé). */
  canViewPayroll?: boolean;
}) {
  const pathname = usePathname();
  const isAdmin = isAdminLevel(userRole);
  // MANAGEUR : accès aux items de construction du planning (gabarits, équipe).
  const isManager = canEditPlanning(userRole);

  // Pour le badge Messages : on combine côté admin la file
  // « swaps en attente de validation admin » avec les SWAP_REQUEST non lus
  // (max pour éviter de double-compter), puis on retient le bleu pour les
  // messages classiques non lus.
  const swapBadge = isAdmin
    ? Math.max(pendingSwapsCount, unreadSwapMessages)
    : unreadSwapMessages;
  const textBadge = unreadTextMessages;

  return (
    <div className="hidden md:block group/sb">
      {/* Bande de survol (toujours visible, fine) — révèle la barre au passage
          de la souris. Se fond quand la barre s'ouvre. */}
      <div
        aria-hidden
        className="fixed left-0 top-0 z-30 flex h-screen w-3 items-center justify-center transition-opacity duration-200 group-hover/sb:opacity-0"
      >
        <span className="h-12 w-1 rounded-full bg-muted-foreground/25" />
      </div>

      {/* Barre latérale — masquée hors écran par défaut, glisse à l'apparition
          au survol (group-hover) ou au focus clavier (group-focus-within). Le
          contenu principal occupe donc toute la largeur quand elle est repliée. */}
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col overflow-y-auto border-r bg-card shadow-xl -translate-x-full transition-transform duration-200 ease-out group-hover/sb:translate-x-0 group-focus-within/sb:translate-x-0">
      <div className="flex items-center gap-3 px-5 py-5 border-b">
        <PharmacyLogo
          logoUrl={pharmacyLogoUrl}
          size={40}
          className="shrink-0"
          alt={`Logo ${pharmacyName}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-none truncate">
            {pharmacyName}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-1">
            PharmaPlanning
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <ThemeToggle />
          <NotificationBell />
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV.filter((n) => {
          // Rémunération : visible UNIQUEMENT si l'utilisateur a explicitement
          // canViewPayroll=true (super-admin OU admin titulaire autorisé).
          if (n.key === "remuneration") return canViewPayroll;
          return !n.adminOnly || isAdmin || (n.manager === true && isManager);
        }).map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          // Pour Messages : priorité au badge rouge (créneaux) sur le bleu (texte)
          // si les deux sont présents.
          const messagesBadgeCount =
            swapBadge > 0 ? swapBadge : textBadge;
          const badgeCount =
            item.key === "utilisateurs"
              ? pendingUsersCount
              : item.key === "messages"
                ? messagesBadgeCount
                : item.key === "absences" && isAdmin
                  ? pendingAbsencesCount
                  : 0;
          const showBadge = badgeCount > 0;
          // Tonalité du badge : rouge pour les demandes d'absence (urgent),
          // rouge pour les SWAP_REQUEST non lus, bleu pour les messages
          // classiques, violet pour les demandes d'inscription utilisateur.
          const badgeTone =
            item.key === "absences"
              ? "bg-red-500"
              : item.key === "messages"
                ? swapBadge > 0
                  ? "bg-red-500"
                  : "bg-blue-500"
                : "bg-violet-600";
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span
                  aria-label={`${badgeCount} en attente`}
                  className={cn(
                    "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold text-white",
                    badgeTone
                  )}
                >
                  {badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <Separator />

      <div className="p-3 space-y-3">
        <Link
          href="/profil"
          className={cn(
            "block rounded-md px-3 py-2 transition-colors",
            pathname.startsWith("/profil")
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50"
          )}
          title="Voir mon profil et changer mon mot de passe"
        >
          <p className="text-sm font-medium truncate">{userName}</p>
          <p className="text-xs text-muted-foreground">
            {isAdmin ? "Programmeur" : "Personnel"}
          </p>
        </Link>
        <form action={logoutAction}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </Button>
        </form>
      </div>
    </aside>
    </div>
  );
}
