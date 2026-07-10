import { redirect } from "next/navigation";

// Les créneaux à couvrir sont désormais regroupés avec les absences et les
// disponibilités dans une page à onglets (« Absences & remplacements »). On
// conserve cette route pour les anciens liens / favoris : elle redirige vers
// l'onglet « Créneaux à couvrir ».
export default function CreneauxPage() {
  redirect("/absences?tab=creneaux");
}
