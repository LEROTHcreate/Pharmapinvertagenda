import { withErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { buildICalendar, entriesToShifts } from "@/lib/ical";
import { toIsoDate } from "@/lib/planning-utils";
import { ABSENCE_LABELS } from "@/types";
import type { AbsenceCode } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ical/[token]
 *
 * Flux iCalendar PRIVÉ du planning d'UN salarié (le jeton = son User.icalToken,
 * lié à un seul employeeId → jamais les créneaux des collègues). Non devinable,
 * révocable, pas de session requise → un agenda (Google/Apple) s'y abonne.
 *
 * Options (query, choisies à l'abonnement) :
 *   months=1|2|3   fenêtre en avant (défaut 2)
 *   past=0|1       inclure ~2 semaines d'historique (défaut 1)
 *   absences=0|1   inclure aussi congés/maladie/formation (défaut 0)
 */
async function GET__impl(
  req: Request,
  { params }: { params: { token: string } }
) {
  const token = params.token?.replace(/\.ics$/, "");
  if (!token || token.length < 16) {
    return new Response("Not found", { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { icalToken: token },
    select: {
      employeeId: true,
      pharmacy: { select: { name: true } },
    },
  });
  if (!user) {
    return new Response("Not found", { status: 404 });
  }

  // ─── Options depuis l'URL d'abonnement ───────────────────────────
  const sp = new URL(req.url).searchParams;
  const monthsRaw = Number(sp.get("months"));
  const months = [1, 2, 3].includes(monthsRaw) ? monthsRaw : 2;
  const includePast = sp.get("past") !== "0"; // défaut : oui
  const includeAbsences = sp.get("absences") === "1";

  const calName = `Planning — ${user.pharmacy?.name ?? "Pharmacie"}`;
  const location = user.pharmacy?.name ?? "Pharmacie";

  let shifts: ReturnType<typeof entriesToShifts> = [];
  if (user.employeeId) {
    const now = new Date();
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - (includePast ? 14 : 0));
    const to = new Date(now);
    to.setUTCDate(to.getUTCDate() + months * 31);

    const entries = await prisma.scheduleEntry.findMany({
      where: {
        employeeId: user.employeeId,
        date: { gte: from, lte: to },
        ...(includeAbsences ? {} : { type: "TASK" }),
      },
      select: { date: true, timeSlot: true, type: true, absenceCode: true },
    });
    shifts = entriesToShifts(
      entries.map((e) => ({
        date: toIsoDate(e.date),
        timeSlot: e.timeSlot,
        type: e.type,
        absenceCode: e.absenceCode,
      })),
      includeAbsences
    );
  }

  const stamp =
    new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = buildICalendar({
    calName,
    location,
    shifts,
    stamp,
    // Titre : créneau de travail → nom du calendrier ; absence → son libellé.
    summaryFor: (s) =>
      s.type === "ABSENCE" && s.absenceCode
        ? ABSENCE_LABELS[s.absenceCode as AbsenceCode] ?? "Absence"
        : calName,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="planning.ics"',
      "cache-control": "private, max-age=3600",
    },
  });
}

export const GET = withErrorHandling(GET__impl);
