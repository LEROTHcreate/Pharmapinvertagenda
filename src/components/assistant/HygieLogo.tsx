/**
 * Logo d'Hygie — la « coupe d'Hygie » (calice + serpent), symbole universel de
 * la pharmacie. Vasque pleine + serpent en S qui s'élève, dessiné pour rester
 * net et reconnaissable même en petit (16–24 px). Hérite de `currentColor`
 * (blanc sur fond vert, vert sur fond clair…).
 */
export function HygieLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
    >
      {/* Serpent : S ascendant qui sort de la coupe */}
      <path
        d="M11.3 10.1c-2.7-1.7-1.4-4.1.8-4.8 1.9-.6 1.9-2 .3-2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Tête du serpent */}
      <circle cx="12.85" cy="2.35" r="0.95" fill="currentColor" />

      {/* Coupe : rebord (ellipse) + vasque pleine */}
      <ellipse cx="12" cy="10.5" rx="6.2" ry="1.55" fill="currentColor" />
      <path d="M6.3 10.7a5.7 5.4 0 0 0 11.4 0Z" fill="currentColor" />

      {/* Pied + socle */}
      <path
        d="M12 15.6v3.3M8.6 19.2h6.8"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
