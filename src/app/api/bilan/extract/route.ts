import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canViewPayroll } from "@/lib/payroll-permissions";
import { extractBilanFigures } from "@/lib/bilan-ai";

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
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json(
        {
          error:
            "Seuls les PDF avec texte sont lus automatiquement. Pour une photo/scan image, colle le texte du bilan.",
        },
        { status: 400 }
      );
    }
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const buf = new Uint8Array(await file.arrayBuffer());
      const pdf = await getDocumentProxy(buf);
      const { text: t } = await extractText(pdf, { mergePages: true });
      text = Array.isArray(t) ? t.join("\n") : t;
    } catch {
      return NextResponse.json(
        { error: "Lecture du PDF impossible (peut-être un scan image sans texte). Colle le texte à la place." },
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
  return NextResponse.json({ data, sourceName, found: Object.keys(data).length });
}

export const POST = withErrorHandling(POST__impl);
