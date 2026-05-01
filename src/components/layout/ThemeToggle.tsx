"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, Monitor } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Bouton bascule clair / sombre / système.
 *
 * - Pendant l'hydratation (avant que `next-themes` ait lu le storage), on
 *   affiche un placeholder pour éviter un flash visuel et un mismatch SSR.
 * - On ajoute la classe `theme-transition` sur <html> pendant 300 ms à chaque
 *   changement, pour que le CSS pilote une transition douce des couleurs.
 */
export function ThemeToggle({
  variant = "icon",
}: {
  /** "icon" : bouton circulaire dans header. "label" : avec libellé pour menus. */
  variant?: "icon" | "label";
}) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  function applyTheme(next: "light" | "dark" | "system") {
    // Active la transition CSS douce le temps que les variables changent
    if (typeof document !== "undefined") {
      document.documentElement.classList.add("theme-transition");
      window.setTimeout(() => {
        document.documentElement.classList.remove("theme-transition");
      }, 320);
    }
    setTheme(next);
  }

  // Placeholder pendant l'hydratation : icône neutre, même footprint
  if (!mounted) {
    return (
      <button
        aria-label="Changer le thème"
        disabled
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-400",
          variant === "label" && "h-auto w-auto px-3 py-2"
        )}
      >
        <Sun className="h-4 w-4" />
      </button>
    );
  }

  const current = resolvedTheme === "dark" ? "dark" : "light";
  const Icon = current === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <button
            aria-label={`Thème actuel : ${current === "dark" ? "sombre" : "clair"}`}
            className={cn(
              "relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors",
              "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
              "dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        ) : (
          <button
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="flex-1 text-left">Thème</span>
            <span className="text-[11px] text-muted-foreground/70">
              {theme === "system"
                ? "Auto"
                : theme === "dark"
                  ? "Sombre"
                  : "Clair"}
            </span>
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={() => applyTheme("light")}
          className={cn(
            "cursor-pointer",
            theme === "light" && "bg-accent text-accent-foreground"
          )}
        >
          <Sun className="mr-2 h-4 w-4" />
          Clair
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => applyTheme("dark")}
          className={cn(
            "cursor-pointer",
            theme === "dark" && "bg-accent text-accent-foreground"
          )}
        >
          <Moon className="mr-2 h-4 w-4" />
          Sombre
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => applyTheme("system")}
          className={cn(
            "cursor-pointer",
            theme === "system" && "bg-accent text-accent-foreground"
          )}
        >
          <Monitor className="mr-2 h-4 w-4" />
          Système
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
