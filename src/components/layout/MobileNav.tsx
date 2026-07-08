"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  Users,
  CalendarOff,
  BarChart3,
  Banknote,
  Menu,
  LogOut,
  UserCog,
  LayoutTemplate,
  Lightbulb,
  MessageCircle,
  Settings,
  StickyNote,
  ShieldCheck,
  ClipboardList,
} from "lucide-react";
import { logoutAction } from "@/lib/auth-actions";
import { PharmacyLogo } from "@/components/layout/PharmacyLogo";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { cn } from "@/lib/utils";
import type { UserRole } from "@prisma/client";
import { isAdminLevel, canEditPlanning } from "@/lib/permissions";

type NavKey =
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
  | "creneaux"
  | "parametres";
type NavItem = {
  key: NavKey;
  href: string;
  label: string;
  icon: typeof Calendar;
  adminOnly?: boolean;
  /** Item admin que le MANAGEUR peut aussi voir (gabarits, équipe). */
  manager?: boolean;
};

const NAV: NavItem[] = [
  { key: "planning", href: "/planning", label: "Planning", icon: Calendar },
  { key: "infos", href: "/infos", label: "Infos & conseils", icon: Lightbulb },
  { key: "gabarits", href: "/gabarits", label: "Gabarits", icon: LayoutTemplate, adminOnly: true, manager: true },
  // Équipe : visible par TOUS (lecture) ; édition réservée aux titulaires.
  { key: "employes", href: "/employes", label: "Équipe", icon: Users },
  { key: "absences", href: "/absences", label: "Absences & dispos", icon: CalendarOff },
  { key: "creneaux", href: "/creneaux", label: "Créneaux à couvrir", icon: ClipboardList },
  { key: "messages", href: "/messages", label: "Messages", icon: MessageCircle },
  { key: "notes", href: "/notes", label: "Notes", icon: StickyNote },
  { key: "stats", href: "/stats", label: "Statistiques", icon: BarChart3, adminOnly: true },
  { key: "remuneration", href: "/remuneration", label: "Rémunération", icon: Banknote, adminOnly: true },
  { key: "gardes", href: "/gardes", label: "Gardes", icon: ShieldCheck, adminOnly: true },
  { key: "utilisateurs", href: "/utilisateurs", label: "Utilisateurs", icon: UserCog, adminOnly: true },
  // Paramètres : visible par TOUS (lecture) ; édition gatée dans la page. Cf. CLAUDE.md.
  { key: "parametres", href: "/parametres", label: "Paramètres", icon: Settings },
];

export function MobileNav({
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
  unreadSwapMessages?: number;
  unreadTextMessages?: number;
  canViewPayroll?: boolean;
}) {
  const pathname = usePathname();
  const isAdmin = isAdminLevel(userRole);
  const isManager = canEditPlanning(userRole);
  const swapBadge = isAdmin
    ? Math.max(pendingSwapsCount, unreadSwapMessages)
    : unreadSwapMessages;
  const textBadge = unreadTextMessages;

  return (
    <header className="md:hidden border-b bg-card">
      <div className="flex items-center gap-2 px-4 py-3">
        {/* Menu hamburger à gauche (pattern mobile classique iOS/Android).
            Le panneau Sheet s'ouvre depuis la GAUCHE pour matcher la position
            du bouton — moins de surprise visuelle. */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <nav className="mt-6 space-y-1">
              {NAV.filter((n) => {
                if (n.key === "remuneration") return canViewPayroll;
                return !n.adminOnly || isAdmin || (n.manager === true && isManager);
              }).map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
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
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                    {showBadge && (
                      <span
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
            <div className="absolute bottom-6 left-6 right-6 space-y-3">
              <p className="text-sm font-medium">{userName}</p>
              <form action={logoutAction}>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <LogOut className="h-4 w-4" />
                  Déconnexion
                </Button>
              </form>
            </div>
          </SheetContent>
        </Sheet>

        {/* Titre + logo officine — prend toute la largeur dispo */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <PharmacyLogo
            logoUrl={pharmacyLogoUrl}
            size={28}
            className="shrink-0"
            alt={`Logo ${pharmacyName}`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-none truncate">
              {pharmacyName}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              PharmaPlanning
            </p>
          </div>
        </div>

        {/* Actions secondaires (notifs, dark mode) restent à droite */}
        <div className="flex items-center gap-0.5 shrink-0">
          <ThemeToggle />
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
