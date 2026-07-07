/**
 * Logo d'Hygie — croix de pharmacie classique (croix grecque à branches égales,
 * épaisses, coins légèrement arrondis). Monochrome via `currentColor` (blanc sur
 * la bulle verte, vert sur fond clair…), net même en petit (16–24 px).
 */
export function HygieLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {/* Barre verticale */}
      <rect x="8.8" y="2.5" width="6.4" height="19" rx="1.3" fill="currentColor" />
      {/* Barre horizontale → ensemble = croix de pharmacie */}
      <rect x="2.5" y="8.8" width="19" height="6.4" rx="1.3" fill="currentColor" />
    </svg>
  );
}
