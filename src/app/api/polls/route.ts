import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditPlanning } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  question: z.string().trim().min(3).max(200),
  options: z.array(z.string().trim().min(1).max(60)).min(2).max(6),
  closesAt: z.string().datetime().nullish(),
});

/**
 * Sondage express. GET : liste des sondages avec résultats (comptes) + mon
 * vote ; les noms des votants ne sont renvoyés qu'aux manageurs+. POST : crée
 * un sondage (manageur+).
 */
async function GET__impl() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const canManage = canEditPlanning(session.user.role);
  const myEmployeeId = session.user.employeeId ?? null;

  const [polls, activeEmployees] = await Promise.all([
    prisma.poll.findMany({
      where: { pharmacyId: session.user.pharmacyId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 40,
      include: {
        votes: {
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, displayColor: true } },
          },
        },
      },
    }),
    // Roster actif — pour la participation (X/N) et la relance des non-votants.
    prisma.employee.findMany({
      where: { pharmacyId: session.user.pharmacyId, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, displayColor: true },
    }),
  ]);

  const teamSize = activeEmployees.length;

  return NextResponse.json({
    canManage,
    teamSize,
    polls: polls.map((p) => {
      const counts: Record<string, number> = {};
      for (const o of p.options) counts[o] = 0;
      const voters: Record<string, Array<{ id: string; name: string; color: string }>> = {};
      for (const o of p.options) voters[o] = [];
      let myChoice: string | null = null;
      const votedIds = new Set<string>();
      for (const v of p.votes) {
        if (counts[v.choice] === undefined) counts[v.choice] = 0;
        counts[v.choice]++;
        votedIds.add(v.employeeId);
        (voters[v.choice] ??= []).push({
          id: v.employee.id,
          name: `${v.employee.firstName} ${v.employee.lastName}`.trim(),
          color: v.employee.displayColor,
        });
        if (myEmployeeId && v.employeeId === myEmployeeId) myChoice = v.choice;
      }
      // Non-votants (roster actif − votants) — pour la relance (responsables).
      const nonVoters = activeEmployees
        .filter((e) => !votedIds.has(e.id))
        .map((e) => ({
          id: e.id,
          name: `${e.firstName} ${e.lastName}`.trim(),
          color: e.displayColor,
        }));
      return {
        id: p.id,
        question: p.question,
        options: p.options,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        closesAt: p.closesAt?.toISOString() ?? null,
        totalVotes: p.votes.length,
        counts,
        // Les noms ne sont exposés qu'aux responsables (résultat détaillé).
        voters: canManage ? voters : null,
        nonVoters: canManage ? nonVoters : null,
        myChoice,
      };
    }),
  });
}

async function POST__impl(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canEditPlanning(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Question et 2 à 6 choix requis." }, { status: 400 });
  }
  // Dédoublonne les options en préservant l'ordre.
  const options = Array.from(new Set(parsed.data.options.map((o) => o.trim()).filter(Boolean)));
  if (options.length < 2) {
    return NextResponse.json({ error: "Au moins 2 choix distincts." }, { status: 400 });
  }

  const poll = await prisma.poll.create({
    data: {
      pharmacyId: session.user.pharmacyId,
      question: parsed.data.question,
      options,
      closesAt: parsed.data.closesAt ? new Date(parsed.data.closesAt) : null,
      createdById: session.user.id,
    },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: poll.id });
}

export const GET = withErrorHandling(GET__impl);
export const POST = withErrorHandling(POST__impl);
