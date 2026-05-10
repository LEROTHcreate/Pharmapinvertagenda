"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Paperclip, X, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_IMAGE_MIMES,
  compressImage,
  formatBytes,
  type CompressedImage,
} from "@/lib/compress-image";

/**
 * Bouton d'ajout de pièce jointe + preview avec retrait.
 *
 * Modes :
 *  - **Click** sur le bouton trombone → ouvre le file picker système
 *  - **Drag & drop** sur la zone de saisie parent (à câbler côté parent
 *    via `onPaste` ou `onDrop` qui appelle `attach(file)`)
 *
 * Une seule pièce jointe à la fois (v1). Compression auto si > 500 KB.
 */
export function ImageAttachmentInput({
  value,
  onChange,
  disabled,
  className,
}: {
  /** L'image actuellement attachée (null = pas de pj). */
  value: CompressedImage | null;
  onChange: (next: CompressedImage | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function attach(file: File) {
    setError(null);
    setBusy(true);
    try {
      const compressed = await compressImage(file);
      onChange(compressed);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) attach(file);
    // Reset l'input pour pouvoir re-sélectionner le même fichier après retrait
    e.target.value = "";
  }

  function clear() {
    onChange(null);
    setError(null);
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          className={cn(
            "inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors shrink-0",
            "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
          aria-label="Joindre une image"
          title="Joindre une image (PNG, JPG, WebP, GIF · max 500 KB)"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_MIMES.join(",")}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Preview de la PJ — vignette + nom + bouton retrait */}
        {value && (
          <div className="flex items-center gap-2 min-w-0 flex-1 rounded-lg bg-muted/40 px-2 py-1">
            <div className="relative h-8 w-8 shrink-0 rounded overflow-hidden bg-card">
              <Image
                src={value.dataUrl}
                alt={value.name}
                width={64}
                height={64}
                className="h-full w-full object-cover"
                unoptimized
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-foreground">
                {value.name}
              </p>
              <p className="text-[10.5px] text-muted-foreground tabular-nums">
                {formatBytes(value.approxBytes)}
              </p>
            </div>
            <button
              type="button"
              onClick={clear}
              disabled={disabled}
              className="inline-flex items-center justify-center h-6 w-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-card transition-colors shrink-0"
              aria-label="Retirer la pièce jointe"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-[11.5px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Helper exposé : tente d'extraire une image d'un événement clipboard
 * (Ctrl+V) ou drop. Retourne le `File` ou `null` si pas d'image.
 *
 * À câbler côté parent : sur le `onPaste` du textarea, on appelle
 * `extractImageFromClipboard(e)` puis `attach(file)` si non-null.
 */
export function extractImageFromClipboard(
  e: React.ClipboardEvent
): File | null {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (const item of Array.from(items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}
