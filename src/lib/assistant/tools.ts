import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdminLevel, canApplyTemplates } from "@/lib/permissions";
import { isTaskAllowed } from "@/lib/role-task-rules";
import { isNonWorkedTask, STATUS_LABELS } from "@/types";
import type { TaskCode } from "@prisma/client";

/**
 * Contexte serveur transmis pour les actions ADMIN : Hygie agit en appelant les
 * routes API existantes (mêmes validations + RBAC + effets de bord) via un fetch
 * interne authentifié (le cookie de session de l'utilisateur est retransmis).
 * On ne DUPLIQUE donc pas la logique métier critique (approbation d'absence,
 * application de gabarit).
 */
export type ToolContext = { baseUrl: string; cookie: string };

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
export const WRITE_TOOLS = new Set([
  "poser_absence",
  "signaler_disponibilite",
  "valider_absence",
  "appliquer_gabarit",
]);

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

const validerAbsenceDef: ToolDef = {
  type: "function",
  function: {
    name: "valider_absence",
    description:
      "(Titulaire) Valide (APPROVE) ou refuse (REJECT) la demande d'absence EN ATTENTE d'un collaborateur, en le désignant par son nom. Utilise-le quand l'admin dit par ex. « valide l'absence de Marie » ou « refuse le congé de Paul ».",
    parameters: {
      type: "object",
      properties: {
        employeeName: {
          type: "string",
          description: "Nom ou prénom du collaborateur concerné",
        },
        decision: {
          type: "string",
          enum: ["APPROVE", "REJECT"],
          description: "APPROVE pour valider, REJECT pour refuser",
        },
      },
      required: ["employeeName", "decision"],
    },
  },
};

const appliquerGabaritDef: ToolDef = {
  type: "function",
  function: {
    name: "appliquer_gabarit",
    description:
      "(Manageur/Titulaire) Applique un gabarit de semaine (S1 ou S2) sur cette semaine ou la semaine prochaine. Préserve les créneaux déjà saisis (n'écrase pas). Utilise-le quand l'admin dit par ex. « applique le gabarit S1 sur la semaine prochaine ».",
    parameters: {
      type: "object",
      properties: {
        weekType: {
          type: "string",
          enum: ["S1", "S2"],
          description: "Type de gabarit à appliquer",
        },
        when: {
          type: "string",
          enum: ["this", "next"],
          description: "this = cette semaine, next = la semaine prochaine",
        },
      },
      required: ["weekType"],
    },
  },
};

const suggererRemplacantDef: ToolDef = {
  type: "function",
  function: {
    name: "suggerer_remplacant",
    description:
      "(Manageur/Titulaire) Propose des collaborateurs pouvant REMPLACER une personne un jour donné : rôle compatible avec ce qu'elle fait, non absents ce jour-là, et les MOINS chargés en heures cette semaine. Utilise-le pour « qui peut remplacer Marie mardi ? ».",
    parameters: {
      type: "object",
      properties: {
        employeeName: {
          type: "string",
          description: "Nom ou prénom de la personne à remplacer",
        },
        date: {
          type: "string",
          description: "Jour concerné, format YYYY-MM-DD (défaut : aujourd'hui)",
        },
      },
      required: ["employeeName"],
    },
  },
};

