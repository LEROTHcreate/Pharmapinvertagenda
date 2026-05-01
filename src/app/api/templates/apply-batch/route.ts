import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma, prismaDirect } from "@/lib/prisma";
import { applyBatchInput } from "@/validators/template";
import { ScheduleType, type WeekTemplate, type WeekTemplateEntry } from "@prisma/client";
import { isTaskAllowed } from "@/lib/role-task-rules";

export const runtime = "nodejs";
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
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
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
  const { s1TemplateId, s2TemplateId, weekStart, weeks, overwrite, deleteAbsences } =
    parsed.data;

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

  // On parcourt assez de semaines calendaires pour couvrir N semaines de
  // chaque type — ou N consécutives si les deux gabarits sont fournis.
  // Cap maximum (filet de sécurité) : 104 semaines calendaires (≈ 2 ans).
  const maxScan = both ? weeks : weeks * 2 + 4;
  let collected = 0;
  for (let i = 0; i < maxScan && collected < weeks; i++) {
    const monday = new Date(baseMonday);
    monday.setUTCDate(monday.getUTCDate() + i * 7);
    const isOdd = isoWeekNumber(monday) % 2 === 1; // S1 = impaire

    if (both) {
      const tpl = isOdd ? s1Tpl! : s2Tpl!;
      targetMondays.push({ monday, tpl });
      collected++;
    } else if (onlyS1 && isOdd) {
      targetMondays.push({ monday, tpl: s1Tpl! });
      collected++;
    } else if (onlyS2 && !isOdd) {
      targetMondays.push({ monday, tpl: s2Tpl! });
      collected++;
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

    for (const e of tpl.entries) {
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
    const lastMonday = targetMondays[targetMondays.length - 1].monday;
    const lastSaturday = new Date(lastMonday);
    lastSaturday.setUTCDate(lastMonday.getUTCDate() + 5);

    // Type(s) de créneaux à supprimer selon les flags
    const typesToDelete: ScheduleType[] = [];
    if (overwrite) typesToDelete.push(ScheduleType.TASK);
    if (deleteAbsences) typesToDelete.push(ScheduleType.ABSENCE);

    if (typesToDelete.length > 0) {
      console.time(`[apply-batch] deleteMany scheduleEntry`);
      await prismaDirect.scheduleEntry.deleteMany({
        where: {
          pharmacyId: session.user.pharmacyId,
          employeeId: { in: employeeIdsTouched },
          date: { gte: firstMonday, lte: lastSaturday },
          type: { in: typesToDelete },
        },
      });
      console.timeEnd(`[apply-batch] deleteMany scheduleEntry`);
    }

    // En plus, suppression des demandes AbsenceRequest qui chevauchent
    // la plage cible — sinon elles reviendraient à la prochaine
    // approbation/recompute.
    if (deleteAbsences) {
      console.time(`[apply-batch] deleteMany absenceRequest`);
      await prismaDirect.absenceRequest.deleteMany({
        where: {
          pharmacyId: session.user.pharmacyId,
          dateStart: { lte: lastSaturday },
          dateEnd: { gte: firstMonday },
        },
      });
      console.timeEnd(`[apply-batch] deleteMany absenceRequest`);
    }
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
  console.time(`[apply-batch] insert ${data.length} rows`);
  const CHUNK = 8000;
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK);
    const label = `[apply-batch] chunk ${Math.floor(i / CHUNK) + 1} (${chunk.length} rows)`;
    console.time(label);
    await prismaDirect.scheduleEntry.createMany({
      data: chunk,
      // Si overwrite=true, on a déjà fait deleteMany → aucun conflit possible,
      // skipDuplicates inutile. Sinon le ON CONFLICT préserve les modifs
      // manuelles existantes.
      skipDuplicates: !overwrite,
    });
    console.timeEnd(label);
  }
  console.timeEnd(`[apply-batch] insert ${data.length} rows`);

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

  return NextResponse.json({
    ok: true,
    weeksApplied: targetMondays.length,
    applied: data.length,
    skippedInactive,
    skippedIncompatible,
    skippedAbsence,
    absenceConflicts: absenceConflictsList,
    s1Name: s1Tpl?.name ?? null,
    s2Name: s2Tpl?.name ?? null,
  });
}
