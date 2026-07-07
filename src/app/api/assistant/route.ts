import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { isAdminLevel } from "@/lib/permissions";
import { buildSystemPrompt, GROQ_MODEL } from "@/lib/assistant/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/assistant — assistant IA « Pilou » (guide d'utilisation).
 *
 * Étape 1 : conversation d'AIDE (explique / guide), ancrée sur le guide
 * PharmaPlanning. Pas encore d'actions (elles viendront avec confirmation +
 * respect des droits). La clé Groq reste 100% côté serveur.
 */
const input = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      })
    )
    .min(1)
    .max(30),
});

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

async function POST__impl(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "assistant_unconfigured",
        reply:
          "L'assistant n'est pas encore activé (clé Groq manquante côté serveur). Préviens ton titulaire.",
      },
      { status: 200 }
    );
  }

  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const system = buildSystemPrompt({
    name: session.user.name,
    role: session.user.role,
    isAdmin: isAdminLevel(session.user.role),
    hasEmployee: !!session.user.employeeId,
  });

  // On borne l'historique aux 12 derniers tours pour limiter les tokens.
  const history = parsed.data.messages.slice(-12);

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.3,
        max_tokens: 700,
        messages: [{ role: "system", content: system }, ...history],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[assistant] Groq error", res.status, detail.slice(0, 300));
      return NextResponse.json(
        {
          reply:
            "Désolé, je n'ai pas pu répondre à l'instant. Réessaie dans quelques secondes.",
        },
        { status: 200 }
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply =
      data.choices?.[0]?.message?.content?.trim() ||
      "Je n'ai pas de réponse pour ça. Reformule ou demande à ton titulaire.";

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json(
      {
        reply:
          "Désolé, la connexion a échoué. Vérifie ta connexion et réessaie.",
      },
      { status: 200 }
    );
  }
}

export const POST = withErrorHandling(POST__impl);
