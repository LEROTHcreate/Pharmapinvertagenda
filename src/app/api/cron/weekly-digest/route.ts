import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfWeek, weekDays, toIsoDate } from "@/lib/planning-utils";
import { TASK_LABELS, SLOT_HOURS, WEEK_DAYS } from "@/types";
import type { TaskCode } from "@prisma/client";
import { sendWeeklyDigestEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/weekly-digest
 *
 * Envoie à chaque salarié (compte actif approuvé) son planning de la SEMAINE
 * SUIVANTE par email. Déclenché par Vercel Cron le vendredi (cf. vercel.json).
 * N'envoie qu'aux salariés qui ont au moins un créneau la semaine prochaine
 * (pas de mail « repos toute la semaine »). Protégé par CRON_SECRET si défini.
 */
function addMin(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Compacte les créneaux d'un jour (même poste, contigus) → « 09:00–12:30 Comptoir ». */
function dayBlocks(slots: { timeSlot: string; taskCode: TaskCode | null }[]): string[] {
  const sorted = [...slots].sort((a, b) =>
    a.timeSlot < b.timeSlot ? -1 : a.timeSlot > b.timeSlot ? 1 : 0
  );
  const out: string[] = [];
  let cur: { start: string; prev: string; code: TaskCode | null } | null = null;
  for (const s of sorted) {
    const contiguous =
      cur !== null && addMin(cur.prev, 30) === s.timeSlot && cur.code === s.taskCode;
    if (cur && !contiguous) {
      out.push(fmtBlock(cur));
      cur = null;
    }
    if (!cur) cur = { start: s.timeSlot, prev: s.timeSlot, code: s.taskCode };
    else cur.prev = s.timeSlot;
  }
  if (cur) out.push(fmtBlock(cur));
  return out;
}
function fmtBlock(cur: { start: string; prev: string; code: TaskCode | null }): string {
  const label = cur.code ? TASK_LABELS[cur.code] : "Poste";
  return `${cur.start}–${addMin(cur.prev, 30)} · ${label}`;
}

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

  // Semaine SUIVANTE (lundi → samedi).
  const nextMonday = startOfWeek(new Date(Date.now() + 7 * 86_400_000));
  const days = weekDays(nextMonday);
  const dayIsos = days.map(toIsoDate);
  const from = new Date(`${dayIsos[0]}T00:00:00Z`);
  const to = new Date(`${dayIsos[5]}T23:59:59Z`);
  const weekLabel = `du ${labelDay(dayIsos[0])} au ${labelDay(dayIsos[5])}`;
  const planningUrl = `${baseUrl()}/planning`;

  const pharmacies = await prisma.pharmacy.findMany({ select: { id: true, name: true } });

  let sent = 0;
  for (const ph of pharmacies) {
    const [employees, entries] = await Promise.all([
      prisma.employee.findMany({
        where: {
          pharmacyId: ph.id,
          isActive: true,
          user: { is: { status: "APPROVED", isActive: true } },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          user: { select: { email: true } },
        },
      }),
      prisma.scheduleEntry.findMany({
        where: { pharmacyId: ph.id, type: "TASK", date: { gte: from, lte: to } },
        select: { employeeId: true, date: true, timeSlot: true, taskCode: true },
      }),
    ]);

    // Regroupe les créneaux par employé → par jour (ISO).
    const byEmp = new Map<string, Map<string, { timeSlot: string; taskCode: TaskCode | null }[]>>();
    for (const e of entries) {
      const iso = toIsoDate(e.date);
      let m = byEmp.get(e.employeeId);
      if (!m) byEmp.set(e.employeeId, (m = new Map()));
      const arr = m.get(iso) ?? [];
      arr.push({ timeSlot: e.timeSlot, taskCode: e.taskCode });
      m.set(iso, arr);
    }

    const jobs: Promise<void>[] = [];
    for (const emp of employees) {
      const email = emp.user?.email;
      if (!email) continue;
      const perDay = byEmp.get(emp.id);
      if (!perDay || perDay.size === 0) continue; // pas planifié → pas de mail

      let totalSlots = 0;
      const daysOut = dayIsos.map((iso, i) => {
        const slots = perDay.get(iso) ?? [];
        totalSlots += slots.length;
        return { label: WEEK_DAYS[i], blocks: dayBlocks(slots) };
      });
      if (totalSlots === 0) continue;

      jobs.push(
        sendWeeklyDigestEmail({
          to: email,
          name: `${emp.firstName} ${emp.lastName}`.trim(),
          pharmacyName: ph.name,
          weekLabel,
          days: daysOut,
          totalHours: totalSlots * SLOT_HOURS,
          planningUrl,
        })
      );
    }
    const results = await Promise.allSettled(jobs);
    sent += results.filter((r) => r.status === "fulfilled").length;
  }

  return NextResponse.json({ ok: true, sent, week: dayIsos[0] });
}

/** « 14 juillet » à partir d'un ISO YYYY-MM-DD. */
function labelDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });
}