/** Renvoie les outils disponibles selon le rôle de l'utilisateur. */
export function getToolsForUser(user: ToolUser): ToolDef[] {
  const tools: ToolDef[] = [];
  // Actions self-service : tout collaborateur lié à une fiche.
  if (user.employeeId) {
    tools.push(posetAbsenceDef, dispoDef);
  }
  // Actions titulaire : lister + valider les absences en attente.
  if (isAdminLevel(user.role)) {
    tools.push(absencesAValiderDef, validerAbsenceDef);
  }
  // Application de gabarit + suggestion de remplaçant : manageur et plus.
  if (canApplyTemplates(user.role)) {
    tools.push(appliquerGabaritDef, suggererRemplacantDef);
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
  if (name === "valider_absence") {
    const verb = args.decision === "REJECT" ? "Refuser" : "Valider";
    return `${verb} l'absence en attente de ${String(args.employeeName)}`;
  }
  if (name === "appliquer_gabarit") {
    const when = args.when === "next" ? "la semaine prochaine" : "cette semaine";
    return `Appliquer le gabarit ${String(args.weekType)} sur ${when}`;
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

const validerAbsenceArgs = z.object({
  employeeName: z.string().trim().min(1).max(80),
  decision: z.enum(["APPROVE", "REJECT"]),
});

const appliquerGabaritArgs = z.object({
  weekType: z.enum(["S1", "S2"]),
  when: z.enum(["this", "next"]).default("this"),
});

const suggererRemplacantArgs = z.object({
  employeeName: z.string().trim().min(1).max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Lundi (UTC, YYYY-MM-DD) de la semaine contenant `dateIso`. */
function mondayOf(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lundi
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** Lundi (UTC, YYYY-MM-DD) de cette semaine ou de la semaine prochaine. */
function mondayIso(when: "this" | "next"): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lundi
  d.setUTCDate(d.getUTCDate() - dow + (when === "next" ? 7 : 0));
  return d.toISOString().slice(0, 10);
}

/** Appel interne authentifié à une route API (cookie de session retransmis). */
async function callInternal(
  ctx: ToolContext,
  path: string,
  method: string,
  body?: unknown
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(`${ctx.baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: {} };
  }
}

/**
 * Exécute un outil. RBAC RE-VÉRIFIÉ ici (source de vérité). Renvoie un message
 * en français destiné à l'utilisateur (et re-injecté au modèle pour les lectures).
 */
export async function executeTool(
  user: ToolUser,
  name: string,
  rawArgs: Record<string, unknown>,
  ctx?: ToolContext
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

  // ── valider_absence (titulaire) : approuve/refuse via la route existante ──
  if (name === "valider_absence") {
    if (!isAdminLevel(user.role)) {
      return { ok: false, message: "Seul un titulaire peut valider une absence." };
    }
    if (!ctx) return { ok: false, message: "Action indisponible pour l'instant." };
    const parsed = validerAbsenceArgs.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, message: "Précise le nom du collaborateur et si tu valides ou refuses." };
    }
    const { employeeName, decision } = parsed.data;
    // Résout la demande EN ATTENTE correspondant au nom donné.
    const pend = await prisma.absenceRequest.findMany({
      where: { pharmacyId: user.pharmacyId, status: "PENDING" },
      orderBy: { dateStart: "asc" },
      select: {
        id: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    });
    const q = employeeName.trim().toLowerCase();
    const matches = pend.filter((a) => {
      const full = `${a.employee.firstName} ${a.employee.lastName}`.toLowerCase();
      return (
        full.includes(q) ||
        a.employee.firstName.toLowerCase().includes(q) ||
        a.employee.lastName.toLowerCase().includes(q)
      );
    });
    if (matches.length === 0) {
      return { ok: false, message: `Aucune demande d'absence en attente pour « ${employeeName} ».` };
    }
    if (matches.length > 1) {
      return {
        ok: false,
        message: `Plusieurs demandes en attente correspondent à « ${employeeName} ». Ouvre la page Absences & dispos pour choisir la bonne.`,
      };
    }
    const target = matches[0];
    const who = `${target.employee.firstName} ${target.employee.lastName}`.trim();
    const res = await callInternal(ctx, `/api/absences/${target.id}`, "PATCH", {
      decision,
    });
    if (!res.ok) {
      return { ok: false, message: (res.data.error as string) ?? "La validation a échoué." };
    }
    return {
      ok: true,
      message:
        decision === "APPROVE"
          ? `✅ Absence de ${who} validée (le planning est mis à jour et un e-mail lui est envoyé).`
          : `Absence de ${who} refusée.`,
    };
  }

  // ── appliquer_gabarit (manageur+) : applique un template via la route ──
  if (name === "appliquer_gabarit") {
    if (!canApplyTemplates(user.role)) {
      return { ok: false, message: "Réservé aux manageurs et titulaires." };
    }
    if (!ctx) return { ok: false, message: "Action indisponible pour l'instant." };
    const parsed = appliquerGabaritArgs.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, message: "Précise le gabarit (S1 ou S2) et la semaine." };
    }
    const { weekType, when } = parsed.data;
    // Gabarit à appliquer : celui par défaut du type, sinon le plus récent.
    const tpl = await prisma.weekTemplate.findFirst({
      where: { pharmacyId: user.pharmacyId, weekType },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
      select: { id: true, name: true },
    });
    if (!tpl) {
      return { ok: false, message: `Aucun gabarit ${weekType} n'existe encore. Crée-le d'abord dans Gabarits.` };
    }
    const body: Record<string, unknown> = {
      weekStart: mondayIso(when),
      weeks: 1,
      overwrite: false,
      deleteAbsences: false,
      [weekType === "S1" ? "s1TemplateId" : "s2TemplateId"]: tpl.id,
    };
    const res = await callInternal(ctx, `/api/templates/apply-batch`, "POST", body);
    if (!res.ok) {
      return { ok: false, message: (res.data.error as string) ?? "L'application du gabarit a échoué." };
    }
    const inserted = Number(res.data.inserted ?? 0);
    const preserved = Number(res.data.preserved ?? 0);
    const whenLabel = when === "next" ? "la semaine prochaine" : "cette semaine";
    return {
      ok: true,
      message: `✅ Gabarit ${weekType} « ${tpl.name} » appliqué sur ${whenLabel} : ${inserted} créneau(x) ajouté(s)${preserved ? `, ${preserved} déjà présent(s) conservé(s)` : ""}.`,
    };
  }

  // ── suggerer_remplacant (manageur+, lecture) ──
  if (name === "suggerer_remplacant") {
    if (!canApplyTemplates(user.role)) {
      return { ok: false, message: "Réservé aux manageurs et titulaires." };
    }
    const parsed = suggererRemplacantArgs.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, message: "Précise qui remplacer (et le jour si besoin)." };
    }
    const dateIso = parsed.data.date ?? todayIso();
    const q = parsed.data.employeeName.trim().toLowerCase();

    const team = await prisma.employee.findMany({
      where: { pharmacyId: user.pharmacyId, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        weeklyHours: true,
      },
    });
    const absent = team.find((e) => {
      const full = `${e.firstName} ${e.lastName}`.toLowerCase();
      return (
        full.includes(q) ||
        e.firstName.toLowerCase().includes(q) ||
        e.lastName.toLowerCase().includes(q)
      );
    });
    if (!absent) {
      return { ok: false, message: `Je ne trouve pas « ${parsed.data.employeeName} » dans l'équipe active.` };
    }

    const day = new Date(`${dateIso}T00:00:00Z`);
    const dayEnd = new Date(day.getTime() + 86_400_000);
    const monday = new Date(`${mondayOf(dateIso)}T00:00:00Z`);
    const saturday = new Date(monday.getTime() + 6 * 86_400_000);

    const [absentEntries, weekEntries, approved] = await Promise.all([
      prisma.scheduleEntry.findMany({
        where: { employeeId: absent.id, date: { gte: day, lt: dayEnd }, type: "TASK" },
        select: { taskCode: true },
      }),
      prisma.scheduleEntry.findMany({
        where: { pharmacyId: user.pharmacyId, date: { gte: monday, lte: saturday } },
        select: { employeeId: true, date: true, type: true, taskCode: true },
      }),
      prisma.absenceRequest.findMany({
        where: {
          pharmacyId: user.pharmacyId,
          status: "APPROVED",
          dateStart: { lte: day },
          dateEnd: { gte: day },
        },
        select: { employeeId: true },
      }),
    ]);

    // Tâches à couvrir : ce que l'absent faisait ce jour ; sinon COMPTOIR s'il
    // est comptoir-capable ; sinon on retombe sur « même métier ».
    const neededSet = new Set<TaskCode>();
    for (const e of absentEntries) {
      if (e.taskCode && !isNonWorkedTask(e.taskCode)) neededSet.add(e.taskCode);
    }
    let needed: TaskCode[] = [...neededSet];
    if (needed.length === 0 && isTaskAllowed(absent.status, "COMPTOIR")) {
      needed = ["COMPTOIR"];
    }

    // Déjà absents ce jour (absence approuvée OU cellule ABSENCE).
    const absentToday = new Set(approved.map((a) => a.employeeId));
    for (const e of weekEntries) {
      if (e.type === "ABSENCE" && e.date.toISOString().slice(0, 10) === dateIso) {
        absentToday.add(e.employeeId);
      }
    }

    // Heures TASK (hors échange) de la semaine par collaborateur.
    const hoursByEmp = new Map<string, number>();
    for (const e of weekEntries) {
      if (e.type === "TASK" && e.taskCode && !isNonWorkedTask(e.taskCode)) {
        hoursByEmp.set(e.employeeId, (hoursByEmp.get(e.employeeId) ?? 0) + 0.5);
      }
    }

    const candidates = team.filter((c) => {
      if (c.id === absent.id || absentToday.has(c.id)) return false;
      if (needed.length > 0) return needed.some((t) => isTaskAllowed(c.status, t));
      return c.status === absent.status; // métier spécialisé sans poste ce jour
    });

    if (candidates.length === 0) {
      return {
        ok: true,
        message: `Personne de disponible et compatible pour remplacer ${absent.firstName} le ${frDate(dateIso)}.`,
      };
    }

    const ranked = candidates
      .map((c) => ({ c, worked: hoursByEmp.get(c.id) ?? 0 }))
      .sort(
        (a, b) =>
          b.c.weeklyHours - b.worked - (a.c.weeklyHours - a.worked)
      )
      .slice(0, 5);

    const lines = ranked.map(({ c, worked }) => {
      const room = Math.round((c.weeklyHours - worked) * 10) / 10;
      const dispo = room > 0 ? `, ${room}h dispo` : " (déjà au contrat)";
      return `• ${c.firstName} ${c.lastName} (${STATUS_LABELS[c.status]}) — ${worked}h/${c.weeklyHours}h${dispo}`;
    });
    return {
      ok: true,
      message: `Pour remplacer ${absent.firstName} le ${frDate(dateIso)} (du moins chargé au plus chargé) :\n${lines.join("\n")}`,
    };
  }

  return { ok: false, message: "Action inconnue." };
}
