import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma, prismaDirect } from "@/lib/prisma";
import { applyBatchInput } from "@/validators/template";
import { ScheduleType, type WeekTemplate, type WeekTemplateEntry } from "@prisma/client";
import { isTaskAllowed } from "@/lib/role-task-rules";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";
import { withErrorHandling } from "@/lib/api-handler";
import { canApplyTemplates } from "@/lib/permissions";

export const runtime = "nodejs";

// Filet d'erreur global (cold-start BDD → 503). Handler hoisté ci-dessous.
export const POST = withErrorHandling(applyBatch);
// Sur Netlify Pro / Vercel, autorise jusqu'à 60s d'exécution (par défaut 10s
// sur Vercel free). L'apply-batch peut prendre jusqu'à 5-10s pour 26 semaines.
export const maxDuration = 60;

type TemplateWithEntries = WeekTemplate & { entries: WeekTemplateEntry[] };

/**
 * Numéro de semaine ISO (1-53) d'une date UTC.
 * Identique à isoWeekNumber côté client mais on duplique en serveur car on
 * n'importe pas le helper client (Edge / runtime différent).
 */
function isoWeekNumber(d: Date): number {
  const target = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
}

/**
 * POST /api/templates/apply-batch — applique S1 et/ou S2 sur N semaines.
 *
 * Comportements :
 *  - Si seul `s1TemplateId` est fourni → applique S1 sur les N prochaines
 *    semaines impaires (ISO) à partir de weekStart (incluse si elle est S1).
 *  - Idem pour S2 / semaines paires.
 *  - Si les deux sont fournis → applique sur N semaines calendaires
 *    consécutives, en utilisant le bon gabarit pour chaque semaine.
 */
