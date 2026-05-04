import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PayrollNotesView } from "@/components/notes/PayrollNotesView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notes — PharmaPlanning" };

export default async function NotesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <PayrollNotesView
      currentUser={{
        id: session.user.id,
        role: session.user.role,
      }}
    />
  );
}
