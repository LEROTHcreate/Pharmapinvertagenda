"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { TrainingType } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/permissions";

/**
 * Actions serveur — suivi des formations / DPC par collaborateur.
 * Réservées aux responsables d'équipe (Manageur+). Toujours isolées par
 * pharmacyId (multi-tenant).
 */

export type TrainingDTO = {
  id: string;
  title: string;
  type: TrainingType;
  date: string; // ISO YYYY-MM-DD
  provider: string | null;
  notes: string | null;
  attestationUrl: string | null;
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

type AdminCtx =
  | { ok: false; error: string }
  | { ok: true; pharmacyId: string };

/** Vérifie l'identité + le droit de gérer l'équipe (Manageur+). */
async function requireTeamAdmin(): Promise<AdminCtx> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!canManageTeam(session.user.role)) {
    return { ok: false, error: "Action réservée aux responsables." };
  }
  return { ok: true, pharmacyId: session.user.pharmacyId };
}

const trainingInput = z.object({
  employeeId: z.string().min(1),
  title: z.string().trim().min(1, "Intitulé requis").max(200),
  type: z.enum(["DPC", "OBLIGATOIRE", "INTERNE", "EXTERNE", "AUTRE"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  provider: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  attestationUrl: z
    .string()
    .trim()
    .url("Lien invalide")
    .max(1000)
    .optional()
    .nullable()
    .or(z.literal("")),
});

function toDto(t: {
  id: string;
  title: string;
  type: TrainingType;
  date: Date;
  provider: string | null;
  notes: string | null;
  attestationUrl: string | null;
}): TrainingDTO {
  return {
    id: t.id,
    title: t.title,
    type: t.type,
    date: t.date.toISOString().slice(0, 10),
    provider: t.provider,
    notes: t.notes,
    attestationUrl: t.attestationUrl,
  };
}

/** Liste les formations d'un collaborateur (plus récentes d'abord). */
export async function listTrainings(
  employeeId: string
): Promise<ActionResult<TrainingDTO[]>> {
  const ctx = await requireTeamAdmin();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, pharmacyId: ctx.pharmacyId },
    select: { id: true },
  });
  if (!employee) return { ok: false, error: "Collaborateur introuvable." };

  const rows = await prisma.training.findMany({
    where: { employeeId, pharmacyId: ctx.pharmacyId },
    orderBy: { date: "desc" },
  });
  return { ok: true, data: rows.map(toDto) };
}

/**
 * Recale employee.dpcLastDate sur la formation DPC la plus récente (ou null
 * s'il n'y en a plus). Sert au rappel triennal côté échéances RH.
 */
async function syncDpcLastDate(employeeId: string, pharmacyId: string) {
  const lastDpc = await prisma.training.findFirst({
    where: { employeeId, pharmacyId, type: "DPC" },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  await prisma.employee.update({
    where: { id: employeeId },
    data: { dpcLastDate: lastDpc?.date ?? null },
  });
}

/** Crée une formation pour un collaborateur. */
export async function createTraining(
  raw: unknown
): Promise<ActionResult<TrainingDTO>> {
  const ctx = await requireTeamAdmin();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const parsed = trainingInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const input = parsed.data;

  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, pharmacyId: ctx.pharmacyId },
    select: { id: true },
  });
  if (!employee) return { ok: false, error: "Collaborateur introuvable." };

  const created = await prisma.training.create({
    data: {
      pharmacyId: ctx.pharmacyId,
      employeeId: input.employeeId,
      title: input.title,
      type: input.type,
      date: new Date(`${input.date}T00:00:00.000Z`),
      provider: input.provider || null,
      notes: input.notes || null,
      attestationUrl: input.attestationUrl ? input.attestationUrl : null,
    },
  });

  if (input.type === "DPC") {
    await syncDpcLastDate(input.employeeId, ctx.pharmacyId);
  }

  revalidatePath("/employes");
  return { ok: true, data: toDto(created) };
}

/** Supprime une formation (et recale le DPC si besoin). */
export async function deleteTraining(id: string): Promise<ActionResult<null>> {
  const ctx = await requireTeamAdmin();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const training = await prisma.training.findFirst({
    where: { id, pharmacyId: ctx.pharmacyId },
    select: { id: true, employeeId: true, type: true },
  });
  if (!training) return { ok: false, error: "Formation introuvable." };

  await prisma.training.delete({ where: { id } });

  if (training.type === "DPC") {
    await syncDpcLastDate(training.employeeId, ctx.pharmacyId);
  }

  revalidatePath("/employes");
  return { ok: true, data: null };
}
