"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  Users,
  CalendarOff,
  BarChart3,
  Menu,
  LogOut,
  UserCog,
  LayoutTemplate,
  MessageCircle,
} from "lucide-react";
import { logoutAction } from "@/lib/auth-actions";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UserRole } from "@prisma/client";

type NavKey =
  | "planning"
  | "gabarits"
  | "employes"
  | "absences"
  | "messages"
  | "stats"
  | "utilisateurs";
type NavItem = {
  key: NavKey;
  href: string;
  label: string;
  icon: typeof Calendar;
  adminOnly?: boolean;
};

const NAV: NavItem[] = [
  { key: "planning", href: "/planning", label: "Planning", icon: Calendar },
  { key: "gabarits", href: "/gabarits", label: "Gabarits", icon: LayoutTemplate, adminOnly: true },
  { key: "employes", href: "/employes", label: "Équipe", icon: Users, adminOnly: true },
  { key: "absences", href: "/absences", label: "Absences", icon: CalendarOff },
  { key: "messages", href: "/messages", label: "Messages", icon: MessageCircle },
  { key: "stats", href: "/stats", label: "Statistiques", icon: BarChart3, adminOnly: true },
  { key: "utilisateurs", href: "/utilisateurs", label: "Utilisateurs", icon: UserCog, adminOnly: true },
];

export function MobileNav({
  pharmacyName,
  userName,
  userRole,
  pendingUsersCount = 0,
  pendingSwapsCount = 0,
  pendingAbsencesCount = 0,
  unreadSwapMessages = 0,
  unreadTextMessages = 0,
}: {
  pharmacyName: string;
  userName: string;
  userRole: UserRole;
  pendingUsersCount?: number;
  pendingSwapsCount?: number;
  pendingAbsencesCount?: number;
  unreadSwapMessages?: number;
  unreadTextMessages?: number;
}) {
  const pathname = usePathname();
  const isAdmin = userRole === "ADMIN";
  const swapBadge = isAdmin
    ? Math.max(pendingSwapsCount, unreadSwapMessages)
    : unreadSwapMessages;
  const textBadge = unreadTextMessages;

  return (
    <header className="md:hidden border-b bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm font-semibold leading-none">PharmaPlanning</p>
          <p className="text-xs text-muted-foreground mt-0.5">{pharmacyName}</p>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <nav className="mt-6 space-y-1">
              {NAV.filter((n) => !n.adminOnly || isAdmin).map((item) => {
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
      </div>
    </header>
  );
}
