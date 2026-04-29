# ℞ PharmaPlanning

**Gestion de planning d'équipe pour officines de pharmacie**

PharmaPlanning est un outil SaaS conçu pour les pharmacies françaises, permettant de visualiser et gérer le planning de toute l'équipe en un seul écran. Il remplace les fichiers Excel traditionnels par une interface web moderne, collaborative et accessible depuis n'importe quel appareil.

---

## Le problème

Les pharmacies gèrent le planning de 10 à 30 employés avec des rôles variés (pharmaciens, préparateurs, livreurs, secrétaires...) à travers des fichiers Excel complexes. Ces fichiers :

- Ne sont pas collaboratifs (un seul utilisateur à la fois)
- Ne permettent pas au personnel de consulter facilement leur planning
- N'alertent pas en cas de sous-effectif
- Ne proposent pas de workflow pour les demandes de congés
- Sont difficiles à maintenir sur le long terme

## La solution

PharmaPlanning offre une vue grille identique au format Excel existant (créneaux 30 min × employés) avec en plus :

- **Vue en temps réel** pour toute l'équipe
- **Deux niveaux d'accès** : dirigeant (lecture + édition) et personnel (lecture seule + demandes)
- **Alertes sous-effectif** avec seuil paramétrable
- **Suivi des heures** : quotidiennes, hebdomadaires, heures sup, solde semestre
- **Workflow absences** : demande → validation → application automatique au planning
- **Templates S1/S2** pour pré-remplir les semaines types
- **Export Excel** pour compatibilité avec l'existant

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| State | Zustand + React Query |
| Backend | Next.js API Routes |
| BDD | PostgreSQL (Supabase) |
| ORM | Prisma |
| Auth | NextAuth.js v5 |
| Validation | Zod |
| Déploiement | Netlify |

## Installation

### Prérequis

- Node.js 18+
- npm ou pnpm
- Un compte Supabase (ou PostgreSQL local)

### Setup

```bash
# 1. Cloner le repo
git clone https://github.com/ton-user/pharma-planning.git
cd pharma-planning

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env
# Remplir DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL

# 4. Initialiser la base de données
npx prisma generate
npx prisma db push
npx prisma db seed

# 5. Lancer le serveur de développement
npm run dev
```

L'application est accessible sur `http://localhost:3000`.

### Comptes de démo (après seed)

| Rôle | Email | Mot de passe |
|------|-------|-------------|
| Dirigeant (admin) | admin@pharmacie-demo.fr | admin123 |
| Personnel | agnes@pharmacie-demo.fr | employe123 |

---

## Fonctionnalités

### Vue Planning (page principale)

La grille de planning reproduit le format Excel existant :

- **Colonnes** : un employé par colonne, avec nom et statut
- **Lignes** : créneaux de 30 minutes de 7h30 à 20h00
- **Cellules** : code poste coloré (Comptoir, Commande, Parapharmacie, etc.) ou statut d'absence
- **En-tête** : heures contractuelles, heures du jour, cumul semaine avec écart
- **Colonne effectif** : compteur de personnel actif par créneau avec code couleur vert/orange/rouge

Navigation par onglets jour (Lundi → Samedi) et flèches semaine.

### Rôle Dirigeant

- Éditer n'importe quelle cellule du planning (clic → sélection poste)
- Gérer les employés (ajout, modification, désactivation)
- Valider/refuser les demandes d'absence
- Paramétrer le seuil minimum d'effectif
- Créer et appliquer des templates de semaine (S1/S2)
- Exporter le planning en Excel
- Voir le dashboard statistiques

### Rôle Personnel

- Consulter le planning de toute l'équipe (lecture seule)
- Voir son planning personnel et ses heures
- Soumettre des demandes d'absence (congé, formation)
- Suivre le statut de ses demandes

### Codes postes

| Code | Signification | Couleur |
|------|--------------|---------|
| Cptoir | Comptoir (dispensation) | Bleu |
| Comde | Commandes | Jaune |
| M/A/P | Mise à prix | Violet |
| Para | Parapharmacie | Vert |
| Secrét | Secrétariat | Rose |
| Mail | Traitement des mails | Lavande |
| Form° | Formation (sur site) | Indigo |
| H Sup | Heures supplémentaires | Orange |
| Livrais | Livraison | Vert clair |
| Robot | Robot de dispensation | Gris |
| Rempl | Remplacement | Ardoise |
| Echge | Échange de poste | Émeraude |
| Réun.F | Réunion fournisseurs | Rose foncé |

### Types d'absence

| Type | Icône | Couleur |
|------|-------|---------|
| Absent | ○ | Gris |
| Congé | ☀ | Jaune |
| Maladie | ✚ | Rouge |
| Formation (ext.) | ▣ | Indigo |

---

## Déploiement Netlify

```toml
# netlify.toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

```bash
# Installer le plugin Netlify
npm install -D @netlify/plugin-nextjs

# Déployer
netlify deploy --prod
```

Variables d'environnement à configurer dans Netlify Dashboard :
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL` (URL du site déployé)

---

## Structure du projet

Voir `CLAUDE.md` pour l'arborescence complète et les conventions de code.

## Roadmap

- [x] Prototype interactif (React)
- [ ] **Phase 1** — MVP : auth + grille planning + CRUD
- [ ] **Phase 2** — Heures, effectifs, gestion employés
- [ ] **Phase 3** — Templates S1/S2, workflow absences, stats
- [ ] **Phase 4** — Responsive, PWA, dark mode
- [ ] **Phase 5** — Multi-pharmacie, notifications push, intégration comptable

## Licence

Propriétaire — Tous droits réservés.
