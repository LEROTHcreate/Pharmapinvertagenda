import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/keepalive
 *
 * Anti-pause Supabase : le plan gratuit met la base en VEILLE après ~7 jours
 * d'inactivité → au réveil, la 1re requête time-out et le site/login renvoie
 * des 500 (cold-start). Un simple `SELECT 1` quotidien suffit à réinitialiser
 * le compteur d'inactivité et garder la base chaude.
 *
 * Déclenché par Vercel Cron (cf. vercel.json). Vercel ajoute automatiquement
 * l'en-tête `Authorization: Bearer <CRON_SECRET>` si la variable CRON_SECRET
 * est définie. On la vérifie quand elle existe pour empêcher tout déclenchement
 * externe ; sinon (non configurée) on laisse passer — l'endpoint ne fait qu'un
 * ping read-only sans donnée sensible.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, ms: Date.now() - start });
  } catch (e) {
    // La base était probablement en train de se réveiller : on le signale
    // (502) pour que le monitoring le voie, mais le ping a "touché" la base,
    // ce qui amorce déjà le réveil pour les requêtes suivantes.
    console.error("[keepalive] ping BDD échoué:", e);
    return NextResponse.json(
      { ok: false, ms: Date.now() - start },
      { status: 502 }
    );
  }
}
