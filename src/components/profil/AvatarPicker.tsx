"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { AVATARS, type AvatarId } from "@/lib/avatars";
import { AvatarImage } from "@/components/layout/AvatarImage";
import { cn } from "@/lib/utils";

/**
 * Sélecteur d'avatar dans /profil.
 *
 * Affichage : grille 3×3 des 9 personnages, le perso actuel a un anneau
 * violet, les autres sont sélectionnables. Un click PATCH /api/profile/avatar
 * et router.refresh() pour propager partout (banner planning, /utilisateurs,
 * /messages).
 *
 * Bouton "Aucun avatar" pour retirer le choix → fallback sur la pastille
 * initiale colorée (comportement par défaut).
 */
export function AvatarPicker({
  currentAvatarId,
  firstName,
  color,
}: {
  currentAvatarId: string | null;
  firstName: string;
  color?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(currentAvatarId);
  const [error, setError] = useState<string | null>(null);

  function applyChoice(next: string | null) {
    if (next === selected) return;
    setError(null);
    setSelected(next);
    startTransition(async () => {
      try {
        const res = await fetch("/api/profile/avatar", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ avatarId: next }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setError(err.error ?? "Erreur lors de l'enregistrement");
          // Revert l'UI au précédent choix
          setSelected(currentAvatarId);
          return;
        }
        router.refresh();
      } catch {
        setError("Réseau indisponible");
        setSelected(currentAvatarId);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <AvatarImage
          avatarId={selected}
          firstName={firstName}
          color={color}
          size={56}
          ringClassName="ring-2 ring-violet-200"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted-foreground">
            Avatar actuel
          </p>
          <p className="text-[14px] font-medium text-foreground truncate">
            {selected
              ? AVATARS.find((a) => a.id === selected)?.label
              : `Initiale "${(firstName?.[0] ?? "?").toUpperCase()}"`}
          </p>
          {pending && (
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-[11.5px] text-violet-600">
              <Loader2 className="h-3 w-3 animate-spin" />
              Enregistrement…
            </p>
          )}
        </div>
      </div>

      {/* Grille des 9 personnages */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
        {/* Tuile "Aucun avatar" — fallback initiale */}
        <button
          type="button"
          onClick={() => applyChoice(null)}
          disabled={pending}
          className={cn(
            "relative flex flex-col items-center gap-1.5 rounded-xl border-2 p-2.5 transition-all hover:border-violet-300 hover:bg-violet-50/40 dark:hover:bg-violet-950/20 disabled:opacity-60",
            selected === null
              ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
              : "border-border bg-card"
          )}
        >
          <div className="relative">
            <AvatarImage
              avatarId={null}
              firstName={firstName}
              color={color}
              size={48}
            />
            {selected === null && (
              <span className="absolute -top-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-white">
                <Check className="h-3 w-3" />
              </span>
            )}
          </div>
          <p className="text-[10.5px] font-medium text-foreground tracking-tight text-center leading-tight">
            Aucun avatar
          </p>
          <p className="text-[9.5px] text-muted-foreground text-center leading-tight line-clamp-2">
            Initiale "{(firstName?.[0] ?? "?").toUpperCase()}"
          </p>
        </button>

        {AVATARS.map((avatar) => {
          const isSelected = selected === avatar.id;
          return (
            <button
              key={avatar.id}
              type="button"
              onClick={() => applyChoice(avatar.id as AvatarId)}
              disabled={pending}
              className={cn(
                "relative flex flex-col items-center gap-1.5 rounded-xl border-2 p-2.5 transition-all hover:border-violet-300 hover:bg-violet-50/40 dark:hover:bg-violet-950/20 disabled:opacity-60",
                isSelected
                  ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
                  : "border-border bg-card"
              )}
              title={avatar.description}
            >
              <div className="relative h-12 w-12 rounded-full overflow-hidden bg-white dark:bg-zinc-100">
                <Image
                  src={avatar.src}
                  alt={avatar.label}
                  width={96}
                  height={96}
                  className="h-full w-full object-cover"
                  unoptimized
                />
                {isSelected && (
                  <span className="absolute -top-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </div>
              <p className="text-[10.5px] font-medium text-foreground tracking-tight text-center leading-tight">
                {avatar.label}
              </p>
              <p className="text-[9.5px] text-muted-foreground text-center leading-tight line-clamp-2">
                {avatar.description}
              </p>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-50 dark:bg-red-950/30 px-3 py-2 text-[12.5px] text-red-700 dark:text-red-400">
          <X className="h-3.5 w-3.5" />
          {error}
        </div>
      )}
    </div>
  );
}
