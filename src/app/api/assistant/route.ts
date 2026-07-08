import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { isAdminLevel } from "@/lib/permissions";
import {
  buildSystemPrompt,
  GROQ_MODEL,
  ASSISTANT_MAINTENANCE_MESSAGE,
} from "@/lib/assistant/knowledge";
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

/**
 * Résultat d'un appel Groq :
 *  - ok         : réponse exploitable.
 *  - rate_limit : quota / capacité max atteint (HTTP 429 ou 503) → on affichera
 *                 le message de maintenance préparé.
 *  - error      : autre échec (réseau, 5xx, parse) → message générique.
 */
type GroqResult =
  | {
      status: "ok";
      content: string | null;
      toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
    }
  | { status: "rate_limit" }
  | { status: "error" };

/**
 * Appel Groq en STREAMING (Server-Sent Events). Chaque fragment de texte est
 * transmis en direct via `onContent` (→ le client affiche la réponse au fil de
 * l'eau). Les éventuels appels d'outils (tool_calls) arrivent aussi en deltas :
 * on les ré-assemble par index avant de les renvoyer. Le contenu complet et les
 * tool_calls finaux sont retournés une fois le flux terminé.
 */
async function callGroqStream(
  apiKey: string,
  body: Record<string, unknown>,
  onContent: (chunk: string) => void
): Promise<GroqResult> {
  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ ...body, stream: true }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    return { status: "error" };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[assistant] Groq", res.status, detail.slice(0, 300));
    // 429 = quota/rate limit dépassé ; 503 = service surchargé → maintenance.
    if (res.status === 429 || res.status === 503) return { status: "rate_limit" };
    return { status: "error" };
  }
  if (!res.body) return { status: "error" };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  // Les arguments d'un tool_call sont fragmentés → on les concatène par index.
  const toolAcc = new Map<number, { id: string; name: string; args: string }>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      // Flux SSE : des lignes « data: {json} », séparées par des sauts de ligne.
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let json: {
          choices?: Array<{
            delta?: {
              content?: string | null;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>;
        };
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;
        if (typeof delta.content === "string" && delta.content) {
          content += delta.content;
          onContent(delta.content);
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const i = tc.index ?? 0;
            const cur = toolAcc.get(i) ?? { id: "", name: "", args: "" };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name = tc.function.name;
            if (tc.function?.arguments) cur.args += tc.function.arguments;
            toolAcc.set(i, cur);
          }
        }
      }
    }
  } catch {
    return { status: "error" };
  }

  const toolCalls = [...toolAcc.values()]
    .filter((t) => t.name)
    .map((t) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(t.args || "{}");
      } catch {
        /* args illisibles → objet vide */
      }
      return { id: t.id, name: t.name, args };
    });
  return { status: "ok", content: content || null, toolCalls };
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

  // Contexte pour les actions ADMIN d'Hygie : elles rappellent les routes API
  // existantes (même RBAC + logique) via un fetch interne authentifié → on
  // retransmet l'origine et le cookie de session de la requête courante.
  const ctx = {
    baseUrl: new URL(req.url).origin,
    cookie: req.headers.get("cookie") ?? "",
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
    const result = await executeTool(user, tool, args, ctx);
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

  const baseMessages = [{ role: "system", content: system }, ...history];

  // Réponse en flux NDJSON : une trame JSON par ligne.
  //   { t: "delta",   v: "texte" }   → fragment de réponse à concaténer
  //   { t: "pending", v: {…} }       → action d'écriture à confirmer
  // Le client lit le flux et affiche la réponse au fur et à mesure.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const frame = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const sendDelta = (text: string) => frame({ t: "delta", v: text });

      try {
        // 1re passe : Groq décide de répondre OU d'appeler un outil. Le texte
        // (cas courant) est streamé en direct au client.
        const first = await callGroqStream(
          apiKey,
          {
            model: GROQ_MODEL,
            temperature: 0.3,
            max_tokens: 900,
            messages: baseMessages,
            ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
          },
          sendDelta
        );

        if (first.status === "rate_limit") {
          sendDelta(ASSISTANT_MAINTENANCE_MESSAGE);
          controller.close();
          return;
        }
        if (first.status === "error") {
          sendDelta(
            "Désolé, je n'ai pas pu répondre à l'instant. Réessaie dans quelques secondes."
          );
          controller.close();
          return;
        }

        // Pas d'outil → le texte a déjà été streamé ci-dessus.
        if (first.toolCalls.length === 0) {
          if (!first.content?.trim()) {
            sendDelta(
              "Je n'ai pas de réponse pour ça. Reformule ou demande à ton titulaire."
            );
          }
          controller.close();
          return;
        }

        const call = first.toolCalls[0];

        // Outil d'ÉCRITURE → on NE l'exécute PAS : on demande confirmation.
        if (WRITE_TOOLS.has(call.name)) {
          const summary = actionSummary(call.name, call.args);
          sendDelta(`Je te propose : **${summary}**. Tu confirmes ?`);
          frame({ t: "pending", v: { tool: call.name, args: call.args, summary } });
          controller.close();
          return;
        }

        // Outil de LECTURE → on l'exécute et on renvoie le résultat au modèle,
        // qui rédige (en streaming) une réponse synthétique.
        const result = await executeTool(user, call.name, call.args, ctx);
        const second = await callGroqStream(
          apiKey,
          {
            model: GROQ_MODEL,
            temperature: 0.3,
            max_tokens: 800,
            messages: [
              ...baseMessages,
              {
                role: "assistant",
                content: first.content ?? "",
                tool_calls: [
                  {
                    id: call.id,
                    type: "function",
                    function: { name: call.name, arguments: JSON.stringify(call.args) },
                  },
                ],
              },
              { role: "tool", tool_call_id: call.id, content: result.message },
            ],
          },
          sendDelta
        );
        // Si la 2e passe échoue / ne produit rien, on a déjà le résultat de
        // l'outil : on le renvoie tel quel (plus utile qu'un message d'erreur).
        if (!(second.status === "ok" && second.content?.trim())) {
          sendDelta(result.message);
        }
        controller.close();
      } catch {
        sendDelta("Désolé, la connexion a échoué. Vérifie ta connexion et réessaie.");
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      // Désactive le buffering d'éventuels proxys → le flux part vraiment vif.
      "x-accel-buffering": "no",
    },
  });
}

export const POST = withErrorHandling(POST__impl);
