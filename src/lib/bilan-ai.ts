import { GROQ_MODEL } from "@/lib/assistant/knowledge";
import {
  BILAN_FIELDS,
  computeBilanRatios,
  fieldEvolution,
  type BilanData,
} from "@/lib/bilan-fields";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Modèle VISION Groq (lecture d'images/photos de bilans). Surchargeable par env
// si Groq fait évoluer son catalogue multimodal.
const GROQ_VISION_MODEL =
  process.env.GROQ_VISION_MODEL?.trim() || "meta-llama/llama-4-scout-17b-16e-instruct";

/** Jeu de valeurs des deux exercices extraits d'un document. */
export type ExtractedBilan = { data: BilanData; dataPrev: BilanData };

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
      signal: AbortSignal.timeout(40000),
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
    return safeJsonObject(content);
  }
}

/** Instruction commune décrivant les postes à extraire (texte + vision). */
function extractionSystemPrompt(): string {
  const fieldList = BILAN_FIELDS.map(
    (f) => `- ${f.key} : ${f.label}${f.hint ? ` (${f.hint})` : ""}`
  ).join("\n");
  return [
    "Tu es un expert-comptable. On te fournit un bilan comptable / liasse fiscale",
    "d'une pharmacie (français, souvent plusieurs pages), sous forme de texte OU",
    "d'image. Extrait les montants EN EUROS (nombres entiers signés, sans espaces",
    "ni symbole) pour les postes ci-dessous, pour l'exercice N (le plus récent) ET",
    "pour l'exercice N-1 (colonne précédente) quand ils figurent.",
    "",
    "Priorité aux tableaux de SYNTHÈSE s'ils existent : « Analyse de votre",
    "entreprise », « Soldes intermédiaires de gestion », « Bilan » (indicateurs",
    "financiers), « Compte de résultat ». Ne prends PAS le détail compte par compte.",
    "Pour le personnel : sépare bien les SALAIRES + charges sociales des SALARIÉS",
    "(chargesPersonnel) de la RÉMUNÉRATION DES DIRIGEANTS / charges de l'exploitant",
    "(remunerationDirigeants) quand le dossier les distingue.",
    "",
    "Réponds UNIQUEMENT en JSON, avec DEUX objets :",
    '{ "n": { cle: nombre, ... }, "n1": { cle: nombre, ... } }',
    "n = exercice le plus récent, n1 = exercice précédent. N'inclus une clé QUE si",
    "tu lis une valeur fiable ; en cas de doute, omets-la. Les charges/pertes sont",
    "des nombres positifs (montants), les résultats peuvent être négatifs.",
    "",
    "Postes attendus (clé : signification) :",
    fieldList,
  ].join("\n");
}

/** Filtre un objet brut vers des clés/valeurs de bilan valides. */
function toBilanData(parsed: unknown): BilanData {
  if (!parsed || typeof parsed !== "object") return {};
  const out: BilanData = {};
  const validKeys = new Set(BILAN_FIELDS.map((f) => f.key));
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : NaN;
    if (validKeys.has(k as never) && Number.isFinite(n)) {
      out[k as keyof BilanData] = Math.round(n);
    }
  }
  return out;
}

/** Découpe la réponse IA { n, n1 } (ou plate) en deux exercices. */
function toBothYears(parsed: Record<string, unknown> | null): ExtractedBilan {
  if (!parsed) return { data: {}, dataPrev: {} };
  // Format attendu { n: {...}, n1: {...} } ; tolère aussi un objet plat (= N).
  const hasSplit = "n" in parsed || "n1" in parsed;
  if (hasSplit) {
    return { data: toBilanData(parsed.n), dataPrev: toBilanData(parsed.n1) };
  }
  return { data: toBilanData(parsed), dataPrev: {} };
}

/**
 * Extrait les postes financiers d'un TEXTE de bilan (N + N-1). On envoie une
 * large fenêtre : une liasse complète tient en général sous cette limite pour
 * ses tableaux de synthèse.
 */
export async function extractBilanFigures(text: string): Promise<ExtractedBilan> {
  const parsed = await callGroqJson(extractionSystemPrompt(), text.slice(0, 45000), 1600);
  return toBothYears(parsed);
}

/**
 * Extrait les postes financiers depuis une IMAGE (photo/scan de bilan) via un
 * modèle vision Groq — pas besoin d'OCR séparé, le modèle lit et structure.
 * `dataUrl` = image encodée en data URL (data:image/...;base64,...).
 */
