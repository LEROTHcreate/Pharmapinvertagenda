import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MessagesView } from "@/components/messages/MessagesView";

export const metadata = { title: "Messages — PharmaPlanning" };
export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Liste des contacts (autres utilisateurs actifs de la pharmacie)
  // — pour le modal "Nouvelle conversation"
  const contacts = await prisma.user.findMany({
    where: {
      pharmacyId: session.user.pharmacyId,
      isActive: true,
      status: "APPROVED",
      id: { not: session.user.id },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true },
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
