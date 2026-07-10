import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditPlanning } from "@/lib/permissions";
import { sendPushToUsers } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("vote"), choice: z.string().min(1) }),
  z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("reopen") }),
  z.object({ action: z.literal("remind") }),
]);

type Ctx = { params: { id: string } };

/**
 * Actions sur un sondage :
 *  - "vote" : un collaborateur (avec profil Employee) répond en un tap ; il peut
 *    changer d'avis tant que le sondage est OPEN (upsert de son vote).
 *  - "close" / "reopen" : manageur+.
 */
async function PATCH__impl(req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const poll = await prisma.poll.findFirst({
    where: { id: params.id, pharmacyId: session.user.pharmacyId },
    select: { id: true, status: true, options: true, question: true },
  });
  if (!poll) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const body = parsed.data;

  if (body.action === "vote") {
    const employeeId = session.user.employeeId;
    if (!employeeId) {
      return NextResponse.json(
        { error: "Ton compte n'est pas rattaché à un profil de l'équipe." },
        { status: 400 }
      );
    }
    if (poll.status !== "OPEN") {
      return NextResponse.json({ error: "Ce sondage est clôturé." }, { status: 409 });
    }
    if (!poll.options.includes(body.choice)) {
      return NextResponse.json({ error: "Choix invalide." }, { status: 400 });
    }
    await prisma.pollVote.upsert({
      where: { pollId_employeeId: { pollId: poll.id, employeeId } },
      create: { pollId: poll.id, employeeId, choice: body.choice },
      update: { choice: body.choice },
    });
    return NextResponse.json({ ok: true });
  }

  // close / reopen / remind → manageur+
  if (!canEditPlanning(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Relance : notifie (push) les collaborateurs actifs qui n'ont PAS voté.
  if (body.action === "remind") {
    const votes = await prisma.pollVote.findMany({
      where: { pollId: poll.id },
      select: { employeeId: true },
    });
    const votedEmp = votes.map((v) => v.employeeId);
    const nonVoters = await prisma.employee.findMany({
      where: {
        pharmacyId: session.user.pharmacyId,
        isActive: true,
        id: { notIn: votedEmp },
      },
      select: { user: { select: { id: true } } },
    });
    const nonVoterUserIds = nonVoters
      .map((e) => e.user?.id)
      .filter((v): v is string => !!v);
    const { sent } = await sendPushToUsers(nonVoterUserIds, {
      title: "🗳️ Un sondage attend ta réponse",
      body: poll.question,
      url: "/sondages",
      tag: `poll-${poll.id}`,
    });
    return NextResponse.json({ ok: true, reminded: nonVoterUserIds.length, sent });
  }

  await prisma.poll.update({
    where: { id: poll.id },
    data: { status: body.action === "close" ? "CLOSED" : "OPEN" },
  });
  return NextResponse.json({ ok: true });
}

async function DELETE__impl(_req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canEditPlanning(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await prisma.poll.deleteMany({
    where: { id: params.id, pharmacyId: session.user.pharmacyId },
  });
  return NextResponse.json({ ok: true });
}

export const PATCH = withErrorHandling(PATCH__impl);
export const DELETE = withErrorHandling(DELETE__impl);