export async function extractBilanFiguresFromImage(dataUrl: string): Promise<ExtractedBilan> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { data: {}, dataPrev: {} };
  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
        temperature: 0.1,
        max_tokens: 1400,
        messages: [
          { role: "system", content: extractionSystemPrompt() },
          {
            role: "user",
            content: [
              { type: "text", text: "Lis ce document de bilan et renvoie le JSON { n, n1 } des montants." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    return { data: {}, dataPrev: {} };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[bilan-ai] Groq vision", res.status, detail.slice(0, 300));
    return { data: {}, dataPrev: {} };
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  return toBothYears(content ? safeJsonObject(content) : null);
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

const eur = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";
const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(0)} %`;

/**
 * Analyse experte du bilan (rôles : comptable, fiscaliste, avocat, investisseur)
 * pour un dirigeant d'officine. Prend l'exercice N et, si disponible, N-1 pour
 * commenter les tendances. Renvoie synthèse + forces + vigilance + recos.
 */
export async function analyzeBilan(
  data: BilanData,
  prev: BilanData,
  ctx: { year: number; label: string; kind: string }
): Promise<BilanAnalysis | null> {
  const hasPrev = Object.keys(prev).length > 0;

  // Postes N (+ N-1 et variation quand dispo).
  const figures = BILAN_FIELDS.filter((f) => typeof data[f.key] === "number")
    .map((f) => {
      const evo = hasPrev ? fieldEvolution(data, prev, f.key) : null;
      const prevPart =
        typeof prev[f.key] === "number"
          ? ` (N-1: ${eur(prev[f.key] as number)}${evo != null ? `, ${pct(evo)}` : ""})`
          : "";
      return `${f.label}: ${eur(data[f.key] as number)}${prevPart}`;
    })
    .join("\n");

  const ratiosN = computeBilanRatios(data).filter((r) => r.raw != null);
  const ratiosPrev = hasPrev ? computeBilanRatios(prev) : [];
  const ratioLines = ratiosN
    .map((r) => {
      const p = ratiosPrev.find((x) => x.key === r.key);
      return `${r.label}: ${r.value}${p ? ` (N-1: ${p.value})` : ""}`;
    })
    .join("\n");

  const system = [
    "Tu es Hygie, conseil de direction d'un dirigeant de pharmacie d'officine",
    "(France). Tu réunis 4 expertises : EXPERT-COMPTABLE, FISCALISTE, AVOCAT",
    "d'affaires et INVESTISSEUR. À partir des données financières fournies (et de",
    "leur ÉVOLUTION N vs N-1 quand elle est donnée), tu produis une analyse",
    "actionnable, prudente et spécifique au secteur officine.",
    "",
    "Commente les TENDANCES marquantes (CA, marge, EBE, résultat, endettement,",
    "trésorerie, poids du personnel dirigeants inclus) et cherche les CAUSES",
    "plausibles d'une variation forte. Distingue la rémunération des dirigeants de",
    "la masse salariale des salariés.",
    "",
    "Réponds UNIQUEMENT en JSON avec ce schéma exact :",
    "{",
    '  "synthese": "3-5 phrases : santé financière, évolution clé et enjeu principal",',
    '  "forces": ["point fort concret", ...],',
    '  "vigilance": ["point de vigilance / risque concret", ...],',
    '  "recommandations": [',
    '    { "domaine": "Comptabilité|Fiscalité|Juridique|Investissement|Social|Gestion",',
    '      "titre": "action courte", "detail": "explication + bénéfice attendu, chiffré si possible",',
    '      "priorite": "haute|moyenne|basse" }',
    "  ]",
    "}",
    "",
    "Règles : 4 à 7 recommandations concrètes et hiérarchisées, chiffrées quand",
    "possible à partir des données. Reste PRUDENT : rappelle de valider avec",
    "l'expert-comptable / avocat avant décision, sans le répéter à chaque ligne.",
    "N'invente aucun chiffre absent. Français, ton professionnel et clair.",
  ].join("\n");

  const user = [
    `Bilan « ${ctx.label} » — exercice ${ctx.year} (${ctx.kind === "ESTIMATION" ? "estimation/prévisionnel" : "chiffres réels"})${hasPrev ? ", avec comparaison N-1" : ""}.`,
    "",
    "Données financières (N, et N-1 entre parenthèses) :",
    figures || "(aucune donnée chiffrée fournie)",
    "",
    "Ratios calculés :",
    ratioLines || "(non calculables)",
  ].join("\n");

  const parsed = await callGroqJson(system, user, 2200);
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
