import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * La page « Actualités » plein écran a été supprimée : l'actu pharmacie vit
 * désormais entièrement dans « Infos & conseils » (colonne dédiée). On redirige
 * pour ne pas casser d'anciens liens / favoris.
 */
export default function ActualitesPage() {
  redirect("/infos");
}
