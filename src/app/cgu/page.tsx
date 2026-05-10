import { LegalLayout } from "@/components/legal/LegalLayout";

export const metadata = {
  title: "Conditions Générales d'Utilisation · PharmaPlanning",
  description: "Conditions générales d'utilisation du service PharmaPlanning.",
};

/**
 * CGU — Conditions Générales d'Utilisation.
 *
 * ⚠️ TEMPLATE : à compléter et faire valider juridiquement avant
 * la mise en commercial. Les passages avec des placeholders doivent
 * être adaptés (raison sociale, juridiction…). Les clauses tarifs
 * sont à revoir le jour où une formule payante existera.
 */
export default function CGU() {
  return (
    <LegalLayout
      title="Conditions Générales d'Utilisation"
      lastUpdated="10 mai 2026"
    >
      <p>
        Les présentes Conditions Générales d&apos;Utilisation (ci-après «&nbsp;CGU&nbsp;»)
        régissent l&apos;accès et l&apos;utilisation du service PharmaPlanning,
        accessible à l&apos;adresse{" "}
        <code className="legal-placeholder">{"{{URL_PRODUCTION}}"}</code> et
        édité par{" "}
        <code className="legal-placeholder">{"{{RAISON_SOCIALE}}"}</code> (cf.{" "}
        <a href="/mentions-legales">mentions légales</a>).
      </p>

      <h2>1. Objet</h2>
      <p>
        PharmaPlanning est un service en ligne (SaaS) destiné aux officines de
        pharmacie souhaitant gérer le planning de leur équipe, les absences,
        les heures supplémentaires et la communication interne. Le service est
        fourni «&nbsp;en l&apos;état&nbsp;», pour un usage professionnel
        exclusivement.
      </p>

      <h2>2. Acceptation et opposabilité</h2>
      <p>
        L&apos;inscription au service vaut acceptation pleine et entière des
        présentes CGU. L&apos;Utilisateur reconnaît avoir pris connaissance des
        CGU et de la <a href="/confidentialite">politique de confidentialité</a>{" "}
        avant la création de son compte.
      </p>

      <h2>3. Description du service</h2>
      <p>Le service inclut notamment&nbsp;:</p>
      <ul>
        <li>la gestion d&apos;un planning hebdomadaire d&apos;équipe&nbsp;;</li>
        <li>la création et l&apos;application de gabarits de semaines types&nbsp;;</li>
        <li>la gestion des demandes d&apos;absence et leur validation&nbsp;;</li>
        <li>le calcul automatique des heures travaillées et heures supplémentaires&nbsp;;</li>
        <li>une messagerie interne entre membres de l&apos;équipe&nbsp;;</li>
        <li>l&apos;export du planning au format Excel et A4 imprimable.</li>
      </ul>

      <h2>4. Inscription et compte</h2>
      <p>
        L&apos;inscription est ouverte aux titulaires d&apos;officine et aux
        membres de leur équipe. Les comptes salariés sont validés par
        l&apos;administrateur de l&apos;officine après vérification.
        L&apos;Utilisateur s&apos;engage à fournir des informations exactes et
        à les maintenir à jour. Il est responsable de la confidentialité de
        ses identifiants de connexion.
      </p>

      <h2>5. Obligations de l&apos;Utilisateur</h2>
      <p>L&apos;Utilisateur s&apos;engage à&nbsp;:</p>
      <ul>
        <li>
          ne pas utiliser le service à des fins illicites, frauduleuses ou
          contraires aux bonnes mœurs&nbsp;;
        </li>
        <li>
          ne pas tenter d&apos;accéder à des comptes ou des données
          d&apos;autres officines&nbsp;;
        </li>
        <li>
          ne pas perturber le fonctionnement du service (intrusion, déni de
          service, ingénierie inverse…)&nbsp;;
        </li>
        <li>
          respecter le droit à l&apos;image et à la vie privée des autres
          membres de son équipe lorsqu&apos;il publie un contenu (avatar,
          message, pièce jointe).
        </li>
      </ul>

      <h2>6. Propriété intellectuelle</h2>
      <p>
        L&apos;ensemble du service (logiciel, marque, logo, design, code
        source, documentation) est la propriété exclusive de l&apos;éditeur ou
        de ses concédants. Aucune licence n&apos;est accordée à
        l&apos;Utilisateur en dehors de l&apos;usage strictement nécessaire à
        l&apos;utilisation normale du service.
      </p>
      <p>
        Les données saisies par l&apos;Utilisateur (planning, équipe, absences,
        messages) lui appartiennent. L&apos;éditeur ne s&apos;arroge aucun
        droit dessus, en dehors du strict nécessaire pour fournir le service.
      </p>

      <h2>7. Données personnelles</h2>
      <p>
        Le traitement des données personnelles (collecte, conservation, droits
        des personnes) est détaillé dans la{" "}
        <a href="/confidentialite">politique de confidentialité</a>, qui fait
        partie intégrante des présentes CGU.
      </p>

      <h2>8. Tarifs</h2>
      <p>
        Le service est gratuit pendant la phase pilote actuelle. L&apos;éditeur
        se réserve le droit de proposer des formules payantes à l&apos;avenir,
        avec un préavis de trente (30) jours avant prise d&apos;effet.
        L&apos;Utilisateur sera alors libre de continuer à utiliser le service
        gratuit (s&apos;il existe encore), de souscrire à une formule payante,
        ou de résilier son compte sans frais.
      </p>

      <h2>9. Disponibilité</h2>
      <p>
        L&apos;éditeur s&apos;efforce d&apos;assurer une disponibilité du
        service 24h/24, 7j/7, mais ne peut garantir aucune disponibilité
        ininterrompue compte tenu des aléas techniques inhérents à Internet.
        Des opérations de maintenance peuvent être effectuées, idéalement en
        dehors des heures d&apos;ouverture des officines.
      </p>

      <h2>10. Responsabilité</h2>
      <p>
        L&apos;éditeur ne saurait être tenu responsable des dommages indirects
        (perte d&apos;exploitation, perte de chance…) résultant de
        l&apos;utilisation ou de l&apos;impossibilité d&apos;utiliser le
        service. Sa responsabilité est limitée, en tout état de cause, au
        montant des sommes versées par l&apos;Utilisateur au titre de
        l&apos;abonnement sur les douze (12) mois précédant le sinistre.
      </p>
      <p>
        L&apos;Utilisateur reconnaît que le calcul des heures et la
        planification fournis par le service ont valeur indicative. Ils ne
        remplacent en aucun cas un bulletin de paie ou un registre du personnel
        légalement requis. Il appartient à l&apos;Utilisateur de vérifier la
        conformité avec sa convention collective et le Code du travail.
      </p>

      <h2>11. Suspension et résiliation</h2>
      <p>
        L&apos;Utilisateur peut résilier son compte à tout moment depuis la
        page «&nbsp;Paramètres&nbsp;» ou en écrivant à{" "}
        <a href="mailto:contact@pharmaplanning.fr">contact@pharmaplanning.fr</a>
        . En cas de manquement grave aux présentes CGU, l&apos;éditeur peut
        suspendre ou résilier le compte sans préavis et sans indemnité, après
        notification par email lorsque cela est possible.
      </p>
      <p>
        À la suppression du compte, les données associées sont supprimées dans
        un délai maximum de trente (30) jours, sauf obligation légale de
        conservation. L&apos;Utilisateur peut demander un export préalable de
        ses données.
      </p>

      <h2>12. Modification des CGU</h2>
      <p>
        L&apos;éditeur se réserve le droit de modifier les présentes CGU. Les
        modifications substantielles sont notifiées par email et affichées sur
        le service au moins quinze (15) jours avant leur entrée en vigueur. La
        poursuite de l&apos;utilisation du service après cette date vaut
        acceptation des nouvelles CGU.
      </p>

      <h2>13. Droit applicable et juridiction</h2>
      <p>
        Les présentes CGU sont soumises au droit français. Tout litige relatif
        à leur interprétation ou à leur exécution relève, à défaut
        d&apos;accord amiable, de la compétence exclusive des tribunaux du
        ressort de la cour d&apos;appel du siège de l&apos;éditeur.
      </p>

      <h2>14. Contact</h2>
      <p>
        Pour toute question relative aux présentes CGU&nbsp;:{" "}
        <a href="mailto:contact@pharmaplanning.fr">contact@pharmaplanning.fr</a>
        .
      </p>
    </LegalLayout>
  );
}
