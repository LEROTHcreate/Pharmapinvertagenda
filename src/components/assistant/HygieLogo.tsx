/**
 * Logo d'Hygie — croix de pharmacie classique (croix grecque à branches égales,
 * coins arrondis). Monochrome via `currentColor` (blanc sur la bulle verte, vert
 * sur fond clair…), net et reconnaissable même en petit (16–24 px).
 */
export function HygieLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {/* Barre verticale */}
      <rect x="9.4" y="3" width="5.2" height="18" rx="2.3" fill="currentColor" />
      {/* Barre horizontale → ensemble = croix de pharmacie */}
      <rect x="3" y="9.4" width="18" height="5.2" rx="2.3" fill="currentColor" />
    </svg>
  );
}
