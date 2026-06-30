import { withErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { buildICalendar, entriesToShifts } from "@/lib/ical";
import { toIsoDate } from "@/lib/planning-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ical/[token]
 *
 * Flux iCalendar PRIVÉ du planning d'un salarié. Le jeton (User.icalToken)
 * fait office d'authentification : il est non devinable et révocable. Pas de
 * session requise → un agenda (Google/Apple) peut s'y abonner directement.
 *
 * Renvoie les créneaux travaillés de J-14 à J+60.
 */
async function GET__impl(
  _req: Request,
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

  const calName = `Planning — ${user.pharmacy?.name ?? "Pharmacie"}`;
  const location = user.pharmacy?.name ?? "Pharmacie";

  let shifts: ReturnType<typeof entriesToShifts> = [];
  if (user.employeeId) {
    const now = new Date();
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - 14);
    const to = new Date(now);
    to.setUTCDate(to.getUTCDate() + 60);

    const entries = await prisma.scheduleEntry.findMany({
      where: {
        employeeId: user.employeeId,
        type: "TASK",
        date: { gte: from, lte: to },
      },
      select: { date: true, timeSlot: true, type: true },
    });
    shifts = entriesToShifts(
      entries.map((e) => ({
        date: toIsoDate(e.date),
        timeSlot: e.timeSlot,
        type: e.type,
      }))
    );
  }

  const stamp =
    new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = buildICalendar({ calName, location, shifts, stamp });

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
