import { LegalLayout } from "@/components/legal/LegalLayout";
import { LEGAL, type LegalField } from "@/lib/legal-info";

export const metadata = {
  title: "Mentions légales · PharmaPlanning",
  description: "Mentions légales du service PharmaPlanning.",
};

/**
 * Mentions légales — obligation LCEN art. 6, II.
 *
 * Les informations de l'éditeur proviennent de variables d'environnement
 * (cf. src/lib/legal-info.ts). Les champs non renseignés s'affichent « à
 * renseigner » (repli honnête). À compléter avant ouverture commerciale ;
 * faire valider par un conseil juridique.
 */
export default function MentionsLegales() {
  return (
    <LegalLayout title="Mentions légales" lastUpdated="10 mai 2026">
      <p>
        Conformément aux dispositions de l&apos;article 6 de la loi n° 2004-575
        du 21 juin 2004 pour la confiance dans l&apos;économie numérique, il
        est précisé aux utilisateurs du site PharmaPlanning l&apos;identité des
        différents intervenants dans le cadre de sa réalisation et de son
        suivi.
      </p>

      <h2>Éditeur du site</h2>
      <p>
        <strong>Raison sociale :</strong> <Value f={LEGAL.raisonSociale} />
        <br />
        <strong>Forme juridique :</strong> <Value f={LEGAL.formeJuridique} />
        <br />
        <strong>Capital social :</strong> <Value f={LEGAL.capitalSocial} suffix=" €" />
        <br />
        <strong>Siège social :</strong> <Value f={LEGAL.adresseSiege} />
        <br />
        <strong>SIRET :</strong> <Value f={LEGAL.siret} />
        <br />
        <strong>RCS :</strong> <Value f={LEGAL.rcs} />
        <br />
        <strong>N° TVA intracommunautaire :</strong> <Value f={LEGAL.tvaIntra} />
        <br />
        <strong>Téléphone :</strong> <Value f={LEGAL.telephone} />
        <br />
        <strong>Email :</strong>{" "}
        <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
      </p>

      <h2>Directeur de la publication</h2>
      <p>
        <Value f={LEGAL.directeurPublication} />, en qualité de{" "}
        <Value f={LEGAL.qualiteDirecteur} /> (gérant, président, dirigeant…).
      </p>

      <h2>Hébergement</h2>
      <p>
        Le site est hébergé par <strong>Vercel Inc.</strong> — 340 S Lemon Ave
        #4133, Walnut, CA 91789, USA. Site web :{" "}
        <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">
          vercel.com
        </a>
        .
      </p>
      <p>
        Les données utilisateurs sont stockées sur l&apos;infrastructure de{" "}
        <strong>Supabase</strong> dans la région Europe (Irlande). Supabase Inc.
        — 970 Toa Payoh North #07-04, Singapore 318992. Site web :{" "}
        <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">
          supabase.com
        </a>
        .
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        L&apos;ensemble du site (interface, code source, marque PharmaPlanning,
        logo, contenus rédactionnels) est protégé par le droit d&apos;auteur et
        constitue la propriété exclusive de l&apos;éditeur. Toute reproduction,
        représentation ou exploitation, totale ou partielle, sans autorisation
        écrite préalable, est interdite.
      </p>

      <h2>Crédits</h2>
      <p>
        Iconographie : Lucide Icons (licence ISC). Polices : DM Sans, DM Mono
        (licence SIL Open Font License). Frameworks : Next.js, Tailwind CSS,
        Prisma.
      </p>

      <h2>Contact</h2>
      <p>
        Pour toute question relative au site, à un signalement de contenu ou
        une demande relative aux données personnelles, merci d&apos;écrire à{" "}
        <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. Pour exercer vos
        droits RGPD, consultez la{" "}
        <a href="/confidentialite">politique de confidentialité</a>.
      </p>
    </LegalLayout>
  );
}

/** Affiche la valeur si renseignée, sinon un repli « à renseigner » discret. */
function Value({ f, suffix }: { f: LegalField; suffix?: string }) {
  if (f.value === null) {
    return (
      <em
        title={`À définir via la variable d'environnement ${f.envVar}`}
        className="legal-placeholder text-muted-foreground"
      >
        à renseigner
      </em>
    );
  }
  return (
    <>
      {f.value}
      {suffix ?? ""}
    </>
  );
}
