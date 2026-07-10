import { GROQ_MODEL } from "@/lib/assistant/knowledge";
import { BILAN_FIELDS, computeBilanRatios, type BilanData } from "@/lib/bilan-fields";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Modèle VISION Groq (lecture d'images/photos de bilans). Surchargeable par env
// si Groq fait évoluer son catalogue multimodal.
const GROQ_VISION_MODEL =
  process.env.GROQ_VISION_MODEL?.trim() || "meta-llama/llama-4-scout-17b-16e-instruct";

/** Extrait le 1er objet JSON d'une chaîne (tolère un préambule / des ```). */
function safeJsonObject(str: string): Record<string, unknown> | null {
  const start = str.indexOf("{");
  const end = str.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(str.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Appel Groq (chat, JSON forcé). Renvoie l'objet parsé ou null. */
async function callGroqJson(
  system: string,
  user: string,
  maxTokens = 1500
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    return null;
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[bilan-ai] Groq", res.status, detail.slice(0, 300));
    return null;
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Extrait les postes financiers d'un texte de bilan comptable → { key: montant }.
 * Ne renvoie que des CLÉS connues et des nombres (en euros).
 */
export async function extractBilanFigures(text: string): Promise<BilanData> {
  const parsed = await callGroqJson(extractionSystemPrompt(), text.slice(0, 12000), 1200);
  return toBilanData(parsed);
}

/** Instruction commune décrivant les postes à extraire (texte + vision). */
function extractionSystemPrompt(): string {
  const fieldList = BILAN_FIELDS.map(
    (f) => `- ${f.key} : ${f.label}${f.hint ? ` (${f.hint})` : ""}`
  ).join("\n");
  return [
    "Tu es un expert-comptable. On te fournit un bilan comptable / compte de",
    "résultat d'une pharmacie (français), sous forme de texte OU d'image (photo,",
    "scan). Extrait les montants EN EUROS (nombres entiers, sans espaces ni",
    "symbole) pour les postes ci-dessous.",
    "Réponds UNIQUEMENT en JSON : un objet { cle: nombre }, sans autre texte.",
    "N'inclus une clé QUE si tu lis une valeur fiable. Ignore les pourcentages et",
    "les colonnes N-1 (prends l'exercice le plus récent). En cas de doute, omets.",
    "",
    "Postes attendus (clé : signification) :",
    fieldList,
  ].join("\n");
}

/** Filtre un objet brut vers des clés/valeurs de bilan valides. */
function toBilanData(parsed: Record<string, unknown> | null): BilanData {
  if (!parsed) return {};
  const out: BilanData = {};
  const validKeys = new Set(BILAN_FIELDS.map((f) => f.key));
  for (const [k, v] of Object.entries(parsed)) {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : NaN;
    if (validKeys.has(k as never) && Number.isFinite(n)) {
      out[k as keyof BilanData] = Math.round(n);
    }
  }
  return out;
}

/**
 * Extrait les postes financiers depuis une IMAGE (photo/scan de bilan) via un
 * modèle vision Groq — pas besoin d'OCR séparé, le modèle lit et structure.
 * `dataUrl` = image encodée en data URL (data:image/...;base64,...).
 */
export async function extractBilanFiguresFromImage(dataUrl: string): Promise<BilanData> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return {};
  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
        temperature: 0.1,
        max_tokens: 1200,
        messages: [
          { role: "system", content: extractionSystemPrompt() },
          {
            role: "user",
            content: [
              { type: "text", text: "Lis ce document de bilan et renvoie le JSON des montants." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    return {};
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[bilan-ai] Groq vision", res.status, detail.slice(0, 300));
    return {};
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  return content ? toBilanData(safeJsonObject(content)) : {};
}

export type BilanRecommendation = {
  domaine: "Comptabilité" | "Fiscalité" | "Juridique" | "Investissement" | "Social" | "Gestion";
  titre: string;
  detail: string;
  priorite: "haute" | "moyenne" | "basse";
};
export type BilanAnalysis = {
  synthese: string;
  forces: string[];
  vigilance: string[];
  recommandations: BilanRecommendation[];
};

/**
 * Analyse experte du bilan (rôles : comptable, fiscaliste, avocat, investisseur)
 * pour un dirigeant d'officine. Renvoie synthèse + forces + points de vigilance
 * + recommandations priorisées.
 */
export async function analyzeBilan(
  data: BilanData,
  ctx: { year: number; label: string; kind: string }
): Promise<BilanAnalysis | null> {
  const ratios = computeBilanRatios(data);
  const figures = BILAN_FIELDS
    .filter((f) => typeof data[f.key] === "number")
    .map((f) => `${f.label}: ${Math.round(data[f.key] as number).toLocaleString("fr-FR")} €`)
    .join("\n");
  const ratioLines = ratios
    .filter((r) => r.raw != null)
    .map((r) => `${r.label}: ${r.value}`)
    .join("\n");

  const system = [
    "Tu es Hygie, conseil de direction d'un dirigeant de pharmacie d'officine",
    "(France). Tu réunis 4 expertises : EXPERT-COMPTABLE, FISCALISTE, AVOCAT",
    "d'affaires, et INVESTISSEUR. À partir des données financières fournies, tu",
    "produis une analyse actionnable et prudente, spécifique au secteur officine.",
    "",
    "Réponds UNIQUEMENT en JSON avec ce schéma exact :",
    "{",
    '  "synthese": "2-4 phrases : santé financière globale et enjeu principal",',
    '  "forces": ["point fort concret", ...],',
    '  "vigilance": ["point de vigilance / risque concret", ...],',
    '  "recommandations": [',
    '    { "domaine": "Comptabilité|Fiscalité|Juridique|Investissement|Social|Gestion",',
    '      "titre": "action courte", "detail": "explication + bénéfice attendu",',
    '      "priorite": "haute|moyenne|basse" }',
    "  ]",
    "}",
    "",
    "Règles : 3 à 6 recommandations, concrètes et hiérarchisées. Chiffre quand tu",
    "peux (à partir des données). Reste PRUDENT : rappelle qu'il faut valider avec",
    "l'expert-comptable / avocat avant toute décision, sans le répéter à chaque",
    "ligne. Pas d'invention de chiffres absents. Français, ton professionnel et clair.",
  ].join("\n");

  const user = [
    `Bilan « ${ctx.label} » — année ${ctx.year} (${ctx.kind === "ESTIMATION" ? "estimation/prévisionnel" : "chiffres réels"}).`,
    "",
    "Données financières :",
    figures || "(aucune donnée chiffrée fournie)",
    "",
    "Ratios calculés :",
    ratioLines || "(non calculables)",
  ].join("\n");

  const parsed = await callGroqJson(system, user, 1800);
  if (!parsed) return null;

  const asStrArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const recos: BilanRecommendation[] = Array.isArray(parsed.recommandations)
    ? (parsed.recommandations as unknown[])
        .map((r) => r as Record<string, unknown>)
        .filter((r) => typeof r?.titre === "string")
        .map((r) => ({
          domaine: (["Comptabilité", "Fiscalité", "Juridique", "Investissement", "Social", "Gestion"].includes(
            r.domaine as string
          )
            ? r.domaine
            : "Gestion") as BilanRecommendation["domaine"],
          titre: String(r.titre),
          detail: typeof r.detail === "string" ? r.detail : "",
          priorite: (["haute", "moyenne", "basse"].includes(r.priorite as string)
            ? r.priorite
            : "moyenne") as BilanRecommendation["priorite"],
        }))
    : [];

  return {
    synthese: typeof parsed.synthese === "string" ? parsed.synthese : "",
    forces: asStrArray(parsed.forces),
    vigilance: asStrArray(parsed.vigilance),
    recommandations: recos,
  };
}
