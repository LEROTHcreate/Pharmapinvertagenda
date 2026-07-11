import { GROQ_MODEL } from "@/lib/assistant/knowledge";
import {
  BILAN_FIELDS,
  computeBilanRatios,
  computeEbeRetraite,
  computeValuation,
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

/**
 * Parse la réponse JSON d'un modèle, en tolérant : un préambule / des ```,
 * et — si `sanitizeNumbers` — les nombres écrits AVEC ESPACES (« 5 387 004 »),
 * fréquents quand le modèle recopie des montants comptables. Ces espaces rendent
 * le JSON invalide : on les retire ENTRE CHIFFRES avant de parser.
 */
function parseModelJson(content: string | null | undefined, sanitizeNumbers: boolean): Record<string, unknown> | null {
  if (!content) return null;
  let s = content;
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  s = s.slice(a, b + 1);
  if (sanitizeNumbers) {
    // Retire les espaces (normaux, insécables, fins) placés entre deux chiffres.
    s = s.replace(/(\d)[\s  ]+(?=\d)/g, "$1");
  }
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Appel Groq (chat). Par défaut en mode JSON strict (`json_object`), sûr pour du
 * texte. Pour l'EXTRACTION on désactive ce mode : le modèle recopie souvent les
 * montants avec des espaces, ce que le validateur JSON strict de Groq REJETTE
 * (HTTP 400) → on parse nous-mêmes en nettoyant les espaces (`sanitizeNumbers`).
 */
async function callGroqJson(
  system: string,
  user: string,
  maxTokens = 1500,
  opts: { jsonObjectMode?: boolean; sanitizeNumbers?: boolean } = {}
): Promise<Record<string, unknown> | null> {
  const { jsonObjectMode = true, sanitizeNumbers = false } = opts;
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
        ...(jsonObjectMode ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    return null;
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[bilan-ai] Groq", res.status, detail.slice(0, 300));
    // Récupération : en mode JSON strict, un 400 « json_validate_failed » renvoie
    // le brouillon dans `failed_generation` → on le nettoie et on le parse.
    if (res.status === 400) {
      try {
        const gen = (JSON.parse(detail)?.error?.failed_generation as string) ?? "";
        const recovered = parseModelJson(gen, true);
        if (recovered) return recovered;
      } catch {
        /* ignore */
      }
    }
    return null;
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parseModelJson(data.choices?.[0]?.message?.content, sanitizeNumbers || !jsonObjectMode);
}

/** Instruction commune décrivant les postes à extraire (texte + vision). */
function extractionSystemPrompt(): string {
  const fieldList = BILAN_FIELDS.map(
    (f) => `- ${f.key} : ${f.label}${f.hint ? ` (${f.hint})` : ""}`
  ).join("\n");
  return [
    "Tu es un expert-comptable. On te fournit le TEXTE (ou l'image) d'une liasse",
    "fiscale / bilan comptable d'une pharmacie (français, plusieurs pages). Extrait",
    "les montants EN EUROS pour l'exercice N (le plus récent) ET pour l'exercice N-1",
    "(la colonne précédente) pour les postes listés plus bas.",
    "",
    "IMPORTANT — le texte vient d'un PDF MULTI-COLONNES et peut être :",
    "• DÉSORDONNÉ : une liste de libellés d'un côté, puis plus loin des blocs de",
    "  nombres. Les nombres d'un même bloc suivent l'ordre des libellés.",
    "• INLINE : « LIBELLÉ  montant_N  [%]  montant_N-1 » sur une même ligne.",
    "Privilégie les lignes INLINE (les plus fiables) et les tableaux « Analyse de",
    "votre entreprise », « Soldes intermédiaires de gestion », « Compte de résultat »,",
    "« Bilan / indicateurs financiers ». La MÊME valeur revient souvent plusieurs",
    "fois dans le document : sers-t'en pour fiabiliser tes mappings.",
    "",
    "Format des nombres : ils contiennent des espaces (5 387 004) et parfois un signe",
    "moins FINAL (2 127- = -2127). Renvoie des entiers signés, sans espaces ni symbole.",
    "Les charges/coûts sont des montants positifs ; un résultat peut être négatif.",
    "Pour le personnel : sépare les SALAIRES + charges sociales des SALARIÉS",
    "(chargesPersonnel) de la RÉMUNÉRATION DES DIRIGEANTS / charges de l'exploitant /",
    "gérants TNS (remunerationDirigeants) quand le dossier les distingue.",
    "",
    "Sois RAISONNABLEMENT AFFIRMATIF : remplis une clé dès que tu peux l'identifier",
    "de façon plausible (n'omets que si vraiment introuvable). Ignore les colonnes de",
    "pourcentage et d'écart.",
    "",
    "Réponds UNIQUEMENT en JSON, deux objets :",
    '{ "n": { cle: nombre, ... }, "n1": { cle: nombre, ... } }',
    "(n = exercice le plus récent, n1 = exercice précédent).",
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
    let n: number;
    if (typeof v === "number") {
      n = v;
    } else if (typeof v === "string") {
      // Format comptable FR : espaces + éventuel signe moins FINAL (« 2 127- »).
      const s = v.trim();
      const negTrailing = /-\s*$/.test(s);
      const cleaned = s.replace(/[^\d.]/g, "");
      n = cleaned === "" ? NaN : Number(cleaned) * (negTrailing || s.trimStart().startsWith("-") ? -1 : 1);
    } else {
      n = NaN;
    }
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
  // Fenêtre large : dans une liasse (60+ pages), les tableaux « inline » les plus
  // exploitables (SIG détaillés, compte de résultat détaillé) sont profonds dans
  // le PDF. Mode JSON non strict (le modèle recopie des montants avec espaces).
  const parsed = await callGroqJson(extractionSystemPrompt(), text.slice(0, 200000), 1800, {
    jsonObjectMode: false,
  });
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
  return toBothYears(parseModelJson(data.choices?.[0]?.message?.content, true));
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
    "la masse salariale des salariés. Raisonne en EBE RETRAITÉ (EBE + rémunération",
    "des dirigeants) pour juger la vraie rentabilité et la valeur du fonds ; si une",
    "fourchette de valorisation est fournie, tu peux la citer en la présentant comme",
    "indicative (à confirmer par un professionnel).",
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

  // EBE retraité + valorisation indicative (méthode officine).
  const ebeR = computeEbeRetraite(data);
  const val = computeValuation(data);
  const valuationLines: string[] = [];
  if (ebeR != null) {
    const ebeRPrev = hasPrev ? computeEbeRetraite(prev) : null;
    valuationLines.push(
      `EBE retraité (EBE + rémunération dirigeants): ${eur(ebeR)}${ebeRPrev != null ? ` (N-1: ${eur(ebeRPrev)})` : ""}`
    );
  }
  if (val) {
    valuationLines.push(
      `Valorisation indicative du fonds — multiple EBE retraité (${val.ebeMultLow}×-${val.ebeMultHigh}×): ${eur(val.ebeLow)} à ${eur(val.ebeHigh)}`
    );
    if (val.caLow != null && val.caHigh != null) {
      valuationLines.push(
        `Valorisation indicative — % du CA HT (${Math.round(val.caPctLow * 100)}-${Math.round(val.caPctHigh * 100)}%): ${eur(val.caLow)} à ${eur(val.caHigh)}`
      );
    }
  }

  const user = [
    `Bilan « ${ctx.label} » — exercice ${ctx.year} (${ctx.kind === "ESTIMATION" ? "estimation/prévisionnel" : "chiffres réels"})${hasPrev ? ", avec comparaison N-1" : ""}.`,
    "",
    "Données financières (N, et N-1 entre parenthèses) :",
    figures || "(aucune donnée chiffrée fournie)",
    "",
    "Ratios calculés :",
    ratioLines || "(non calculables)",
    ...(valuationLines.length > 0 ? ["", "Rentabilité retraitée & valorisation :", ...valuationLines] : []),
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
