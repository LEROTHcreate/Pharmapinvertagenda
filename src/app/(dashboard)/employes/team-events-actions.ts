"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { canManageTeam } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { teamEventInput } from "@/validators/team-event";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireManager() {
  const session = await auth();
  if (!session?.user) {
    return { ok: false as const, error: "Non authentifié" };
  }
  // Titulaires (ADMIN) + Manageurs peuvent gérer les événements d'équipe.
  if (!canManageTeam(session.user.role)) {
    return { ok: false as const, error: "Réservé aux titulaires et manageurs" };
  }
  return {
    ok: true as const,
    pharmacyId: session.user.pharmacyId,
    userId: session.user.id,
  };
}

/** Normalise les champs communs create/update depuis un input validé. */
function eventData(d: import("@/validators/team-event").TeamEventInput) {
  return {
    title: d.title,
    description: d.description?.trim() ? d.description : null,
    // Date stockée à minuit UTC ; l'heure éventuelle vit dans `time`.
    date: new Date(`${d.date}T00:00:00Z`),
    time: d.time && d.time.length > 0 ? d.time : null,
    type: d.type,
    location: d.location?.trim() ? d.location : null,
  };
}

export async function createTeamEvent(input: unknown): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx.ok) return ctx;
  const parsed = teamEventInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  await prisma.teamEvent.create({
    data: {
      pharmacyId: ctx.pharmacyId,
      createdById: ctx.userId,
      ...eventData(parsed.data),
    },
  });
  revalidatePath("/employes");
  return { ok: true };
}

export async function updateTeamEvent(
  id: string,
  input: unknown
): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx.ok) return ctx;
  const parsed = teamEventInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const existing = await prisma.teamEvent.findFirst({
    where: { id, pharmacyId: ctx.pharmacyId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Événement introuvable" };
  await prisma.teamEvent.update({
    where: { id: existing.id },
    data: eventData(parsed.data),
  });
  revalidatePath("/employes");
  return { ok: true };
}

export async function deleteTeamEvent(id: string): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx.ok) return ctx;
  const existing = await prisma.teamEvent.findFirst({
    where: { id, pharmacyId: ctx.pharmacyId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Événement introuvable" };
  await prisma.teamEvent.delete({ where: { id: existing.id } });
  revalidatePath("/employes");
  return { ok: true };
}
