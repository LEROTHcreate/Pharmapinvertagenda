/**
 * Vide l'agenda et les absences/congés sans toucher aux comptes, employés,
 * pharmacie ou gabarits. Permet de repartir d'une base propre pour remplir
 * manuellement via les gabarits.
 *
 * Lancement : npx tsx prisma/clear-planning.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("→ Suppression des entrées planning (ScheduleEntry)...");
  const planning = await prisma.scheduleEntry.deleteMany({});
  console.log(`✓ ${planning.count} créneaux supprimés.`);

  console.log("→ Suppression des demandes d'absence (AbsenceRequest)...");
  const absences = await prisma.absenceRequest.deleteMany({});
  console.log(`✓ ${absences.count} demandes d'absence supprimées.`);

  console.log("");
  console.log("✓ Agenda vidé. Conservés :");
  console.log("  • Pharmacie + paramètres");
  console.log("  • Employés (16) + leurs statuts");
  console.log("  • Comptes utilisateurs (admin + Stéphane)");
  console.log("  • Gabarits S1/S2 (s'ils existent)");
  console.log("  • Conversations / messages");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
