import { unstable_cache } from "next/cache";

/**
 * Actualité « pharmacie » pour la page Infos & conseils.
 *
 * Source : Google Actualités (flux RSS de recherche) — agrège la presse
 * française sur l'officine : médicaments, remboursements, nouvelles missions,
 * convention/rémunération, ruptures & rappels de lots, etc.
 *
 * ⚠ Google Actualités trie par PERTINENCE, pas par date. On RE-TRIE donc par
 * date décroissante après fusion de plusieurs requêtes (couverture large) et
 * dédoublonnage (une même dépêche revient via plusieurs sources) : la section
 * affiche ainsi toujours le plus RÉCENT en tête et se rafraîchit avec l'actu.
 *
 * On ne stocke rien : lecture serveur, cache 1 h (unstable_cache), et on ne
 * renvoie que des titres + liens externes (aucun contenu recopié). En cas
 * d'erreur réseau ou de flux illisible → tableau vide (section masquée).
 */

export type NewsItem = {
  title: string;
  link: string;
  source: string;
  /** Date de publication formatée (fr-FR), ex. "2 juil.". */
  dateLabel: string;
};

/** Item interne enrichi d'un timestamp pour le tri par fraîcheur. */
type ParsedItem = NewsItem & { ts: number };

function feedUrl(query: string): string {
  return (
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=fr&gl=FR&ceid=FR:fr"
  );
}

/** Décode les entités HTML courantes présentes dans les titres RSS. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i").exec(block);
  if (!m) return null;
  // Certains flux enrobent le contenu dans du CDATA.
  const raw = m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
  return decodeEntities(raw).trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Clé de dédoublonnage : titre normalisé (sans accents/ponctuation/casse). */
function dedupKey(title: string): string {
  return title
    // Les pages « Commentez sur l'article "X" » du Moniteur pointent vers X :
    // on retire le préfixe pour qu'elles dédoublonnent avec l'article réel.
    .replace(/^Commentez sur l'article\s*[«"]?\s*/i, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Titres à écarter (pages non-articles : sondages, commentaires…). */
function isNoise(title: string): boolean {
  return /^Commentez sur l'article/i.test(title);
}

/** Récupère et parse un flux RSS Google Actualités (une requête). */
async function fetchQuery(query: string): Promise<ParsedItem[]> {
  try {
    const res = await fetch(feedUrl(query), {
      headers: { "user-agent": "Mozilla/5.0 (PharmaPlanning)" },
      // unstable_cache gère le cache applicatif → pas de double cache HTTP.
      cache: "no-store",
      // Borne le temps de réponse pour ne jamais bloquer le rendu de /infos.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const xml = await res.text();

    const items: ParsedItem[] = [];
    const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    for (const block of blocks) {
      const rawTitle = tag(block, "title");
      const link = tag(block, "link");
      if (!rawTitle || !link) continue;
      const source = tag(block, "source") ?? "Presse";
      // Google formate « Titre - Source » → on retire le suffixe source.
      const title = rawTitle
        .replace(new RegExp(`\\s*[-–]\\s*${escapeRe(source)}\\s*$`), "")
        .trim();
      const pub = tag(block, "pubDate");
      const d = pub ? new Date(pub) : null;
      const ts = d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
      const dateLabel = ts
        ? new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
        : "";
      items.push({ title: title || rawTitle, link, source, ts, dateLabel });
    }
    return items;
  } catch {
    return [];
  }
}

/**
 * Fusionne plusieurs requêtes → dédoublonne (par titre normalisé) → trie par
 * date décroissante → garde les `limit` plus récentes.
 */
async function fetchMerged(queries: string[], limit: number): Promise<NewsItem[]> {
  const results = await Promise.all(queries.map(fetchQuery));
  const seen = new Set<string>();
  const merged: ParsedItem[] = [];
  for (const it of results.flat()) {
    if (isNoise(it.title)) continue;
    const key = dedupKey(it.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(it);
  }
  merged.sort((a, b) => b.ts - a.ts); // plus récent en tête
  // On retire le `ts` interne (le DTO public reste titre/lien/source/date).
  return merged.slice(0, limit).map(({ ts: _ts, ...rest }) => rest);
}

/**
 * Actu pharmacie généraliste — couverture large (officine, remboursements,
 * nouvelles missions, convention/rémunération), triée du plus récent au plus
 * ancien. Rafraîchie toutes les heures.
 */
const GENERAL_QUERIES = [
  "pharmacie officine actualité when:30d",
  "pharmacie officine nouvelles missions when:30d",
  "pharmacie convention rémunération honoraires officine when:30d",
];

const ALERT_QUERIES = [
  "rupture stock médicament when:45d",
  "ANSM rappel de lot médicament when:45d",
];

export const getPharmacyNews = () =>
  unstable_cache(() => fetchMerged(GENERAL_QUERIES, 8), ["pharmacy-news-general-v2"], {
    revalidate: 3600,
    tags: ["pharmacy-news"],
  })();

/** Ruptures de stock & rappels de lots de médicaments (très actionnable). */
export const getMedicineAlerts = () =>
  unstable_cache(() => fetchMerged(ALERT_QUERIES, 6), ["pharmacy-news-alerts-v2"], {
    revalidate: 3600,
    tags: ["pharmacy-news"],
  })();

/* ─── Versions « longues » pour la page Actualités plein écran ────────── */

/** Actu pharmacie — liste étendue (page /actualites). */
export const getPharmacyNewsFull = () =>
  unstable_cache(() => fetchMerged(GENERAL_QUERIES, 30), ["pharmacy-news-general-full-v2"], {
    revalidate: 3600,
    tags: ["pharmacy-news"],
  })();

/** Ruptures & rappels — liste étendue (page /actualites). */
export const getMedicineAlertsFull = () =>
  unstable_cache(() => fetchMerged(ALERT_QUERIES, 24), ["pharmacy-news-alerts-full-v2"], {
    revalidate: 3600,
    tags: ["pharmacy-news"],
  })();

/**
 * Recherche libre dans l'actu pharmacie (barre de recherche de /actualites).
 * Requête utilisateur biaisée « récent » (when:90d). Non mise en cache : c'est
 * une action ponctuelle et la clé varierait à chaque terme.
 */
export async function searchPharmacyNews(
  query: string,
  limit = 30
): Promise<NewsItem[]> {
  const q = query.trim();
  if (!q) return [];
  return fetchMerged([`${q} when:90d`], limit);
}
