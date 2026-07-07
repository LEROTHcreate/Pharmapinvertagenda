import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdminLevel } from "@/lib/permissions";

/**
 * Outils (function-calling) de l'assistant Hygie.
 *
 * SÉCURITÉ : les droits sont TOUJOURS vérifiés ici, côté serveur (jamais dans
 * le prompt) → un collaborateur ne peut pas déclencher une action d'admin même
 * si le modèle le tentait. Les outils qui MODIFIENT des données
 * (`WRITE_TOOLS`) ne sont JAMAIS exécutés directement : ils passent par une
 * confirmation explicite de l'utilisateur (cf. /api/assistant).
 */

export type ToolUser = {
  userId: string;
  role: string;
  pharmacyId: string;
  employeeId: string | null;
};

/** Format OpenAI/Groq d'une définition d'outil. */
type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

/** Outils qui MODIFIENT des données → confirmation obligatoire avant exécution. */
export const WRITE_TOOLS = new Set(["poser_absence", "signaler_disponibilite"]);

const ABSENCE_TYPE_LABELS: Record<string, string> = {
  CONGE: "congé",
  MALADIE: "arrêt maladie",
  ABSENT: "absence",
  FORMATION_ABS: "formation externe",
};
const WISH_LABELS: Record<string, string> = {
  UNAVAILABLE: "indisponible",
  PREFER_OFF: "préfère ne pas travailler",
  PREFER_WORK: "souhaite travailler",
};

const posetAbsenceDef: ToolDef = {
  type: "function",
  function: {
    name: "poser_absence",
    description:
      "Crée une demande d'absence POUR L'UTILISATEUR LUI-MÊME (elle partira en validation du titulaire). Utilise-le quand la personne veut poser un congé, un arrêt maladie, etc.",
    parameters: {
      type: "object",
      properties: {
        dateStart: { type: "string", description: "Date de début, format YYYY-MM-DD" },
        dateEnd: { type: "string", description: "Date de fin (= dateStart si un seul jour), format YYYY-MM-DD" },
        type: {
          type: "string",
          enum: ["CONGE", "MALADIE", "ABSENT", "FORMATION_ABS"],
          description: "Type d'absence",
        },
        motif: { type: "string", description: "Motif optionnel" },
      },
      required: ["dateStart", "dateEnd", "type"],
    },
  },
};

const dispoDef: ToolDef = {
  type: "function",
  function: {
    name: "signaler_disponibilite",
    description:
      "Enregistre un souhait de disponibilité POUR L'UTILISATEUR LUI-MÊME sur un jour à venir (aide le manageur à faire le planning ; ce n'est PAS une absence).",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Le jour concerné, format YYYY-MM-DD" },
        kind: {
          type: "string",
          enum: ["UNAVAILABLE", "PREFER_OFF", "PREFER_WORK"],
          description: "indisponible / préfère ne pas travailler / souhaite travailler",
        },
        note: { type: "string", description: "Note optionnelle" },
      },
      required: ["date", "kind"],
    },
  },
};

const absencesAValiderDef: ToolDef = {
  type: "function",
  function: {
    name: "absences_a_valider",
    description:
      "(Titulaire) Liste les demandes d'absence EN ATTENTE de validation, pour informer l'admin.",
    parameters: { type: "object", properties: {} },
  },
};

/** Renvoie les outils disponibles selon le rôle de l'utilisateur. */
export function getToolsForUser(user: ToolUser): ToolDef[] {
  const tools: ToolDef[] = [];
  // Actions self-service : tout collaborateur lié à une fiche.
  if (user.employeeId) {
    tools.push(posetAbsenceDef, dispoDef);
  }
  // Lecture réservée aux titulaires.
  if (isAdminLevel(user.role)) {
    tools.push(absencesAValiderDef);
  }
  return tools;
}

/** Résumé humain d'une action d'écriture (pour la confirmation). Déterministe. */
export function actionSummary(name: string, args: Record<string, unknown>): string {
  if (name === "poser_absence") {
    const t = ABSENCE_TYPE_LABELS[String(args.type)] ?? "absence";
    const s = String(args.dateStart);
    const e = String(args.dateEnd);
    const span = s === e ? `le ${frDate(s)}` : `du ${frDate(s)} au ${frDate(e)}`;
    const motif = args.motif ? ` (motif : ${args.motif})` : "";
    return `Poser une demande de ${t} ${span}${motif}`;
  }
  if (name === "signaler_disponibilite") {
    const k = WISH_LABELS[String(args.kind)] ?? "disponibilité";
    return `Signaler « ${k} » le ${frDate(String(args.date))}`;
  }
  return "Effectuer cette action";
}

function frDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const posetAbsenceArgs = z
  .object({
    dateStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    type: z.enum(["CONGE", "MALADIE", "ABSENT", "FORMATION_ABS"]),
    motif: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.dateStart <= d.dateEnd);

const dispoArgs = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["UNAVAILABLE", "PREFER_OFF", "PREFER_WORK"]),
  note: z.string().trim().max(200).optional(),
});

/**
 * Exécute un outil. RBAC RE-VÉRIFIÉ ici (source de vérité). Renvoie un message
 * en français destiné à l'utilisateur (et re-injecté au modèle pour les lectures).
 */
export async function executeTool(
  user: ToolUser,
  name: string,
  rawArgs: Record<string, unknown>
): Promise<{ ok: boolean; message: string }> {
  // ── poser_absence (self) ──
  if (name === "poser_absence") {
    if (!user.employeeId) {
      return { ok: false, message: "Ton compte n'est pas lié à une fiche collaborateur, je ne peux pas poser d'absence." };
    }
    const parsed = posetAbsenceArgs.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, message: "Les dates ou le type d'absence sont invalides." };
    await prisma.absenceRequest.create({
      data: {
        pharmacyId: user.pharmacyId,
        employeeId: user.employeeId,
        dateStart: new Date(`${parsed.data.dateStart}T00:00:00Z`),
        dateEnd: new Date(`${parsed.data.dateEnd}T00:00:00Z`),
        absenceCode: parsed.data.type,
        reason: parsed.data.motif || null,
        status: "PENDING",
      },
    });
    return { ok: true, message: "✅ C'est fait : ta demande est enregistrée et part en validation du titulaire." };
  }

  // ── signaler_disponibilite (self) ──
  if (name === "signaler_disponibilite") {
    if (!user.employeeId) {
      return { ok: false, message: "Ton compte n'est pas lié à une fiche collaborateur." };
    }
    const parsed = dispoArgs.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, message: "La date ou le type de disponibilité est invalide." };
    if (parsed.data.date < todayIso()) {
      return { ok: false, message: "On ne peut pas signaler une disponibilité dans le passé." };
    }
    const date = new Date(`${parsed.data.date}T00:00:00Z`);
    await prisma.availabilityWish.upsert({
      where: { employeeId_date: { employeeId: user.employeeId, date } },
      create: {
        pharmacyId: user.pharmacyId,
        employeeId: user.employeeId,
        date,
        kind: parsed.data.kind,
        note: parsed.data.note ?? null,
      },
      update: { kind: parsed.data.kind, note: parsed.data.note ?? null },
    });
    return { ok: true, message: "✅ C'est noté, ta disponibilité est enregistrée." };
  }

  // ── absences_a_valider (titulaire, lecture) ──
  if (name === "absences_a_valider") {
    if (!isAdminLevel(user.role)) {
      return { ok: false, message: "Seul un titulaire peut voir les absences à valider." };
    }
    const pend = await prisma.absenceRequest.findMany({
      where: { pharmacyId: user.pharmacyId, status: "PENDING" },
      orderBy: { dateStart: "asc" },
      take: 15,
      select: {
        dateStart: true,
        dateEnd: true,
        absenceCode: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    });
    if (pend.length === 0) return { ok: true, message: "Aucune demande d'absence en attente. 👍" };
    const lines = pend.map((a) => {
      const who = `${a.employee.firstName} ${a.employee.lastName}`.trim();
      const s = a.dateStart.toISOString().slice(0, 10);
      const e = a.dateEnd.toISOString().slice(0, 10);
      const span = s === e ? frDate(s) : `${frDate(s)} → ${frDate(e)}`;
      return `• ${who} : ${ABSENCE_TYPE_LABELS[a.absenceCode] ?? a.absenceCode}, ${span}`;
    });
    return {
      ok: true,
      message: `${pend.length} demande(s) en attente :\n${lines.join("\n")}\n(La validation se fait sur la page « Absences & dispos ».)`,
    };
  }

  return { ok: false, message: "Action inconnue." };
}
