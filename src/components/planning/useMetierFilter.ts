"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { EmployeeStatus } from "@prisma/client";
import { parseMetier, serializeMetier } from "@/lib/metier-filter";

/**
 * Filtre par métier partagé et persistant dans l'URL (`?metier=PHARMACIEN,…`).
 *
 * - Source de vérité immédiate = état local → filtrage client INSTANTANÉ, sans
 *   refetch serveur (la liste complète des employés est déjà chargée par la page).
 * - Synchronisation URL via `history.replaceState` : le filtre persiste quand on
 *   navigue (prev/next semaine/mois réinjectent le param, cf. `appendCurrentMetier`)
 *   et les liens sont partageables — SANS déclencher de navigation Next / refetch
 *   à chaque clic (ce qui rechargerait inutilement la BDD).
 * - À l'arrivée sur une page, ou quand une VRAIE navigation change le param,
 *   l'état se réinitialise depuis l'URL.
 */
export function useMetierFilter() {
  const searchParams = useSearchParams();
  const urlMetier = searchParams.get("metier");

  const [selected, setSelectedState] = useState<Set<EmployeeStatus>>(() =>
    parseMetier(urlMetier)
  );

  // Resync uniquement quand l'URL côté routeur Next change réellement (= une
  // navigation prev/next ou un lien partagé). Un simple toggle passe par
  // history.replaceState, qui ne touche pas au state du routeur → pas de refire,
  // donc pas de clignotement ni d'écrasement de la sélection locale.
  useEffect(() => {
    setSelectedState(parseMetier(urlMetier));
  }, [urlMetier]);

  const commit = useCallback((next: Set<EmployeeStatus>) => {
    setSelectedState(next);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const serialized = serializeMetier(next);
      if (serialized) params.set("metier", serialized);
      else params.delete("metier");
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        qs ? `${window.location.pathname}?${qs}` : window.location.pathname
      );
    }
  }, []);

  const toggle = useCallback(
    (status: EmployeeStatus) => {
      const next = new Set(selected);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      commit(next);
    },
    [selected, commit]
  );

  const reset = useCallback(() => commit(new Set()), [commit]);

  return { selected, toggle, setSelected: commit, reset };
}
