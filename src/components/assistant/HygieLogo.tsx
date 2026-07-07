/**
 * Logo d'Hygie — la « coupe d'Hygie » (calice + serpent), symbole universel de
 * la pharmacie. Trait unique qui hérite de `currentColor` (blanc sur le bouton
 * vert, etc.). Dessiné pour rester lisible même en petit (16–24 px).
 */
export function HygieLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* Calice : bord + coupe + pied */}
      <path d="M5.5 11h13" />
      <path d="M7 11a5 4.6 0 0 0 10 0" />
      <path d="M12 15.6v3.4" />
      <path d="M8.8 19h6.4" />
      {/* Serpent en S qui s'élève de la coupe */}
      <path d="M13.6 11c-3-1.6-3-4.6-1-5.7s2-2.6.6-3.2" />
      {/* Tête du serpent */}
      <circle cx="12.4" cy="1.9" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}
