import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { isAdminLevel } from "@/lib/permissions";
import { buildSystemPrompt, GROQ_MODEL } from "@/lib/assistant/knowledge";
import {
  getToolsForUser,
  executeTool,
  actionSummary,
  WRITE_TOOLS,
  type ToolUser,
} from "@/lib/assistant/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/assistant — assistant IA « Hygie ».
 *
 * Deux modes selon le corps :
 *  - { messages } : tour de conversation. On appelle Groq avec les outils
 *    autorisés pour le rôle. Un outil de LECTURE est exécuté puis le résultat
 *    est renvoyé au modèle. Un outil d'ÉCRITURE n'est PAS exécuté : on renvoie
 *    au client une `pendingAction` à confirmer.
 *  - { confirm } : l'utilisateur a confirmé une action → on l'exécute (droits
 *    RE-VÉRIFIÉS côté serveur).
 */
const msg = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});
const input = z.object({
  messages: z.array(msg).min(1).max(30).optional(),
  confirm: z
    .object({ tool: z.string(), args: z.record(z.string(), z.unknown()) })
    .optional(),
});

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

async function callGroq(
  apiKey: string,
  body: Record<string, unknown>
): Promise<{
  content: string | null;
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
} | null> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[assistant] Groq", res.status, detail.slice(0, 300));
    return null;
  }
  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
    }>;
  };
  const m = data.choices?.[0]?.message;
  const toolCalls = (m?.tool_calls ?? []).map((tc) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments || "{}");
    } catch {
      /* args illisibles → objet vide */
    }
    return { id: tc.id, name: tc.function.name, args };
  });
  return { content: m?.content ?? null, toolCalls };
}

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

  const user: ToolUser = {
    userId: session.user.id,
    role: session.user.role,
    pharmacyId: session.user.pharmacyId,
    employeeId: session.user.employeeId ?? null,
  };

  // ── Mode CONFIRMATION : exécute l'action (droits re-vérifiés) ──
  if (parsed.data.confirm) {
    const { tool, args } = parsed.data.confirm;
    // L'outil doit être une écriture ET être autorisé pour ce rôle.
    const allowed =
      WRITE_TOOLS.has(tool) &&
      getToolsForUser(user).some((t) => t.function.name === tool);
    if (!allowed) {
      return NextResponse.json({ reply: "Tu n'as pas les droits pour cette action." });
    }
    const result = await executeTool(user, tool, args);
    return NextResponse.json({ reply: result.message });
  }

  if (!parsed.data.messages) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const system = buildSystemPrompt({
    name: session.user.name,
    role: session.user.role,
    isAdmin: isAdminLevel(session.user.role),
    hasEmployee: !!session.user.employeeId,
  });
  const history = parsed.data.messages.slice(-12);
  const tools = getToolsForUser(user);

  try {
    const baseMessages = [{ role: "system", content: system }, ...history];
    const first = await callGroq(apiKey, {
      model: GROQ_MODEL,
      temperature: 0.3,
      max_tokens: 900,
      messages: baseMessages,
      ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
    });

    if (!first) {
      return NextResponse.json({
        reply: "Désolé, je n'ai pas pu répondre à l'instant. Réessaie dans quelques secondes.",
      });
    }

    // Pas d'outil → réponse directe.
    if (first.toolCalls.length === 0) {
      return NextResponse.json({
        reply: first.content?.trim() || "Je n'ai pas de réponse pour ça. Reformule ou demande à ton titulaire.",
      });
    }

    const call = first.toolCalls[0];

    // Outil d'ÉCRITURE → on NE l'exécute PAS : on demande confirmation.
    if (WRITE_TOOLS.has(call.name)) {
      const summary = actionSummary(call.name, call.args);
      return NextResponse.json({
        reply: `Je te propose : **${summary}**. Tu confirmes ?`,
        pendingAction: { tool: call.name, args: call.args, summary },
      });
    }

    // Outil de LECTURE → on l'exécute et on renvoie le résultat au modèle.
    const result = await executeTool(user, call.name, call.args);
    const second = await callGroq(apiKey, {
      model: GROQ_MODEL,
      temperature: 0.3,
      max_tokens: 800,
      messages: [
        ...baseMessages,
        { role: "assistant", content: first.content ?? "", tool_calls: [{ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.args) } }] },
        { role: "tool", tool_call_id: call.id, content: result.message },
      ],
    });
    return NextResponse.json({
      reply: second?.content?.trim() || result.message,
    });
  } catch {
    return NextResponse.json({
      reply: "Désolé, la connexion a échoué. Vérifie ta connexion et réessaie.",
    });
  }
}

export const POST = withErrorHandling(POST__impl);
