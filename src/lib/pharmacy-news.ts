import { unstable_cache } from "next/cache";

/**
 * Actualité « pharmacie » pour la page Infos & conseils.
 *
 * Source : Google Actualités (flux RSS de recherche) — agrège la presse
 * française sur l'officine : médicaments, remboursements, votes/mesures
 * concernant les pharmaciens, ruptures & rappels de lots, etc. Fiable et
 * toujours alimenté, contrairement à beaucoup de flux d'éditeurs (l'ANSM, par
 * ex., renvoie un flux vide).
 *
 * On ne stocke rien : lecture serveur, mise en cache 1 h (unstable_cache), et
 * on ne renvoie que des titres + liens externes (aucun contenu recopié). En
 * cas d'erreur réseau ou de flux illisible → tableau vide (section masquée).
 */

export type NewsItem = {
  title: string;
  link: string;
  source: string;
  /** Date de publication formatée (fr-FR), ex. "2 juil.". */
  dateLabel: string;
};

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

async function fetchFeed(query: string, limit: number): Promise<NewsItem[]> {
  try {
    const res = await fetch(feedUrl(query), {
      headers: { "user-agent": "Mozilla/5.0 (PharmaPlanning)" },
      // unstable_cache gère déjà le cache applicatif → pas de double cache.
      cache: "no-store",
      // Borne le temps de réponse pour ne jamais bloquer le rendu de /infos.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const xml = await res.text();

    const items: NewsItem[] = [];
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
      const dateLabel =
        d && !Number.isNaN(d.getTime())
          ? d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
          : "";
      items.push({ title: title || rawTitle, link, source, dateLabel });
      if (items.length >= limit) break;
    }
    return items;
  } catch {
    return [];
  }
}

/** Actu pharmacie généraliste (officine, médicaments, remboursements, mesures). */
export const getPharmacyNews = () =>
  unstable_cache(
    () =>
      fetchFeed(
        "pharmacie officine médicament remboursement when:30d",
        7
      ),
    ["pharmacy-news-general"],
    { revalidate: 3600, tags: ["pharmacy-news"] }
  )();

/** Ruptures de stock & rappels de lots de médicaments (très actionnable). */
export const getMedicineAlerts = () =>
  unstable_cache(
    () =>
      fetchFeed(
        '"rupture" médicament OR "rappel de lot" médicament OR pénurie médicament when:45d',
        5
      ),
    ["pharmacy-news-alerts"],
    { revalidate: 3600, tags: ["pharmacy-news"] }
  )();
