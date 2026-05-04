"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, Printer, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Bouton « Imprimer / PDF ».
 *
 * Comportements :
 *   - Si l'utilisateur n'a pas de fiche Employee liée (admin pur) → bouton
 *     simple qui imprime la grille équipe en cours.
 *   - Sinon (collaborateur OU admin lié à un Employee) → menu déroulant
 *     avec deux choix :
 *       1. « Mon agenda » → navigue vers la fiche A4 imprimable solo
 *          (semaine courante) qui contient son planning à lui uniquement.
 *       2. « Équipe entière » → imprime la vue actuellement à l'écran
 *          (grille planning compressée pour tenir sur une page A4 paysage).
 */
export function PrintButton({
  currentEmployeeId,
  weekStart,
}: {
  currentEmployeeId?: string | null;
  /** Lundi de la semaine affichée — passé à l'URL d'impression solo. */
  weekStart?: string;
}) {
  const router = useRouter();

  // Cas simple : pas de fiche perso → bouton direct sur la grille équipe
  if (!currentEmployeeId) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => window.print()}
        title="Imprimer ou enregistrer en PDF (Ctrl+P)"
      >
        <Printer className="h-4 w-4" />
        Imprimer / PDF
      </Button>
    );
  }

  // Cas avec choix : dropdown menu (Mon agenda / Équipe entière)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" title="Imprimer ou enregistrer en PDF">
          <Printer className="h-4 w-4" />
          Imprimer / PDF
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          onClick={() => {
            // Navigue vers la fiche A4 individuelle (auto-déclenche window.print)
            const url = weekStart
              ? `/planning/collaborateur/${currentEmployeeId}/imprimer?week=${weekStart}`
              : `/planning/collaborateur/${currentEmployeeId}/imprimer`;
            router.push(url);
          }}
          className="cursor-pointer"
        >
          <User className="h-4 w-4 mr-2 text-violet-600" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">Mon agenda</span>
            <span className="text-[10.5px] text-zinc-500">
              Fiche A4 perso pour la semaine
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => window.print()}
          className="cursor-pointer"
        >
          <Users className="h-4 w-4 mr-2 text-zinc-600" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">Équipe entière</span>
            <span className="text-[10.5px] text-zinc-500">
              Grille complète compressée sur 1 page
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
