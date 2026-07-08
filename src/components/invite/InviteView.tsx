"use client";

import { useState } from "react";
import { UserPlus, Copy, Check, QrCode, Info } from "lucide-react";
import { useToast } from "@/components/ui/toast";

/**
 * Page « Inviter l'équipe » — lien d'inscription (SIRET pré-rempli, mode
 * « rejoindre ») + QR code à montrer aux collaborateurs. Chacun scanne / ouvre
 * le lien, crée son compte, l'admin valide ensuite dans Utilisateurs.
 *
 * Le QR est rendu par un service externe (aucune donnée sensible : le lien ne
 * contient que le SIRET, public). Le lien copiable reste la valeur sûre si le
 * service d'image est indisponible.
 */
export function InviteView({
  link,
  pharmacyName,
  hasSiret,
}: {
  link: string;
  pharmacyName: string;
  hasSiret: boolean;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=${encodeURIComponent(link)}`;

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
      {/* En-tête */}
      <header className="mb-5 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
          <UserPlus className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Inviter l&apos;équipe
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Partagez ce lien ou ce QR code — vos collaborateurs créent leur compte
            en 1 minute, vous validez ensuite.
          </p>
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
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-violet-700"
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
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[12px] font-bold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                    {i + 1}
                  </span>
                  <span className="text-[13px] leading-snug text-foreground/85">{step}</span>
                </li>
              ))}
            </ol>
            <a
              href="/utilisateurs"
              className="mt-3 inline-flex text-[12.5px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400"
            >
              Ouvrir « Utilisateurs » →
            </a>
          </section>
        </div>

        {/* QR code */}
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
            <QrCode className="h-4 w-4" /> À scanner avec le téléphone
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc}
            alt="QR code du lien d'invitation"
            width={220}
            height={220}
            className="h-[220px] w-[220px] rounded-xl bg-white p-2"
          />
          <p className="max-w-[240px] text-center text-[11.5px] text-muted-foreground">
            Affichez-le sur votre écran ou imprimez-le pour que l&apos;équipe le
            scanne au comptoir.
          </p>
        </section>
      </div>
    </div>
  );
}
