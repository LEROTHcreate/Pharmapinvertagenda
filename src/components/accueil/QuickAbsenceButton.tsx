"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { AbsenceRequestForm } from "@/components/absences/AbsenceRequestForm";

/**
 * Action rapide "Poser une absence" depuis l'Accueil — ouvre le formulaire de
 * demande d'absence (réutilise le composant existant). Remplace l'ancien FAB.
 */
export function QuickAbsenceButton({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 text-white py-3.5 text-[14px] font-semibold shadow-[0_8px_24px_-8px_rgba(124,58,237,0.5)] active:scale-[0.98] transition-transform hover:bg-violet-700"
      >
        <CalendarPlus className="h-[18px] w-[18px]" strokeWidth={2.2} />
        Poser une absence
      </button>

      <AbsenceRequestForm
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          // Rafraîchit l'Accueil (badges, ma journée) après création.
          router.refresh();
        }}
        isAdmin={isAdmin}
      />
    </>
  );
}
