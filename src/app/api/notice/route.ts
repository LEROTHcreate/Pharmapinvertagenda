import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { isAdminLevel } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sendDailyNoticeEmail } from "@/lib/email";

function baseUrl(): string {
  const v = process.env.NEXTAUTH_URL?.trim();
  if (v) return v.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mémo du jour / consigne d'officine (bandeau app-wide).
 *  GET   → { text, at } la consigne courante (tous les utilisateurs connectés).
 *  PATCH → { text } pose/met à jour la consigne (admin) ; texte vide = efface.
 */
async function GET__impl() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: session.user.pharmacyId },
    select: { dailyNotice: true, dailyNoticeAt: true },
  });
  return NextResponse.json({
    text: pharmacy?.dailyNotice ?? null,
    at: pharmacy?.dailyNoticeAt ? pharmacy.dailyNoticeAt.toISOString() : null,
  });
}

const patchSchema = z.object({ text: z.string().max(280).nullish() });

async function PATCH__impl(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminLevel(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const text = parsed.data.text?.trim() || null;

  // Ancienne valeur → on ne notifie que si la consigne CHANGE réellement (évite
  // de spammer l'équipe sur une sauvegarde à l'identique).
  const prev = await prisma.pharmacy.findUnique({
    where: { id: session.user.pharmacyId },
    select: { dailyNotice: true, name: true },
  });

  await prisma.pharmacy.update({
    where: { id: session.user.pharmacyId },
    data: { dailyNotice: text, dailyNoticeAt: text ? new Date() : null },
  });

  // Notification e-mail à l'équipe (best-effort) quand une NOUVELLE consigne
  // non vide est posée et qu'elle diffère de la précédente. On exclut l'auteur.
  if (text && text !== prev?.dailyNotice) {
    void (async () => {
      try {
        const recipients = await prisma.user.findMany({
          where: {
            pharmacyId: session.user.pharmacyId,
            status: "APPROVED",
            isActive: true,
            id: { not: session.user.id },
          },
          select: { email: true },
        });
        const emails = recipients.map((r) => r.email).filter(Boolean);
        await sendDailyNoticeEmail({
          to: emails,
          pharmacyName: prev?.name ?? "votre officine",
          text,
          planningUrl: `${baseUrl()}/planning`,
        });
      } catch {
        /* best-effort : l'échec e-mail ne bloque pas la pose de consigne */
      }
    })();
  }

  return NextResponse.json({ ok: true, text, at: new Date().toISOString() });
}

export const GET = withErrorHandling(GET__impl);
export const PATCH = withErrorHandling(PATCH__impl);
