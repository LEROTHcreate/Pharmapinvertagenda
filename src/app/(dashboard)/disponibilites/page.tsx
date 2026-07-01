import { redirect } from "next/navigation";

// Les disponibilités sont désormais regroupées avec les absences dans une
// page à onglets. On conserve cette route pour les anciens liens / favoris :
// elle redirige vers l'onglet « Disponibilités ».
export default function DisponibilitesPage() {
  redirect("/absences?tab=disponibilites");
}
