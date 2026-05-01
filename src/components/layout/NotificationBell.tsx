"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarOff,
  Check,
  RefreshCcw,
  Repeat,
  UserPlus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  kind:
    | "absence-pending"
    | "absence-decided"
    | "swap-pending"
    | "user-pending";
  title: string;
  description: string;
  href: string;
  createdAt: string;
  unread: boolean;
};

const SEEN_KEY = "ph_notif_last_seen_at";

/**
 * Cloche de notifications dans le header.
 *
 * Tick d'inbox : on garde un timestamp dans localStorage (`ph_notif_last_seen_at`).
 *  - Un événement avec `createdAt > seen` est considéré non lu.
 *  - L'ouverture du popover marque tous les événements comme vus.
 *  - Refetch toutes les 60 s + au focus de la fenêtre.
 */
export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastSeen, setLastSeen] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const v = window.localStorage.getItem(SEEN_KEY);
    return v ? Number(v) : 0;
  });
  const fetchTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchNotifications() {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: NotificationItem[] };
      setItems(data.items ?? []);
    } catch {
      // ignoré : la cloche reste sur le dernier état connu
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchNotifications();
    fetchTimer.current = setInterval(fetchNotifications, 60_000);
    function onFocus() {
      fetchNotifications();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      if (fetchTimer.current) clearInterval(fetchTimer.current);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Quand le popover s'ouvre → on considère les notifs comme vues
  useEffect(() => {
    if (open && items.length > 0) {
      const now = Date.now();
      window.localStorage.setItem(SEEN_KEY, String(now));
      setLastSeen(now);
    }
  }, [open, items.length]);

  const unreadCount = items.filter(
    (i) => new Date(i.createdAt).getTime() > lastSeen
  ).length;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} non lues)` : ""}`}
          className={cn(
            "relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors",
            "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
            "dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          )}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute right-1 top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-violet-600 px-1 text-[9px] font-bold text-white ring-2 ring-white dark:ring-zinc-900",
                unreadCount > 99 && "min-w-[20px]"
              )}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[360px] p-0 max-h-[480px] overflow-hidden"
      >
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 px-4 py-2.5">
          <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">Notifications</p>
          <button
            onClick={fetchNotifications}
            disabled={loading}
            aria-label="Rafraîchir"
            className="rounded-full p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 disabled:opacity-60"
          >
            <RefreshCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>

        {/* Liste */}
        <div className="overflow-y-auto max-h-[420px]">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <Check className="h-5 w-5" />
              </div>
              <p className="mt-3 text-[13px] font-medium text-zinc-700 dark:text-zinc-200">
                Tout est à jour
              </p>
              <p className="mt-1 text-[11.5px] text-zinc-500 dark:text-zinc-400">
                Aucune nouvelle notification.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {items.map((item) => {
                const isUnread =
                  new Date(item.createdAt).getTime() > lastSeen;
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
                        isUnread && "bg-violet-50/40 dark:bg-violet-950/30"
                      )}
                    >
                      <NotifIcon kind={item.kind} />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-[13px] leading-tight",
                            isUnread
                              ? "font-semibold text-zinc-900 dark:text-zinc-100"
                              : "font-medium text-zinc-700 dark:text-zinc-300"
                          )}
                        >
                          {item.title}
                        </p>
                        <p className="mt-0.5 truncate text-[11.5px] text-zinc-500 dark:text-zinc-400">
                          {item.description}
                        </p>
                        <p className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                          {formatRelative(item.createdAt)}
                        </p>
                      </div>
                      {isUnread && (
                        <span
                          aria-hidden
                          className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── Icônes par type d'événement ──────────────────────────────────── */

function NotifIcon({ kind }: { kind: NotificationItem["kind"] }) {
  const map = {
    "absence-pending": {
      icon: CalendarOff,
      bg: "bg-amber-50 dark:bg-amber-950/40",
      fg: "text-amber-700 dark:text-amber-400",
    },
    "absence-decided": {
      icon: CalendarOff,
      bg: "bg-emerald-50 dark:bg-emerald-950/40",
      fg: "text-emerald-700 dark:text-emerald-400",
    },
    "swap-pending": {
      icon: Repeat,
      bg: "bg-blue-50 dark:bg-blue-950/40",
      fg: "text-blue-700 dark:text-blue-400",
    },
    "user-pending": {
      icon: UserPlus,
      bg: "bg-violet-50 dark:bg-violet-950/40",
      fg: "text-violet-700 dark:text-violet-400",
    },
  };
  const { icon: Icon, bg, fg } = map[kind];
  return (
    <div
      className={cn(
        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        bg,
        fg
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}

/* ─── Formatage relatif léger ──────────────────────────────────────── */

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 7 * 86400) return `il y a ${Math.floor(diff / 86400)} j`;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}
