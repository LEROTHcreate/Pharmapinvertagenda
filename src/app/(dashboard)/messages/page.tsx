import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MessagesView } from "@/components/messages/MessagesView";

export const metadata = { title: "Messages — PharmaPlanning" };
export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Liste des contacts : autres utilisateurs actifs de la même pharmacie,
  // PLUS les comptes "Support PharmaPlanning" (cross-pharmacy) pour qu'un
  // utilisateur de n'importe quelle officine puisse écrire au programmeur.
  const contacts = await prisma.user.findMany({
    where: {
      AND: [
        { id: { not: session.user.id } },
        { isActive: true },
        { status: "APPROVED" },
        {
          OR: [
            { pharmacyId: session.user.pharmacyId },
            { isGlobalSupport: true },
          ],
        },
      ],
    },
    // Support en haut, puis tri alphabétique
    orderBy: [{ isGlobalSupport: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isGlobalSupport: true,
    },
  });

  return (
    <MessagesView
      currentUser={{
        id: session.user.id,
        name: session.user.name,
        role: session.user.role,
      }}
      contacts={contacts}
    />
  );
}
