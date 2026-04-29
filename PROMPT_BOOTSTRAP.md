# ─────────────────────────────────────────────────────────────────
# PROMPT BOOTSTRAP — À coller dans Claude Code pour démarrer le projet
# ─────────────────────────────────────────────────────────────────
#
# Utilisation :
#   1. Ouvre un terminal dans VS Code
#   2. Lance `claude` (Claude Code CLI)
#   3. Colle le contenu ci-dessous
#
# ─────────────────────────────────────────────────────────────────

Initialise le projet "PharmaPlanning" — un SaaS de gestion de planning d'équipe pour pharmacie.

Lis d'abord CLAUDE.md qui contient toutes les spécifications détaillées du projet : stack technique, architecture fichiers, modèle de données, logique métier, conventions de code et ordre de développement.

Lis aussi README.md pour le contexte produit et schema.prisma pour le schéma BDD complet.

Voici ce que je veux que tu fasses maintenant (Phase 1 — MVP) :

## Étape 1 : Setup du projet

1. Initialise un projet Next.js 14 avec App Router et TypeScript :
   ```
   npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
   ```

2. Installe toutes les dépendances :
   ```
   npm install prisma @prisma/client next-auth@beta @auth/prisma-adapter
   npm install zustand @tanstack/react-query zod bcryptjs
   npm install exceljs
   npm install -D @types/bcryptjs
   ```

3. Installe et configure shadcn/ui :
   ```
   npx shadcn@latest init
   ```
   Choisis le thème "Zinc" avec les CSS variables activées.
   Puis ajoute les composants de base :
   ```
   npx shadcn@latest add button input label card dialog select badge separator tabs sheet tooltip dropdown-menu avatar
   ```

4. Copie le fichier schema.prisma dans prisma/schema.prisma et lance :
   ```
   npx prisma generate
   ```

5. Crée le fichier .env avec les variables d'environnement (voir .env.example).

6. Configure le netlify.toml pour le déploiement.

## Étape 2 : Auth + Layout

1. Configure NextAuth.js v5 dans src/lib/auth.ts avec :
   - Strategy credentials (email + mot de passe hashé bcrypt)
   - Session JWT
   - Callbacks pour inclure le rôle (ADMIN/EMPLOYEE) et pharmacyId dans le token/session

2. Crée les pages :
   - src/app/(auth)/login/page.tsx — Page de connexion simple et élégante, palette violet/indigo
   - src/app/(dashboard)/layout.tsx — Layout avec sidebar (navigation : Planning, Employés, Absences, Stats)
   - La sidebar affiche le nom de la pharmacie, le rôle de l'utilisateur, et un bouton déconnexion
   - Sur mobile : sidebar en bottom-nav ou sheet

3. Middleware Next.js : redirige vers /login si non authentifié, vers /planning si authentifié et sur /.

## Étape 3 : La grille Planning (composant central)

C'est LE composant le plus important de l'app. Il doit reproduire fidèlement le format du fichier Excel "Planning_S1_26.xlsx" que j'utilise actuellement.

Structure de la grille :
- **Ligne d'en-tête** : noms des employés en colonnes (sticky top)
- **Sous-en-tête** : statut de chaque employé (Pharmacien, Préparateur, etc.)
- **Ligne "Hebdo"** : heures contractuelles par employé
- **Ligne "Quotid"** : heures du jour par employé (calculé automatiquement)
- **Ligne "Semaine"** : cumul heures de la semaine avec delta vs contrat
- **Corps** : créneaux 30 min (7h30 → 20h00) en lignes, un employé par colonne
- **Colonne "Eff."** : compteur d'effectif actif par créneau (badge vert/orange/rouge)
- **Colonne heure** : sticky left, affiche l'heure pleine en gras et les :30 en plus petit

Chaque cellule affiche un code poste coloré (Cptoir en bleu, Comde en jaune, M/A/P en violet, Para en vert, etc.) ou un statut d'absence (Congé en jaune avec ☀, Maladie en rouge avec ✚, etc.).

Navigation :
- **Onglets jours** en haut : Lundi → Samedi, avec date et badge nombre d'absents
- **Flèches semaine** : semaine précédente / suivante
- **Indicateur** : numéro de semaine + S1/S2

En mode admin : clic sur une cellule → modal de sélection du poste/absence.
En mode employé : lecture seule.

Bande d'alerte en haut si des employés sont absents aujourd'hui.

Réfère-toi au prototype React que j'ai déjà (pharma-planning.jsx) pour l'inspiration visuelle, mais implémente-le proprement avec les vrais composants, le fetching API, et Zustand.

## Étape 4 : API Routes

Crée les routes API suivantes :

### GET /api/planning?pharmacyId=X&weekStart=YYYY-MM-DD
Retourne toutes les ScheduleEntry de la semaine pour la pharmacie.
Groupées par date, puis par employé.
Inclut les infos employés (nom, statut, heures hebdo).

### POST /api/planning
Body : `{ entries: [{ employeeId, date, timeSlot, type, taskCode?, absenceCode? }] }`
Upsert en bulk (crée ou remplace). Utilisé pour l'édition cellule par cellule et l'application de template.
Validation Zod. Vérification rôle ADMIN.

### PATCH /api/planning/[id]
Modifie une entrée existante. Admin only.

### DELETE /api/planning/[id]
Supprime une entrée (efface le créneau). Admin only.

### GET /api/employees?pharmacyId=X
Liste les employés actifs de la pharmacie, triés par displayOrder.

## Étape 5 : Seed de données

Crée prisma/seed.ts qui :
1. Crée une pharmacie de démo "Pharmacie du Pin Vert"
2. Crée les 16 employés du fichier Excel avec leurs vrais noms et statuts
3. Crée 2 users (admin + un employé)
4. Génère 2 semaines de planning réaliste (basé sur les patterns du fichier Excel)

---

Commence par l'étape 1, puis enchaîne les étapes dans l'ordre. À chaque étape, montre-moi le code généré et vérifie qu'il compile. Utilise `npm run dev` pour tester au fur et à mesure.

Rappel important : lis CLAUDE.md en premier, il contient TOUTES les specs.
