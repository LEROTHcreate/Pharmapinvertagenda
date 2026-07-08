"use client";

import { useState } from "react";
import { Copy, Check, QrCode, Info, Camera } from "lucide-react";
import { useToast } from "@/components/ui/toast";

/**
 * Page « Inviter l'équipe » — lien d'inscription (SIRET pré-rempli, mode
 * « rejoindre ») + QR code à montrer aux collaborateurs. Chacun scanne / ouvre
 * le lien, crée son compte, l'admin valide ensuite dans Utilisateurs.
 *
 * Identité verte de l'officine (bandeau + logo) ; le QR est rendu par un service
 * externe teinté en vert foncé (contraste conservé, aucune donnée sensible : le
 * lien ne contient que le SIRET, public). Le lien copiable reste la valeur sûre
 * si le service d'image est indisponible.
 */
export function InviteView({
  link,
  pharmacyName,
  logoUrl,
  hasSiret,
}: {
  link: string;
  pharmacyName: string;
  logoUrl: string | null;
  hasSiret: boolean;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // QR vert foncé sur fond blanc (RGB 20-67-43 = #14432b) — même teinte que le
  // logo, contraste suffisant pour un scan fiable.
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=0&color=20-67-43&bgcolor=255-255-255&data=${encodeURIComponent(link)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ tone: "error", title: "Copie impossible", description: "Copiez le lien manuellement." });
    }
  }

  return (
    <div className="w-full p-3 md:p-4 lg:p-6 pb-16">
      {/* En-tête — bandeau vert avec logo de l'officine */}
      <header
        className="relative mb-5 overflow-hidden rounded-3xl px-6 py-6 text-white"
        style={{
          background:
            "radial-gradient(120% 90% at 85% -20%, rgba(141,198,63,0.28), transparent 60%), linear-gradient(158deg, #123a26 0%, #1c5637 100%)",
        }}
      >
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white p-1.5 shadow-lg">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={`Logo ${pharmacyName}`}
                className="h-full w-full rounded-xl object-contain"
              />
            ) : (
              <QrCode className="h-7 w-7 text-emerald-700" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-lime-300">
              Inviter l&apos;équipe
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight">
              Rejoignez le planning
            </h1>
            <p className="mt-0.5 truncate text-[13px] text-white/75">{pharmacyName}</p>
          </div>
        </div>
      </header>

      {!hasSiret && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-300/70 bg-amber-50/60 px-3.5 py-2.5 text-[12.5px] text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Le SIRET de l&apos;officine n&apos;est pas renseigné : le lien ne pourra
            pas pré-remplir la pharmacie. Ajoutez-le dans{" "}
            <a href="/parametres" className="font-medium underline">Paramètres</a> pour
            un lien complet.
          </p>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        {/* Lien + étapes */}
        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              Lien d&apos;invitation
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 rounded-lg border border-input bg-muted/40 px-3 py-2 text-[12.5px] font-mono text-foreground/80"
              />
              <button
                onClick={copy}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-emerald-700"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copié" : "Copier"}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              Comment ça marche
            </p>
            <ol className="space-y-2.5">
              {[
                `Le collaborateur ouvre le lien (ou scanne le QR) et arrive sur l'inscription, ${pharmacyName} déjà renseignée.`,
                "Il saisit prénom, nom, email et mot de passe, puis valide.",
                "Vous approuvez sa demande dans « Utilisateurs » et lui attribuez son rôle.",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[12px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {i + 1}
                  </span>
                  <span className="text-[13px] leading-snug text-foreground/85">{step}</span>
                </li>
              ))}
            </ol>
            <a
              href="/utilisateurs"
              className="mt-3 inline-flex text-[12.5px] font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
            >
              Ouvrir « Utilisateurs » →
            </a>
          </section>
        </div>

        {/* QR code */}
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-700 dark:text-emerald-400">
            <Camera className="h-4 w-4" /> À scanner avec le téléphone
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-white p-3 dark:border-emerald-950/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt="QR code du lien d'invitation"
              width={220}
              height={220}
              className="h-[220px] w-[220px]"
            />
          </div>
          <p className="max-w-[240px] text-center text-[11.5px] text-muted-foreground">
            Affichez-le sur votre écran ou imprimez-le pour que l&apos;équipe le
            scanne au comptoir.
          </p>
        </section>
      </div>
    </div>
  );
}
