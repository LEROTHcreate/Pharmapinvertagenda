import { BrandLogo } from "@/components/layout/BrandLogo";

/**
 * Logo de l'officine connectée. Si la pharmacie a un logo (data URL base64
 * uploadée depuis Paramètres, ou chemin relatif comme "/logo.png" pour les
 * pharmacies seedées), on l'affiche. Sinon, fallback sur le logo générique
 * PharmaPlanning.
 *
 * Volontairement simple : un <img> classique. Pas de next/image car les
 * data URLs base64 ne se prêtent pas à l'optimisation, et les fichiers
 * sont déjà petits (< 200KB).
 */
export function PharmacyLogo({
  logoUrl,
  size = 40,
  className,
  alt = "Logo de l'officine",
}: {
  logoUrl: string | null | undefined;
  size?: number;
  className?: string;
  alt?: string;
}) {
  if (!logoUrl) {
    return <BrandLogo size={size} className={className} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={alt}
      width={size}
      height={size}
      className={`object-contain rounded-md ${className ?? ""}`}
      style={{ width: size, height: size }}
    />
  );
}
