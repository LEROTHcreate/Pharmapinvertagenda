/** @type {import('next').NextConfig} */

/**
 * Headers HTTP de sécurité — appliqués à toutes les routes.
 *
 * Aucun impact perf : ~300 bytes ajoutés par réponse, parsés en
 * microsecondes par le navigateur. Aucun round-trip supplémentaire.
 *
 * Justifications :
 *  - HSTS : force HTTPS pendant 2 ans (avec includeSubDomains pour les
 *    sous-domaines Vercel preview). preload = inscriptible chez les
 *    navigateurs si on souhaite ; on s'abstient pour l'instant car ça
 *    rend le site totalement HTTP-incompatible (irréversible).
 *  - X-Frame-Options DENY : interdit l'embed dans une iframe → anti
 *    clickjacking. Si un jour on a besoin d'iframe, passer en SAMEORIGIN.
 *  - X-Content-Type-Options nosniff : empêche le browser de "deviner" le
 *    Content-Type d'une ressource servie (anti MIME confusion attack).
 *  - Referrer-Policy strict-origin-when-cross-origin : n'envoie que
 *    l'origine (pas le path complet) aux sites tiers — protège l'URL
 *    interne contre le tracking externe.
 *  - Permissions-Policy : désactive les APIs sensibles non utilisées
 *    (caméra, micro, géoloc) → si une dep tente d'y accéder, le browser
 *    refuse d'office.
 *
 * Pas de CSP (Content-Security-Policy) pour l'instant : Next.js + Tailwind
 * + dnd-kit nécessitent `unsafe-inline` et `unsafe-eval`, ce qui annule
 * la majorité des bénéfices d'une CSP. À ré-évaluer quand on aura le
 * temps de mettre en place les nonces côté serveur (1-2h de boulot).
 */
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig = {
  async headers() {
    return [
      {
        // Toutes les routes (HTML, API, _next/static, …)
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
