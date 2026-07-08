import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toIsoDate } from "@/lib/planning-utils";
import { TEAM_EVENT_LABEL } from "@/lib/team-event-style";
import { sendEventReminderEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/daily-reminders
 *
 * Rappel quotidien : pour chaque pharmacie, s'il y a un ou plusieurs événements
 * d'équipe DEMAIN, envoie un email de rappel à l'équipe (comptes actifs
 * approuvés). Déclenché par Vercel Cron (cf. vercel.json). Protégé par
 * CRON_SECRET si défini. Best-effort (skip propre si aucun fournisseur email).
 */
function baseUrl(): string {
  const v = process.env.NEXTAUTH_URL?.trim();
  if (v) return v.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // « Demain » en UTC (les dates d'événement sont stockées à minuit UTC).
  const tomorrow = new Date(Date.now() + 86_400_000);
  const iso = toIsoDate(tomorrow);
  const from = new Date(`${iso}T00:00:00.000Z`);
  const to = new Date(`${iso}T23:59:59.999Z`);
  const dateLabel =
    "demain, " +
    new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  const url = `${baseUrl()}/accueil`;

  const pharmacies = await prisma.pharmacy.findMany({ select: { id: true, name: true } });

  let sent = 0;
  for (const ph of pharmacies) {
    const events = await prisma.teamEvent.findMany({
      where: { pharmacyId: ph.id, date: { gte: from, lte: to } },
      orderBy: { time: "asc" },
      select: { title: true, time: true, location: true, type: true },
    });
    if (events.length === 0) continue;

    const recipients = await prisma.user.findMany({
      where: { pharmacyId: ph.id, status: "APPROVED", isActive: true },
      select: { email: true },
    });
    const emails = recipients.map((r) => r.email).filter(Boolean);
    if (emails.length === 0) continue;

    try {
      await sendEventReminderEmail({
        to: emails,
        pharmacyName: ph.name,
        dateLabel,
        url,
        events: events.map((e) => ({
          title: e.title,
          timeLabel: e.time ? `${e.time}` : null,
          location: e.location,
          typeLabel: TEAM_EVENT_LABEL[e.type],
        })),
      });
      sent++;
    } catch {
      /* best-effort */
    }
  }

  return NextResponse.json({ ok: true, day: iso, pharmaciesNotified: sent });
}
