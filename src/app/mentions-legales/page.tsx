import { LegalLayout } from "@/components/legal/LegalLayout";

export const metadata = {
  title: "Mentions légales · PharmaPlanning",
  description: "Mentions légales du service PharmaPlanning.",
};

/**
 * Mentions légales — obligation LCEN art. 6, II.
 *
 * ⚠️ TEMPLATE : à compléter avant mise en production.
 * Les valeurs entre <code className="legal-placeholder">…</code> doivent
 * être remplacées par les informations réelles de l'éditeur. Sans cela,
 * la page reste publiable mais l'obligation légale n'est pas remplie.
 *
 * NB : ces mentions ne tiennent pas lieu de conseil juridique.
 * Faire valider par un avocat avant ouverture commerciale.
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
        <strong>Raison sociale :</strong>{" "}
        <code className="legal-placeholder">{"{{RAISON_SOCIALE}}"}</code>
        <br />
        <strong>Forme juridique :</strong>{" "}
        <code className="legal-placeholder">{"{{FORME_JURIDIQUE}}"}</code>{" "}
        (SAS, SARL, EURL, micro-entreprise…)
        <br />
        <strong>Capital social :</strong>{" "}
        <code className="legal-placeholder">{"{{CAPITAL_SOCIAL}}"}</code> €
        <br />
        <strong>Siège social :</strong>{" "}
        <code className="legal-placeholder">{"{{ADRESSE_SIEGE}}"}</code>
        <br />
        <strong>SIRET :</strong>{" "}
        <code className="legal-placeholder">{"{{SIRET}}"}</code>
        <br />
        <strong>RCS :</strong>{" "}
        <code className="legal-placeholder">{"{{RCS_VILLE_NUMERO}}"}</code>
        <br />
        <strong>N° TVA intracommunautaire :</strong>{" "}
        <code className="legal-placeholder">{"{{TVA_INTRA}}"}</code>
        <br />
        <strong>Téléphone :</strong>{" "}
        <code className="legal-placeholder">{"{{TELEPHONE}}"}</code>
        <br />
        <strong>Email :</strong>{" "}
        <a href="mailto:contact@pharmaplanning.fr">contact@pharmaplanning.fr</a>
      </p>

      <h2>Directeur de la publication</h2>
      <p>
        <code className="legal-placeholder">{"{{NOM_DIRECTEUR_PUBLICATION}}"}</code>
        , en qualité de{" "}
        <code className="legal-placeholder">
          {"{{QUALITE_DIRECTEUR_PUBLICATION}}"}
        </code>{" "}
        (gérant, président, dirigeant…).
      </p>

      <h2>Hébergement</h2>
      <p>
        Le site est hébergé par <strong>Vercel Inc.</strong> — 340 S Lemon Ave
        #4133, Walnut, CA 91789, USA. Site web :{" "}
        <a
          href="https://vercel.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          vercel.com
        </a>
        .
      </p>
      <p>
        Les données utilisateurs sont stockées sur l&apos;infrastructure de{" "}
        <strong>Supabase</strong> dans la région Europe (Irlande). Supabase Inc.
        — 970 Toa Payoh North #07-04, Singapore 318992. Site web :{" "}
        <a
          href="https://supabase.com"
          target="_blank"
          rel="noopener noreferrer"
        >
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
        <a href="mailto:contact@pharmaplanning.fr">contact@pharmaplanning.fr</a>
        . Pour exercer vos droits RGPD, consultez la{" "}
        <a href="/confidentialite">politique de confidentialité</a>.
      </p>
    </LegalLayout>
  );
}
