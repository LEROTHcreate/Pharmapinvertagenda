"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Check, X, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ABSENCE_LABELS } from "@/types";
import type { AbsenceCode, AbsenceRequestStatus } from "@prisma/client";
import { AbsenceRequestForm } from "@/components/absences/AbsenceRequestForm";
import { NotePromptDialog } from "@/components/ui/note-prompt-dialog";
import { cn } from "@/lib/utils";

type AbsenceDTO = {
  id: string;
  employeeId: string;
  employee: { id: string; firstName: string; lastName: string };
  dateStart: string;
  dateEnd: string;
  absenceCode: AbsenceCode;
  status: AbsenceRequestStatus;
  reason: string | null;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

type Props = {
  currentUser: {
    role: "ADMIN" | "EMPLOYEE";
    employeeId: string | null;
  };
};

export function AbsencesView({ currentUser }: Props) {
  const router = useRouter();
  const [requests, setRequests] = useState<AbsenceDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = currentUser.role === "ADMIN";
  const canSubmit = !!currentUser.employeeId;

  // ID de la demande dont on est en train de saisir le motif de refus
  const [rejectId, setRejectId] = useState<string | null>(null);

  async function refetch() {
    try {
      const res = await fetch("/api/absences");
      if (!res.ok) return;
      const data = (await res.json()) as { requests: AbsenceDTO[] };
      setRequests(data.requests);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refetch();
  }, []);

  async function handleReview(
    id: string,
    decision: "APPROVE" | "REJECT",
    adminNote?: string
  ) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/absences/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, adminNote }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Erreur");
        return;
      }
      await refetch();
      // Si APPROVED, le planning a été mis à jour côté serveur → revalide
      if (decision === "APPROVE") router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleCancel(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/absences/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Erreur");
        return;
      }
      await refetch();
    } finally {
      setBusy(null);
    }
  }

  // Tri : PENDING en haut, puis par date desc
  const sorted = [...requests].sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === "PENDING") return -1;
      if (b.status === "PENDING") return 1;
    }
    return b.dateStart.localeCompare(a.dateStart);
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Absences</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isAdmin
              ? "Validez ou refusez les demandes des collaborateurs"
              : "Vos demandes d'absence et leur statut"}
          </p>
        </div>
        {canSubmit && (
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle demande
          </Button>
        )}
      </div>

      {!canSubmit && !isAdmin && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Votre compte n'est pas lié à un profil collaborateur du planning. Demandez à
          un admin de faire la liaison pour pouvoir soumettre des demandes.
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground text-sm">
          Aucune demande d'absence pour le moment.
          {canSubmit && (
            <p className="mt-2 text-xs">
              Cliquez sur « Nouvelle demande » pour en créer une.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide">
              <tr>
                {isAdmin && (
                  <th className="px-4 py-2 text-left font-medium">Collaborateur</th>
                )}
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2 text-left font-medium">Période</th>
                <th className="px-4 py-2 text-left font-medium">Motif</th>
                <th className="px-4 py-2 text-center font-medium">Statut</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const isOwner = r.employeeId === currentUser.employeeId;
                const rowBusy = busy === r.id;
                return (
                  <tr
                    key={r.id}
                    className={cn(
                      "border-t transition-colors",
                      r.status === "PENDING" && "bg-amber-50/30"
                    )}
                  >
                    {isAdmin && (
                      <td className="px-4 py-2 font-medium">
                        {r.employee.firstName} {r.employee.lastName}
                      </td>
                    )}
                    <td className="px-4 py-2">{ABSENCE_LABELS[r.absenceCode]}</td>
                    <td className="px-4 py-2 text-muted-foreground font-mono text-xs tabular-nums">
                      {new Date(r.dateStart).toLocaleDateString("fr-FR")}
                      {r.dateStart !== r.dateEnd && (
                        <>
                          {" → "}
                          {new Date(r.dateEnd).toLocaleDateString("fr-FR")}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs max-w-[180px] truncate">
                      {r.reason ?? "—"}
                      {r.adminNote && r.status !== "PENDING" && (
                        <span className="block italic mt-0.5">
                          Note admin : {r.adminNote}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {r.status === "PENDING" && (
                        <Badge variant="warning">En attente</Badge>
                      )}
                      {r.status === "APPROVED" && (
                        <Badge variant="success">Validée</Badge>
                      )}
                      {r.status === "REJECTED" && (
                        <Badge variant="destructive">Refusée</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex gap-1">
                        {isAdmin && r.status === "PENDING" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={rowBusy}
                              onClick={() => setRejectId(r.id)}
                            >
                              {rowBusy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <X className="h-3.5 w-3.5" />
                              )}
                              Refuser
                            </Button>
                            <Button
                              size="sm"
                              disabled={rowBusy}
                              onClick={() => handleReview(r.id, "APPROVE")}
                            >
                              {rowBusy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              Valider
                            </Button>
                          </>
                        )}
                        {!isAdmin && isOwner && r.status === "PENDING" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={rowBusy}
                            onClick={() => handleCancel(r.id)}
                          >
                            {rowBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            Annuler
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AbsenceRequestForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={refetch}
      />

      <NotePromptDialog
        open={rejectId !== null}
        title="Refuser cette demande d'absence"
        description="Le motif sera visible par le collaborateur. Restez factuel."
        placeholder="Motif (optionnel)…"
        confirmLabel="Refuser"
        variant="destructive"
        onSubmit={async (note) => {
          const id = rejectId;
          setRejectId(null);
          if (id) {
            await handleReview(id, "REJECT", note || undefined);
          }
        }}
        onClose={() => setRejectId(null)}
      />
    </div>
  );
}
