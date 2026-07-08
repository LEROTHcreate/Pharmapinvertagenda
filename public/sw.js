/**
 * Service Worker basique pour PharmaPlanning.
 *
 * Stratégie :
 *  - Pré-cache : icônes, manifest (les essentiels du shell PWA)
 *  - Runtime cache "stale-while-revalidate" pour /_next/static/* et /api/* GET
 *  - Network-first pour les pages HTML (toujours frais en ligne)
 *  - Fallback offline : sert le shell + page de récup si réseau down
 *
 * Volontairement minimal : pas de Workbox, pas de stratégies complexes.
 * Le but est de rendre l'app installable façon "vrai PWA" sur tablette
 * de comptoir, pas de faire un mode hors-ligne complet.
 */

// Bump cette version dès qu'on change PRECACHE_URLS ou la stratégie de cache —
// les anciens caches sont purgés dans `activate`. Sans bump, les navigateurs
// continueraient à servir les vieux assets (notamment les favicons).
const SW_VERSION = "v3";
const STATIC_CACHE = `pharma-static-${SW_VERSION}`;
const RUNTIME_CACHE = `pharma-runtime-${SW_VERSION}`;

// Assets à pré-cacher dès l'install. On utilise les variantes "pharmaplanning-*"
// (logo de marque) plutôt que /logo.png /icon-192.png etc. qui peuvent être
// des assets custom de pharmacie cliente — le shell PWA est commun à toutes
// les officines, donc affiche le branding plateforme.
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/pharmaplanning-logo.svg",
  "/pharmaplanning-logo.png",
  "/pharmaplanning-apple-touch-icon.png",
  "/pharmaplanning-icon-192.png",
  "/pharmaplanning-icon-512.png",
];

self.addEventListener("install", (event) => {
  // Skip waiting → la nouvelle version SW devient active dès le 1er install
  // (sinon elle reste "waiting" jusqu'à fermeture des onglets)
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      // addAll est atomique : si un seul fail, l'install entière échoue.
      // On utilise add() boucle pour tolérer les 404 sur les icônes pas encore générées.
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch(() => {
            // ignoré : asset peut-être manquant en local
          })
        )
      )
    )
  );
});

self.addEventListener("activate", (event) => {
  // Nettoie les anciens caches d'une version précédente
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  // Prend le contrôle des pages déjà ouvertes
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Ignore les requêtes cross-origin et les WebSockets
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/auth")) return; // jamais cacher l'auth

  // Stratégie 1 : assets statiques Next → cache-first (immutables hashés)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }

  // Stratégie 2 : icônes / manifest → cache-first
  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Stratégie 3 : pages HTML / API → network-first avec fallback cache
  // (pour qu'en offline complet, la dernière vue chargée reste accessible)
  if (
    req.headers.get("accept")?.includes("text/html") ||
    url.pathname.startsWith("/api/")
  ) {
    event.respondWith(networkFirst(req, RUNTIME_CACHE));
    return;
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    // Pas de cache + offline → laisser remonter l'erreur
    throw e;
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Fallback minimal pour les pages HTML : un message "offline"
    if (req.headers.get("accept")?.includes("text/html")) {
      return new Response(
        `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Hors ligne · PharmaPlanning</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:2rem;text-align:center;color:#27272a;background:#fafafa}h1{font-size:1.25rem;margin-bottom:0.5rem}p{color:#71717a;font-size:0.875rem}.card{max-width:24rem;margin:4rem auto;padding:2rem;background:white;border-radius:1rem;box-shadow:0 8px 24px -12px rgba(0,0,0,.1)}</style></head><body><div class="card"><h1>Pas de connexion</h1><p>PharmaPlanning a besoin d'être connecté pour afficher cette page. Vérifie ta connexion réseau et réessaie.</p></div></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" }, status: 503 }
      );
    }
    return new Response(JSON.stringify({ error: "OFFLINE" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
}

// ─── Web Push ──────────────────────────────────────────────────────
// Reçoit les notifications poussées par le serveur (absence validée, consigne,
// événement demain…) et les affiche. Le payload est un JSON
// { title, body, url, tag }.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "PharmaPlanning";
  const options = {
    body: data.body || "",
    icon: "/pharmaplanning-icon-192.png",
    badge: "/pharmaplanning-icon-192.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/accueil" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Clic sur la notif → focus un onglet existant sur l'URL, sinon en ouvre un.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/accueil";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
