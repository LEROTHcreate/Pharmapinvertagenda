"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Upload, Trash2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setPharmacyLogo } from "@/app/(dashboard)/parametres/actions";
import { PharmacyLogo } from "@/components/layout/PharmacyLogo";

const MAX_BYTES = 200 * 1024;

/**
 * Bloc Paramètres : upload du logo de l'officine. Encodage en base64 côté
 * client puis POST à l'action serveur (qui re-valide MIME + taille).
 */
export function PharmacyLogoForm({
  initialLogoUrl,
  pharmacyName,
  canEdit = true,
}: {
  initialLogoUrl: string | null;
  pharmacyName: string;
  /** Autorise l'import/retrait du logo (titulaire+). False → aperçu seul. */
  canEdit?: boolean;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  // L'URL affichée — soit l'existant, soit la preview locale après upload.
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [error, setError] = useState<string | null>(null);

  function handlePick() {
    inputRef.current?.click();
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset input pour pouvoir re-uploader le même fichier

    if (file.size > MAX_BYTES) {
      setError(
        `Logo trop lourd (${Math.round(file.size / 1024)} KB). Maximum 200 KB.`
      );
      return;
    }
    setError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      if (!dataUrl.startsWith("data:")) {
        setError("Lecture du fichier impossible.");
        return;
      }
      // Optimistic preview, puis envoi serveur
      setLogoUrl(dataUrl);
      startTransition(async () => {
        const res = await setPharmacyLogo(dataUrl);
        if (!res.ok) {
          setLogoUrl(initialLogoUrl);
          setError(res.error);
          return;
        }
        toast({
          tone: "success",
          title: "Logo mis à jour",
          description: "Visible dans la sidebar à la prochaine navigation.",
        });
      });
    };
    reader.onerror = () => setError("Lecture du fichier impossible.");
    reader.readAsDataURL(file);
  }

  function handleRemove() {
    startTransition(async () => {
      const res = await setPharmacyLogo(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLogoUrl(null);
      setError(null);
      toast({
        tone: "success",
        title: "Logo retiré",
        description: "Retour au logo générique PharmaPlanning.",
      });
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm px-4 py-4 sm:px-5 sm:py-5">
      <div className="mb-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Logo de l&apos;officine
        </h2>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          Affiché dans la sidebar et l&apos;en-tête mobile. Format PNG, JPG, WebP
          ou SVG · 200 KB max · idéalement carré.
        </p>
      </div>

      <div className="flex items-center gap-4">
        {/* Aperçu */}
        <div className="shrink-0 flex h-20 w-20 items-center justify-center rounded-xl border border-border bg-muted/40 overflow-hidden">
          {logoUrl ? (
            <PharmacyLogo
              logoUrl={logoUrl}
              size={72}
              alt={`Logo ${pharmacyName}`}
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground/70">
              <ImageIcon className="h-6 w-6" />
              <span className="text-[10px] uppercase tracking-wider">Aucun</span>
            </div>
          )}
        </div>

        {/* Actions — masquées en lecture seule (non-titulaire) */}
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
          {canEdit ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleFile}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePick}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {logoUrl ? "Changer" : "Importer"}
              </Button>
              {logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemove}
                  disabled={isPending}
                  className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Retirer
                </Button>
              )}
            </>
          ) : (
            <span className="text-[12px] text-muted-foreground">
              Lecture seule
            </span>
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700 ring-1 ring-inset ring-red-100"
        >
          {error}
        </p>
      )}
    </div>
  );
}
