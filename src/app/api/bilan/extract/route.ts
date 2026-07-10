import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canViewPayroll } from "@/lib/payroll-permissions";
import { extractBilanFigures, extractBilanFiguresFromImage } from "@/lib/bilan-ai";
import type { BilanData } from "@/lib/bilan-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bilan/extract
 *  - multipart/form-data avec `file` (PDF) → on extrait le texte puis les postes.
 *  - ou JSON { text } (texte collé) → extraction directe.
 * Renvoie { data: { cle: montant } } pré-rempli par l'IA.
 */
async function POST__impl(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, employeeId: true, canAccessPayroll: true, employee: { select: { status: true } } },
  });
  const allowed =
    me &&
    canViewPayroll({
      role: me.role,
      employeeId: me.employeeId,
      canAccessPayroll: me.canAccessPayroll,
      employeeStatus: me.employee?.status ?? null,
    });
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const contentType = req.headers.get("content-type") ?? "";
  let text = "";
  let sourceName: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 15 Mo)." }, { status: 400 });
    }
    sourceName = file.name;
    const lower = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || lower.endsWith(".pdf");
    const isImage =
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/.test(lower);

    // ── Image (photo/scan) → lecture directe par le modèle vision (OCR + extraction).
    if (isImage) {
      const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      const mime = file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";
      const data: BilanData = await extractBilanFiguresFromImage(`data:${mime};base64,${b64}`);
      return NextResponse.json({ data, sourceName, found: Object.keys(data).length, mode: "image" });
    }

    if (!isPdf) {
      return NextResponse.json(
        { error: "Format non pris en charge. Dépose un PDF, une photo/scan (JPG, PNG…) ou colle le texte." },
        { status: 400 }
      );
    }
    // ── PDF : on tente d'abord la couche texte (rapide, fiable si numérique).
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const buf = new Uint8Array(await file.arrayBuffer());
      const pdf = await getDocumentProxy(buf);
      const { text: t } = await extractText(pdf, { mergePages: true });
      text = Array.isArray(t) ? t.join("\n") : t;
    } catch {
      return NextResponse.json(
        { error: "Lecture du PDF impossible. Fais une photo de la page ou colle le texte." },
        { status: 422 }
      );
    }
    if (text.trim().length < 20) {
      return NextResponse.json(
        {
          error:
            "Ce PDF ne contient pas de texte (scan image). Fais une photo/capture de la page et dépose-la comme image, ou colle le texte.",
        },
        { status: 422 }
      );
    }
  } else {
    const body = await req.json().catch(() => null);
    text = typeof (body as { text?: string } | null)?.text === "string" ? (body as { text: string }).text : "";
  }

  text = text.trim();
  if (text.length < 20) {
    return NextResponse.json(
      { error: "Texte insuffisant pour extraire des données. Vérifie le document." },
      { status: 400 }
    );
  }

  const data = await extractBilanFigures(text);
  return NextResponse.json({ data, sourceName, found: Object.keys(data).length, mode: "text" });
}

export const POST = withErrorHandling(POST__impl);