async function applyBatch(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canApplyTemplates(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = applyBatchInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "payload invalide", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const {
    s1TemplateId,
    s2TemplateId,
    weekStart,
    weeks,
    overwrite,
    deleteAbsences,
    fromDayOfWeek,
  } = parsed.data;

  // Charge les gabarits sélectionnés (en parallèle) avec vérification d'ownership.
  const [s1Tpl, s2Tpl] = await Promise.all([
    s1TemplateId
      ? prisma.weekTemplate.findFirst({
          where: {
            id: s1TemplateId,
            pharmacyId: session.user.pharmacyId,
            weekType: "S1",
          },
          include: { entries: true },
        })
      : Promise.resolve(null),
    s2TemplateId
      ? prisma.weekTemplate.findFirst({
          where: {
            id: s2TemplateId,
            pharmacyId: session.user.pharmacyId,
            weekType: "S2",
          },
          include: { entries: true },
        })
      : Promise.resolve(null),
  ]);

  if (s1TemplateId && !s1Tpl) {
    return NextResponse.json({ error: "Gabarit S1 introuvable" }, { status: 404 });
  }
  if (s2TemplateId && !s2Tpl) {
    return NextResponse.json({ error: "Gabarit S2 introuvable" }, { status: 404 });
  }

  // ─── Détermine les lundis cibles ───
  const baseMonday = new Date(`${weekStart}T00:00:00Z`);
  const targetMondays: { monday: Date; tpl: TemplateWithEntries }[] = [];
  const onlyS1 = !!s1Tpl && !s2Tpl;
  const onlyS2 = !s1Tpl && !!s2Tpl;
  const both = !!s1Tpl && !!s2Tpl;

  // Jour de départ par semaine cible : la SEMAINE AFFICHÉE (celle dont le lundi
  // == baseMonday) démarre au jour affiché (fromDayOfWeek) ; toutes les autres
  // semaines démarrent au lundi (jour 0). Sans fromDayOfWeek → 0 partout
  // (comportement historique : semaine complète).
  const fromDay = fromDayOfWeek ?? 0;
  const startDayFor = (monday: Date): number =>
    monday.getTime() === baseMonday.getTime() ? fromDay : 0;

  if (weeks === 1) {
    // « Cette semaine » : on applique sur la semaine AFFICHÉE, quelle que soit
    // sa parité → permet d'appliquer un S1 sur une semaine S2 et inversement.
    // Deux gabarits → on prend celui de la convention (paire = S1) ; un seul →
    // on l'applique tel quel sur cette semaine.
    const isS1Week = isoWeekNumber(baseMonday) % 2 === 0;
    const tpl = both ? (isS1Week ? s1Tpl! : s2Tpl!) : (s1Tpl ?? s2Tpl)!;
    targetMondays.push({ monday: baseMonday, tpl });
  } else {
    // Multi-semaines : alternance par parité ISO. Convention officine —
    // semaine PAIRE = S1, IMPAIRE = S2 (cf. weekTypeFor, pilote l'en-tête).
    // Cap maximum (filet de sécurité) : 104 semaines calendaires (≈ 2 ans).
    const maxScan = both ? weeks : weeks * 2 + 4;
    let collected = 0;
    for (let i = 0; i < maxScan && collected < weeks; i++) {
      const monday = new Date(baseMonday);
      monday.setUTCDate(monday.getUTCDate() + i * 7);
      const isS1Week = isoWeekNumber(monday) % 2 === 0; // PAIRE = S1

      if (both) {
        targetMondays.push({ monday, tpl: isS1Week ? s1Tpl! : s2Tpl! });
        collected++;
      } else if (onlyS1 && isS1Week) {
        targetMondays.push({ monday, tpl: s1Tpl! });
        collected++;
      } else if (onlyS2 && !isS1Week) {
        targetMondays.push({ monday, tpl: s2Tpl! });
        collected++;
      }
    }
  }

  if (targetMondays.length === 0) {
    return NextResponse.json(
      { error: "Aucune semaine cible trouvée pour les gabarits sélectionnés" },
      { status: 400 }
    );
  }

  // ─── Récupère les collaborateurs actifs (pour filtrage rôle/poste) ───
  const activeEmployees = await prisma.employee.findMany({
    where: { pharmacyId: session.user.pharmacyId, isActive: true },
    select: { id: true, status: true },
  });
  const activeEmpStatus = new Map(
    activeEmployees.map((e) => [e.id, e.status])
  );

  // ─── Récupère les absences APPROVED qui chevauchent la plage cible ───
  // Une absence prime sur le gabarit : si Aurélie est en congé du 9 au 14 fév
  // et qu'on applique S2 sur ces dates, ses créneaux du gabarit doivent être
  // ignorés (sinon on écrase le congé par du COMPTOIR).
  const firstMondayDate = targetMondays[0].monday;
  const lastSatDate = new Date(targetMondays[targetMondays.length - 1].monday);
  lastSatDate.setUTCDate(lastSatDate.getUTCDate() + 5);

  // Si `deleteAbsences=true`, on n'a pas besoin du set : tous les
  // créneaux du gabarit s'appliqueront, et on effacera les absences
  // existantes plus bas.
  const blockedDays = new Set<string>();
  if (!deleteAbsences) {
    const approvedAbsences = await prisma.absenceRequest.findMany({
      where: {
        pharmacyId: session.user.pharmacyId,
        status: "APPROVED",
        // Une absence chevauche la plage si dateStart <= lastSat ET dateEnd >= firstMon
        dateStart: { lte: lastSatDate },
        dateEnd: { gte: firstMondayDate },
      },
      select: { employeeId: true, dateStart: true, dateEnd: true },
    });
    // Set des couples (employeeId|YYYY-MM-DD) bloqués par une absence approuvée
    for (const a of approvedAbsences) {
      const cur = new Date(a.dateStart);
      cur.setUTCHours(0, 0, 0, 0);
      const end = new Date(a.dateEnd);
      end.setUTCHours(0, 0, 0, 0);
      while (cur <= end) {
        blockedDays.add(`${a.employeeId}|${cur.toISOString().slice(0, 10)}`);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }
  }

  // ─── Construit le lot complet d'entries à insérer ───
  type ScheduleEntryRow = {
    pharmacyId: string;
    employeeId: string;
    date: Date;
    timeSlot: string;
    type: ScheduleType;
    taskCode: WeekTemplateEntry["taskCode"];
    absenceCode: WeekTemplateEntry["absenceCode"];
  };
  const data: ScheduleEntryRow[] = [];

  let skippedInactive = 0;
  let skippedIncompatible = 0;
  let skippedAbsence = 0;
  // Set des collaborateurs touchés par une absence + détail jour pour le toast
  const absenceConflicts = new Map<string, Set<string>>();

  for (const { monday, tpl } of targetMondays) {
    const weekDates: Date[] = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      return d;
    });
    // Jour de départ de CETTE semaine (la semaine affichée peut démarrer plus
    // tard que lundi ; les autres démarrent toujours à lundi).
    const startDay = startDayFor(monday);

    for (const e of tpl.entries) {
      // Semaine affichée appliquée « à partir du jour X » → on ignore les jours
      // antérieurs (ex. lundi si l'admin regarde mardi).
      if (e.dayOfWeek < startDay) continue;
      const status = activeEmpStatus.get(e.employeeId);
      if (!status) {
        skippedInactive++;
        continue;
      }
      if (
        e.type === ScheduleType.TASK &&
        e.taskCode &&
        !isTaskAllowed(status, e.taskCode)
      ) {
        skippedIncompatible++;
        continue;
      }

      const date = weekDates[e.dayOfWeek];
      const dateIso = date.toISOString().slice(0, 10);

      // Skip si une absence APPROVED couvre ce (collab, jour). L'absence prime.
      if (blockedDays.has(`${e.employeeId}|${dateIso}`)) {
        skippedAbsence++;
        if (!absenceConflicts.has(e.employeeId)) {
          absenceConflicts.set(e.employeeId, new Set());
        }
        absenceConflicts.get(e.employeeId)!.add(dateIso);
        continue;
      }

      data.push({
        pharmacyId: session.user.pharmacyId,
        employeeId: e.employeeId,
        date,
        timeSlot: e.timeSlot,
        type: e.type,
        taskCode: e.type === ScheduleType.TASK ? e.taskCode : null,
        absenceCode: e.type === ScheduleType.ABSENCE ? e.absenceCode : null,
      });
    }
  }

  // ─── Suppressions optionnelles avant l'insertion ─────────────────────
  //  - overwrite=true       → efface les créneaux TASK existants
  //  - deleteAbsences=true  → efface aussi les créneaux ABSENCE +
  //                            les demandes AbsenceRequest sur la plage
  if ((overwrite || deleteAbsences) && (data.length > 0 || deleteAbsences)) {
    const employeeIdsTouched =
      data.length > 0
        ? Array.from(new Set(data.map((d) => d.employeeId)))
        : Array.from(activeEmpStatus.keys());
    const firstMonday = targetMondays[0].monday;
    // Borne basse RÉELLE de la plage effacée : si la 1ʳᵉ semaine démarre plus
    // tard que lundi (jour affiché), on n'efface pas les jours antérieurs. La
    // plage [deleteStart .. lastSaturday] est contiguë : 1ʳᵉ semaine à partir du
    // jour affiché, semaines suivantes en entier.
    const deleteStart = new Date(firstMonday);
    deleteStart.setUTCDate(firstMonday.getUTCDate() + startDayFor(firstMonday));
    const lastMonday = targetMondays[targetMondays.length - 1].monday;
    const lastSaturday = new Date(lastMonday);
    lastSaturday.setUTCDate(lastMonday.getUTCDate() + 5);

    // Type(s) de créneaux à supprimer selon les flags
    const typesToDelete: ScheduleType[] = [];
    if (overwrite) typesToDelete.push(ScheduleType.TASK);
    if (deleteAbsences) typesToDelete.push(ScheduleType.ABSENCE);

    if (typesToDelete.length > 0) {
      await prismaDirect.scheduleEntry.deleteMany({
        where: {
          pharmacyId: session.user.pharmacyId,
          employeeId: { in: employeeIdsTouched },
          date: { gte: deleteStart, lte: lastSaturday },
          type: { in: typesToDelete },
        },
      });
    }

    // En plus, suppression des demandes AbsenceRequest qui chevauchent
    // la plage cible — sinon elles reviendraient à la prochaine
    // approbation/recompute.
    if (deleteAbsences) {
      await prismaDirect.absenceRequest.deleteMany({
        where: {
          pharmacyId: session.user.pharmacyId,
          dateStart: { lte: lastSaturday },
          dateEnd: { gte: deleteStart },
        },
      });
    }
  }

  // ─── Compte les créneaux réellement NOUVEAUX vs PRÉSERVÉS ────────────
  // Sans écrasement, `skipDuplicates` préserve silencieusement les cases déjà
  // occupées → on interroge les positions ciblées AVANT insertion pour un
  // message honnête (« X nouveaux, Y préservés »). Avec écrasement, le
  // deleteMany a déjà vidé la plage → tout est nouveau.
  let inserted = data.length;
  let preserved = 0;
  if (!overwrite && data.length > 0) {
    const firstMonday = targetMondays[0].monday;
    const lastMonday = targetMondays[targetMondays.length - 1].monday;
    const lastSat = new Date(lastMonday);
    lastSat.setUTCDate(lastMonday.getUTCDate() + 5);
    const empIds = Array.from(new Set(data.map((d) => d.employeeId)));
    const existing = await prismaDirect.scheduleEntry.findMany({
      where: {
        pharmacyId: session.user.pharmacyId,
        employeeId: { in: empIds },
        date: { gte: firstMonday, lte: lastSat },
      },
      select: { employeeId: true, date: true, timeSlot: true },
    });
    const existKeys = new Set(
      existing.map(
        (e) => `${e.employeeId}|${e.date.toISOString().slice(0, 10)}|${e.timeSlot}`
      )
    );
    preserved = data.filter((d) =>
      existKeys.has(
        `${d.employeeId}|${d.date.toISOString().slice(0, 10)}|${d.timeSlot}`
      )
    ).length;
    inserted = data.length - preserved;
  }

  // ─── Insertion en chunks via la connexion DIRECTE (pas pgbouncer) ────
  // pgbouncer en mode transaction (port 6543) ajoute ~12-20s par INSERT
  // chunk pour des raisons obscures (overhead prepared statements + pool
  // saturation). En passant par DIRECT_URL (port 5432), on a une vraie
  // connexion Postgres dédiée et les inserts retombent à ~100-300ms par
  // chunk de 8000 rows.
  //
  // Limite Postgres : 65535 params par INSERT / 7 cols → 9362 rows max.
  // On prend 8000 par sécurité.
  const CHUNK = 8000;
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK);
    await prismaDirect.scheduleEntry.createMany({
      data: chunk,
      // Si overwrite=true, on a déjà fait deleteMany → aucun conflit possible,
      // skipDuplicates inutile. Sinon le ON CONFLICT préserve les modifs
      // manuelles existantes.
      skipDuplicates: !overwrite,
    });
  }

  // Détail des collaborateurs touchés par une absence — sert à informer
  // l'admin "X était absent du Y au Z, ses créneaux n'ont pas été appliqués".
  const empById = new Map(activeEmployees.map((e) => [e.id, e]));
  const empNames = await prisma.employee.findMany({
    where: { id: { in: Array.from(absenceConflicts.keys()) } },
    select: { id: true, firstName: true },
  });
  const namesById = new Map(empNames.map((e) => [e.id, e.firstName]));
  const absenceConflictsList = Array.from(absenceConflicts.entries()).map(
    ([empId, dates]) => ({
      employeeId: empId,
      employeeName: namesById.get(empId) ?? "?",
      days: dates.size,
    })
  );
  void empById;

  // Invalide le cache de toutes les semaines de la pharmacie — apply-batch
  // touche typiquement 4-26 semaines, on prend le tag global pour simplifier.
  revalidateTag(DASHBOARD_CACHE_TAGS.planningAll(session.user.pharmacyId));

  return NextResponse.json({
    ok: true,
    weeksApplied: targetMondays.length,
    applied: data.length,
    inserted, // créneaux réellement nouveaux
    preserved, // créneaux déjà présents, non remplacés (sans « écraser »)
    skippedInactive,
    skippedIncompatible,
    skippedAbsence,
    absenceConflicts: absenceConflictsList,
    s1Name: s1Tpl?.name ?? null,
    s2Name: s2Tpl?.name ?? null,
  });
}
