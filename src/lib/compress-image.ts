/**
 * Compresseur d'image côté client — utilisé avant d'envoyer une pièce
 * jointe en base64 pour respecter la limite de stockage en BDD.
 *
 * Stratégie itérative : on tente d'abord à pleine résolution avec une
 * qualité élevée, puis on baisse la qualité, puis on réduit la résolution
 * jusqu'à passer sous le seuil. Ça permet de garder un rendu net pour les
 * petites images et de seulement dégrader les grosses photos d'iPhone.
 */

/** Limite max de la pièce jointe — base64 (~1.37× la taille des bytes). */
export const MAX_ATTACHMENT_BYTES = 500 * 1024; // 500 KB

/** Mimes images acceptés en entrée. */
export const ACCEPTED_IMAGE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
];

export type CompressedImage = {
  /** Data URL `data:image/jpeg;base64,...` */
  dataUrl: string;
  /** Mime du résultat (toujours image/jpeg ou image/webp pour la compression). */
  mime: string;
  /** Nom de fichier original (passé tel quel, pour l'affichage). */
  name: string;
  /** Taille approximative en bytes (estimation depuis le dataUrl). */
  approxBytes: number;
};

function dataUrlToApproxBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(",");
  if (i < 0) return 0;
  const b64 = dataUrl.slice(i + 1);
  return Math.ceil((b64.length * 3) / 4);
}

/**
 * Compresse une image File jusqu'à passer sous `MAX_ATTACHMENT_BYTES`.
 * Retourne une data URL JPEG ou WebP. Levée d'exception si la compression
 * échoue ou si même à 30% qualité + 800px de large, on dépasse encore la limite.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  if (!ACCEPTED_IMAGE_MIMES.includes(file.type)) {
    throw new Error(
      `Format non supporté (${file.type}). Utilise PNG, JPG, WebP ou GIF.`
    );
  }

  // Charge l'image dans un canvas pour pouvoir la re-encoder
  const bitmap = await createImageBitmap(file);

  // Stratégie : on tente plusieurs combinaisons (largeur max × qualité)
  // de la plus haute qualité à la plus basse, et on s'arrête dès qu'on
  // passe sous le seuil. Largeur native + qualité 0.85 suffit dans 90%
  // des cas (les capture d'écran iOS font ~600KB en PNG, qui descendent
  // à ~150-200KB en JPEG 0.85).
  const attempts: Array<{ maxWidth: number; quality: number }> = [
    { maxWidth: bitmap.width, quality: 0.85 },
    { maxWidth: 1920, quality: 0.82 },
    { maxWidth: 1600, quality: 0.78 },
    { maxWidth: 1280, quality: 0.75 },
    { maxWidth: 1024, quality: 0.7 },
    { maxWidth: 800, quality: 0.65 },
    { maxWidth: 600, quality: 0.55 },
  ];

  for (const attempt of attempts) {
    const dataUrl = await renderToDataUrl(bitmap, attempt.maxWidth, attempt.quality);
    const bytes = dataUrlToApproxBytes(dataUrl);
    if (bytes <= MAX_ATTACHMENT_BYTES) {
      return {
        dataUrl,
        mime: "image/jpeg",
        name: file.name,
        approxBytes: bytes,
      };
    }
  }

  throw new Error(
    "Image trop lourde même après compression. Réessaie avec une photo plus petite (max 500 KB)."
  );
}

/**
 * Rend un ImageBitmap dans un canvas redimensionné à `maxWidth` (en gardant
 * le ratio) puis encode en JPEG avec la qualité demandée. Toujours JPEG
 * (et pas PNG) car c'est ~10× plus petit pour les photos.
 */
async function renderToDataUrl(
  bitmap: ImageBitmap,
  maxWidth: number,
  quality: number
): Promise<string> {
  const ratio = bitmap.height / bitmap.width;
  const w = Math.min(maxWidth, bitmap.width);
  const h = Math.round(w * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context indisponible");

  // Fond blanc pour l'export JPEG (qui ne supporte pas la transparence —
  // sinon on aurait des fonds noirs sur les PNG transparents).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);

  return canvas.toDataURL("image/jpeg", quality);
}

/** Format human-readable d'une taille en bytes. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
