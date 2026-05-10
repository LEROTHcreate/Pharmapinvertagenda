import { LegalLayout } from "@/components/legal/LegalLayout";

export const metadata = {
  title: "Politique de confidentialité · PharmaPlanning",
  description:
    "Politique de confidentialité et traitement des données personnelles — PharmaPlanning.",
};

/**
 * Politique de confidentialité — conforme RGPD (UE 2016/679) et loi
 * Informatique et Libertés modifiée.
 *
 * ⚠️ TEMPLATE : à compléter (responsable de traitement, DPO si applicable,
 * sous-traitants exacts) et faire valider juridiquement avant la mise en
 * commercial. La rédaction ici couvre les points obligatoires CNIL :
 * identité, finalités, bases légales, durées, destinataires, droits.
 */
export default function Confidentialite() {
  return (
    <LegalLayout
      title="Politique de confidentialité"
      lastUpdated="10 mai 2026"
    >
      <p>
        La présente politique décrit comment PharmaPlanning collecte, utilise
        et protège vos données personnelles, conformément au Règlement Général
        sur la Protection des Données (RGPD - UE 2016/679) et à la loi
        Informatique et Libertés modifiée.
      </p>

      <h2>1. Responsable de traitement</h2>
      <p>
        Le responsable de traitement est{" "}
        <code className="legal-placeholder">{"{{RAISON_SOCIALE}}"}</code>,
        dont les coordonnées figurent dans les{" "}
        <a href="/mentions-legales">mentions légales</a>.
      </p>
      <p>
        Pour exercer vos droits ou pour toute question relative à vos données
        personnelles&nbsp;:{" "}
        <a href="mailto:contact@pharmaplanning.fr">contact@pharmaplanning.fr</a>
        .
      </p>

      <h2>2. Données collectées</h2>
      <p>
        Nous collectons uniquement les données nécessaires au fonctionnement
        du service&nbsp;:
      </p>
      <ul>
        <li>
          <strong>Données de compte&nbsp;:</strong> nom, prénom, adresse
          email, mot de passe (haché, jamais stocké en clair), avatar choisi.
        </li>
        <li>
          <strong>Données métier&nbsp;:</strong> nom de l&apos;officine,
          adresse, téléphone, SIRET (facultatif), équipe (rôle, heures
          contractuelles, date d&apos;embauche), planning, absences.
        </li>
        <li>
          <strong>Données de communication&nbsp;:</strong> messages échangés
          dans la messagerie interne, pièces jointes éventuelles.
        </li>
        <li>
          <strong>Données techniques&nbsp;:</strong> dates de connexion (à
          des fins d&apos;audit de sécurité), adresse IP de la requête (logs
          du serveur, conservés 30 jours), type de navigateur.
        </li>
      </ul>
      <p>
        Aucune donnée de paiement n&apos;est collectée pendant la phase
        pilote (le service est gratuit). Aucun cookie publicitaire ni
        traqueur tiers n&apos;est déposé.
      </p>

      <h2>3. Finalités et bases légales</h2>
      <ul>
        <li>
          <strong>Fournir le service&nbsp;:</strong> exécution du contrat
          (article 6.1.b du RGPD). Sans ces données, le service ne peut pas
          fonctionner.
        </li>
        <li>
          <strong>Sécurité du service&nbsp;:</strong> intérêt légitime
          (article 6.1.f) — détection des accès frauduleux, protection contre
          les abus.
        </li>
        <li>
          <strong>Communications transactionnelles&nbsp;:</strong> exécution
          du contrat (notifications d&apos;approbation de compte, demandes
          d&apos;absence à valider, réinitialisation de mot de passe).
        </li>
        <li>
          <strong>Statistiques d&apos;usage interne&nbsp;:</strong> intérêt
          légitime, sur données agrégées et anonymisées uniquement.
        </li>
      </ul>

      <h2>4. Destinataires</h2>
      <p>Vos données sont accessibles uniquement par&nbsp;:</p>
      <ul>
        <li>
          <strong>Vous-même</strong> et les membres de votre officine ayant
          un compte (selon leur rôle&nbsp;: admin ou collaborateur).
        </li>
        <li>
          <strong>L&apos;éditeur du service</strong> (compte support
          technique), uniquement pour les opérations de maintenance,
          d&apos;assistance ou de modération signalées.
        </li>
        <li>
          <strong>Nos sous-traitants techniques</strong>, dans la stricte
          limite de leur mission&nbsp;:
          <ul>
            <li>
              <strong>Vercel Inc.</strong> (USA) — hébergement de
              l&apos;application web. Transferts couverts par les Clauses
              Contractuelles Types de la Commission Européenne.
            </li>
            <li>
              <strong>Supabase Inc.</strong> — base de données PostgreSQL,
              région UE (Irlande). Aucun transfert hors UE pour le stockage
              des données métier.
            </li>
            <li>
              <strong>Google (Gmail SMTP)</strong> — envoi des emails
              transactionnels. Couvert par les CCT.
            </li>
          </ul>
        </li>
      </ul>
      <p>
        Vos données ne sont jamais vendues, louées ou cédées à des tiers à
        des fins commerciales.
      </p>

      <h2>5. Durée de conservation</h2>
      <ul>
        <li>
          <strong>Compte actif&nbsp;:</strong> tant que le compte est actif et
          jusqu&apos;à 6 mois après la dernière connexion.
        </li>
        <li>
          <strong>Compte supprimé&nbsp;:</strong> suppression effective dans
          un délai maximum de 30 jours après la demande.
        </li>
        <li>
          <strong>Logs de connexion / sécurité&nbsp;:</strong> 30 jours
          glissants.
        </li>
        <li>
          <strong>Données de planning historiques&nbsp;:</strong> conservées
          tant que le compte de l&apos;officine est actif (utiles pour les
          stats long-terme et la conformité travail). L&apos;admin peut les
          purger manuellement à tout moment.
        </li>
      </ul>

      <h2>6. Sécurité</h2>
      <p>Nous mettons en œuvre des mesures techniques et organisationnelles&nbsp;:</p>
      <ul>
        <li>chiffrement des communications (HTTPS / TLS 1.2+)&nbsp;;</li>
        <li>
          mots de passe stockés sous forme de hash bcrypt (jamais en
          clair)&nbsp;;
        </li>
        <li>
          isolation stricte des données par officine (multi-tenant), aucune
          fuite possible entre comptes&nbsp;;
        </li>
        <li>
          tokens de réinitialisation de mot de passe à durée limitée et à
          usage unique&nbsp;;
        </li>
        <li>
          sauvegardes quotidiennes automatiques côté Supabase, conservées 7
          jours.
        </li>
      </ul>

      <h2>7. Vos droits</h2>
      <p>
        Conformément au RGPD, vous disposez des droits suivants sur vos
        données personnelles&nbsp;:
      </p>
      <ul>
        <li>
          <strong>Droit d&apos;accès&nbsp;:</strong> obtenir une copie de vos
          données.
        </li>
        <li>
          <strong>Droit de rectification&nbsp;:</strong> corriger une donnée
          inexacte ou incomplète.
        </li>
        <li>
          <strong>Droit à l&apos;effacement (droit à l&apos;oubli)&nbsp;:</strong>{" "}
          demander la suppression de vos données.
        </li>
        <li>
          <strong>Droit à la limitation&nbsp;:</strong> demander la
          suspension d&apos;un traitement.
        </li>
        <li>
          <strong>Droit à la portabilité&nbsp;:</strong> récupérer vos
          données dans un format structuré et lisible (export Excel
          disponible depuis l&apos;application).
        </li>
        <li>
          <strong>Droit d&apos;opposition&nbsp;:</strong> vous opposer à un
          traitement reposant sur l&apos;intérêt légitime.
        </li>
        <li>
          <strong>Droit de définir des directives post-mortem</strong> sur le
          sort de vos données après votre décès.
        </li>
      </ul>
      <p>
        Pour exercer ces droits, écrivez à{" "}
        <a href="mailto:contact@pharmaplanning.fr">contact@pharmaplanning.fr</a>{" "}
        depuis l&apos;adresse email associée à votre compte. Une réponse vous
        sera apportée sous un délai d&apos;un mois.
      </p>
      <p>
        En cas de désaccord sur le traitement de vos données, vous avez le
        droit d&apos;introduire une réclamation auprès de la CNIL (3 place
        de Fontenoy - TSA 80715 - 75334 Paris Cedex 07,{" "}
        <a
          href="https://www.cnil.fr"
          target="_blank"
          rel="noopener noreferrer"
        >
          www.cnil.fr
        </a>
        ).
      </p>

      <h2>8. Cookies</h2>
      <p>
        PharmaPlanning utilise uniquement des cookies <strong>strictement
        nécessaires</strong> au fonctionnement du service&nbsp;:
      </p>
      <ul>
        <li>
          <strong>Cookie de session&nbsp;:</strong> maintien de votre
          connexion authentifiée. Sans ce cookie, vous seriez déconnecté à
          chaque navigation. Durée 30 jours.
        </li>
        <li>
          <strong>Cookie CSRF&nbsp;:</strong> protection contre les attaques
          de type «&nbsp;cross-site request forgery&nbsp;». Durée d&apos;une
          session.
        </li>
      </ul>
      <p>
        Aucun cookie publicitaire, analytique tiers (Google Analytics,
        Facebook Pixel…) ou de profilage n&apos;est utilisé. À ce titre, le
        consentement préalable n&apos;est pas requis (article 82 de la loi
        Informatique et Libertés).
      </p>

      <h2>9. Modification de la politique</h2>
      <p>
        Cette politique peut être mise à jour pour refléter une évolution du
        service ou de la réglementation. Les modifications substantielles
        sont notifiées par email aux Utilisateurs concernés. La date de
        dernière mise à jour figure en haut de cette page.
      </p>

      <h2>10. Contact</h2>
      <p>
        Pour toute demande relative à vos données personnelles ou à cette
        politique&nbsp;:{" "}
        <a href="mailto:contact@pharmaplanning.fr">contact@pharmaplanning.fr</a>
        .
      </p>
    </LegalLayout>
  );
}
