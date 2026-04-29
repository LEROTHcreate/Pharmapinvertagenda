import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ChangePasswordForm } from "@/components/profil/ChangePasswordForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon profil · PharmaPlanning" };

export default async function ProfilPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          Mon profil
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gère ton compte PharmaPlanning
        </p>
      </div>

      {/* Carte info compte */}
      <section className="rounded-2xl border border-zinc-200/70 bg-white p-5">
        <p className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-zinc-400 mb-3">
          Compte
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13.5px]">
          <div>
            <p className="text-zinc-500 text-[11.5px] mb-0.5">Nom</p>
            <p className="font-medium text-zinc-900">{session.user.name}</p>
          </div>
          <div>
            <p className="text-zinc-500 text-[11.5px] mb-0.5">Email</p>
            <p className="font-medium text-zinc-900 truncate">
              {session.user.email}
            </p>
          </div>
          <div>
            <p className="text-zinc-500 text-[11.5px] mb-0.5">Rôle</p>
            <p className="font-medium text-zinc-900">
              {session.user.role === "ADMIN"
                ? "Administrateur"
                : "Collaborateur"}
            </p>
          </div>
        </div>
      </section>

      {/* Carte mot de passe */}
      <section className="rounded-2xl border border-zinc-200/70 bg-white p-5">
        <p className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-zinc-400 mb-1">
          Sécurité
        </p>
        <h2 className="text-base font-semibold tracking-tight text-zinc-900 mb-1">
          Changer mon mot de passe
        </h2>
        <p className="text-[13px] text-zinc-500 mb-5">
          Saisis ton mot de passe actuel pour le confirmer, puis le nouveau (8
          caractères minimum).
        </p>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
