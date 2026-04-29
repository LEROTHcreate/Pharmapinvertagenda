"use client";

import { useState } from "react";
import {
  ArrowLeftRight,
  Calendar,
  Clock,
  Check,
  X,
  Loader2,
  ShieldCheck,
  ShieldX,
  Hourglass,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NotePromptDialog } from "@/components/ui/note-prompt-dialog";
import type {
  ConversationMemberDTO,
  MessageDTO,
  SwapStatusDTO,
} from "@/types/messaging";

type Props = {
  message: MessageDTO;
  currentUser: { id: string; name: string; role: "ADMIN" | "EMPLOYEE" };
  otherMembers: ConversationMemberDTO[];
  onUpdated: () => void;
};

const STATUS_BADGE: Record<
  SwapStatusDTO,
  { label: string; classes: string; icon: React.ComponentType<{ className?: string }> }
> = {
  PENDING_TARGET: {
    label: "En attente du collègue",
    classes: "bg-zinc-100 text-zinc-700",
    icon: Hourglass,
  },
  REJECTED_TARGET: {
    label: "Refusé par le collègue",
    classes: "bg-red-50 text-red-700",
    icon: ShieldX,
  },
  PENDING_ADMIN: {
    label: "En attente validation admin",
    classes: "bg-amber-50 text-amber-800",
    icon: Hourglass,
  },
  APPROVED: {
    label: "Approuvé · planning mis à jour",
    classes: "bg-emerald-50 text-emerald-700",
    icon: ShieldCheck,
  },
  REJECTED_ADMIN: {
    label: "Refusé par l'admin",
    classes: "bg-red-50 text-red-700",
    icon: ShieldX,
  },
  CANCELLED: {
    label: "Annulé",
    classes: "bg-zinc-100 text-zinc-500",
    icon: X,
  },
};

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function SwapCard({ message, currentUser, otherMembers, onUpdated }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null = pas de dialog ouvert ; sinon "target" (cible refuse) ou "admin" (admin refuse)
  const [rejectMode, setRejectMode] = useState<"target" | "admin" | null>(null);
  const swap = message.swapRequest;
  if (!swap) return null;

  const isRequester = swap.requesterId === currentUser.id;
  const isTarget = swap.targetId === currentUser.id;
  const requester =
    otherMembers.find((m) => m.userId === swap.requesterId)?.name ??
    (isRequester ? currentUser.name : "—");
  const target =
    otherMembers.find((m) => m.userId === swap.targetId)?.name ??
    (isTarget ? currentUser.name : "—");

  const badge = STATUS_BADGE[swap.status];
  const BadgeIcon = badge.icon;

  async function callAction(
    path: string,
    body?: Record<string, unknown>,
    label?: string
  ) {
    setBusy(label ?? path);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Erreur");
        return;
      }
      onUpdated();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="my-1 mx-auto max-w-[480px]">
      <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-3.5">
        <div className="flex items-center gap-2 mb-2">
          <ArrowLeftRight className="h-4 w-4 text-violet-600" />
          <span className="text-[12px] font-semibold uppercase tracking-wide text-violet-700">
            Demande d'échange
          </span>
        </div>

        <div className="space-y-1.5 text-[13px] text-zinc-800">
          <p>
            <span className="font-semibold">{requester}</span> demande à{" "}
            <span className="font-semibold">{target}</span> de couvrir
            son créneau&nbsp;:
          </p>
          <div className="flex items-center gap-1.5 text-zinc-700">
            <Calendar className="h-3.5 w-3.5 text-zinc-400" />
            {formatDate(swap.date)}
          </div>
          <div className="flex items-center gap-1.5 text-zinc-700">
            <Clock className="h-3.5 w-3.5 text-zinc-400" />
            {swap.fullDay
              ? "Journée entière"
              : `${swap.startTime} → ${swap.endTime}`}
          </div>
          {swap.reason && (
            <p className="rounded-lg bg-white/60 px-2.5 py-1.5 text-[12.5px] italic text-zinc-600 mt-1">
              « {swap.reason} »
            </p>
          )}
          {swap.rejectionNote && (
            <p className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[12px] text-red-700 mt-1">
              Motif refus&nbsp;: {swap.rejectionNote}
            </p>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              badge.classes
            )}
          >
            <BadgeIcon className="h-3 w-3" />
            {badge.label}
          </span>
        </div>

        {error && (
          <p className="mt-2 text-[12px] text-red-700">{error}</p>
        )}

        {/* Actions selon le rôle et le statut */}
        {isTarget && swap.status === "PENDING_TARGET" && (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={!!busy}
              onClick={() => setRejectMode("target")}
            >
              {busy === "reject" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
              Refuser
            </Button>
            <Button
              size="sm"
              className="flex-1"
              disabled={!!busy}
              onClick={() => callAction(`/api/swaps/${swap.id}/accept`, undefined, "accept")}
            >
              {busy === "accept" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Accepter
            </Button>
          </div>
        )}

        {isTarget && swap.status === "PENDING_ADMIN" && (
          <p className="mt-3 text-[12px] text-zinc-500 italic">
            Vous avez accepté · transmis à l'admin pour validation
          </p>
        )}

        {isRequester && swap.status === "PENDING_TARGET" && (
          <p className="mt-3 text-[12px] text-zinc-500 italic">
            En attente de la réponse de {target}
          </p>
        )}

        {currentUser.role === "ADMIN" && swap.status === "PENDING_ADMIN" && (
          <div className="mt-3 rounded-lg bg-white border border-amber-200 p-2.5">
            <p className="text-[11.5px] font-semibold text-amber-800 mb-2">
              Validation admin requise
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                disabled={!!busy}
                onClick={() => setRejectMode("admin")}
              >
                {busy === "admin-reject" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                Refuser
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={!!busy}
                onClick={() =>
                  callAction(
                    `/api/swaps/${swap.id}/review`,
                    { approve: true },
                    "admin-approve"
                  )
                }
              >
                {busy === "admin-approve" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Approuver
              </Button>
            </div>
          </div>
        )}
      </div>

      <NotePromptDialog
        open={rejectMode !== null}
        title={
          rejectMode === "admin"
            ? "Refuser cet échange (admin)"
            : "Refuser cet échange"
        }
        description={
          rejectMode === "admin"
            ? "La demande a été acceptée par le collègue. En tant qu'admin, vous pouvez la refuser. Le motif sera visible par le demandeur et la cible."
            : "Vous ne pouvez pas couvrir ce créneau. Le demandeur recevra votre motif (optionnel)."
        }
        placeholder="Motif (optionnel)…"
        confirmLabel="Refuser"
        variant="destructive"
        onSubmit={async (note) => {
          const mode = rejectMode;
          setRejectMode(null);
          if (mode === "target") {
            await callAction(
              `/api/swaps/${swap.id}/reject`,
              { rejectionNote: note || undefined },
              "reject"
            );
          } else if (mode === "admin") {
            await callAction(
              `/api/swaps/${swap.id}/review`,
              { approve: false, rejectionNote: note || undefined },
              "admin-reject"
            );
          }
        }}
        onClose={() => setRejectMode(null)}
      />
    </div>
  );
}
