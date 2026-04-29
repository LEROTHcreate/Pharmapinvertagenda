# CLAUDE.md — Instructions pour Claude Code

## Contexte du projet

**PharmaPlanning** est un SaaS de gestion de planning d'équipe pour officines de pharmacie en France.
L'application remplace un fichier Excel complexe utilisé actuellement pour planifier les créneaux de travail de ~20 employés (pharmaciens, préparateurs, étudiants, livreurs, back-office, secrétaires, titulaires).

Le produit cible les pharmacies françaises (marché initial : officines indépendantes de 10 à 30 employés).

## Stack technique

- **Framework** : Next.js 14 (App Router) avec TypeScript
- **Base de données** : PostgreSQL via Supabase (hosted)
- **ORM** : Prisma
- **Auth** : NextAuth.js v5 (Auth.js) avec stratégie credentials (email/mdp)
- **UI** : Tailwind CSS + shadcn/ui
- **State management** : Zustand (pour l'état local du planning)
- **Déploiement** : Netlify (frontend SSR via @netlify/plugin-nextjs)
- **Validation** : Zod (schémas partagés front/back)
- **Tests** : Vitest + Testing Library

## Architecture du projet

```
pharma-planning/
├── prisma/
│   └── schema.prisma          # Schéma BDD complet
│   └── seed.ts                # Données de démo (pharmacie + employés + planning)
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── planning/
│   │   │   │   └── page.tsx           # Vue planning principale (grille)
│   │   │   ├── employes/
│   │   │   │   └── page.tsx           # Gestion des employés (admin)
│   │   │   ├── absences/
│   │   │   │   └── page.tsx           # Gestion des absences/congés
│   │   │   ├── stats/
│   │   │   │   └── page.tsx           # Dashboard heures/stats
│   │   │   └── layout.tsx             # Layout dashboard avec sidebar
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── planning/
│   │   │   │   ├── route.ts           # GET planning, POST bulk update
│   │   │   │   └── [id]/route.ts      # PATCH/DELETE un créneau
│   │   │   ├── employees/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   ├── absences/
│   │   │   │   ├── route.ts           # GET/POST demandes d'absence
│   │   │   │   └── [id]/route.ts      # PATCH validation/refus (admin)
│   │   │   └── export/
│   │   │       └── route.ts           # Export Excel du planning
│   │   ├── layout.tsx
│   │   └── page.tsx                   # Redirect vers /planning ou /login
│   ├── components/
│   │   ├── ui/                        # shadcn/ui components
│   │   ├── planning/
│   │   │   ├── PlanningGrid.tsx       # Grille principale (composant clé)
│   │   │   ├── TimeSlotRow.tsx        # Ligne d'un créneau horaire
│   │   │   ├── EmployeeColumn.tsx     # En-tête colonne employé
│   │   │   ├── CellTask.tsx           # Cellule d'affectation (Cptoir, Para, etc.)
│   │   │   ├── CellAbsence.tsx        # Cellule d'absence (Congé, Maladie, etc.)
│   │   │   ├── StaffingBadge.tsx      # Indicateur effectif par créneau
│   │   │   ├── TaskSelector.tsx       # Modal sélection de poste (admin)
│   │   │   ├── DayTabs.tsx            # Navigation jours de la semaine
│   │   │   ├── WeekNavigator.tsx      # Navigation semaines
│   │   │   ├── HoursRow.tsx           # Ligne récap heures (Hebdo/Quotid/Semaine)
│   │   │   └── Legend.tsx             # Légende couleurs
│   │   ├── absences/
│   │   │   ├── AbsenceRequestForm.tsx
│   │   │   └── AbsenceList.tsx
│   │   ├── stats/
│   │   │   ├── HoursDashboard.tsx
│   │   │   └── StaffingChart.tsx
│   │   └── layout/
│   │       ├── Sidebar.tsx
│   │       ├── Header.tsx
│   │       └── MobileNav.tsx
│   ├── lib/
│   │   ├── prisma.ts                  # Singleton Prisma client
│   │   ├── auth.ts                    # Config NextAuth
│   │   ├── utils.ts                   # Utilitaires généraux
│   │   ├── planning-utils.ts          # Calculs heures, staffing, conflits
│   │   └── export-xlsx.ts             # Génération Excel (exceljs)
│   ├── hooks/
│   │   ├── usePlanning.ts             # Hook principal planning (fetch + mutations)
│   │   ├── useEmployees.ts
│   │   └── useAbsences.ts
│   ├── store/
│   │   └── planning-store.ts          # Zustand store pour état local du planning
│   ├── types/
│   │   └── index.ts                   # Types TypeScript partagés
│   └── validators/
│       ├── planning.ts                # Schémas Zod planning
│       ├── employee.ts
│       └── absence.ts
├── public/
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
├── netlify.toml
└── .env.example
```

## Modèle de données — Points critiques

Le schéma Prisma est dans `prisma/schema.prisma`. Points importants :

### Entités principales

1. **Pharmacy** — Multi-tenant. Chaque pharmacie est isolée. Tous les employés, plannings, absences sont rattachés à une pharmacie.

2. **User** — Compte de connexion. Rôles : `ADMIN` (titulaire/dirigeant) ou `EMPLOYEE` (personnel).
   - Un User est lié à un Employee (relation 1:1 optionnelle).
   - L'admin peut ne pas être un employé planifié (ex: titulaire qui gère mais ne travaille pas).

3. **Employee** — Profil métier : nom, statut (enum), heures hebdo contractuelles, couleur d'affichage.
   - Statuts : `PHARMACIEN`, `PREPARATEUR`, `ETUDIANT`, `LIVREUR`, `BACK_OFFICE`, `SECRETAIRE`, `TITULAIRE`

4. **ScheduleEntry** — Une cellule du planning : `employeeId + date + timeSlot + type (TASK ou ABSENCE) + value (code poste/absence)`.
   - Index composite unique sur `(employeeId, date, timeSlot)` pour éviter les doublons.
   - Le timeSlot est un string "HH:MM" (ex: "08:30").

5. **AbsenceRequest** — Workflow de demande : `employeeId + dateStart + dateEnd + type + status (PENDING/APPROVED/REJECTED) + motif`.

6. **WeekTemplate** — Modèle de semaine type (S1/S2) pour pré-remplir le planning rapidement.

### Codes postes et absences

**Postes (tâches)** — correspondent aux activités observées dans l'Excel :
- `COMPTOIR` (Cptoir) — Dispensation au comptoir
- `COMMANDE` (Comde) — Réception/gestion commandes
- `MISE_A_PRIX` (M/A/P) — Mise à prix / étiquetage
- `PARAPHARMACIE` (Para) — Rayon parapharmacie
- `SECRETARIAT` (Secrét) — Tâches administratives
- `MAIL` (Mail) — Traitement des mails
- `FORMATION` (Form°) — Formation (présent mais en formation)
- `HEURES_SUP` (H Sup) — Heures supplémentaires
- `LIVRAISON` (Livrais) — Livraisons
- `ROBOT` (Robot) — Gestion robot de dispensation
- `REMPLACEMENT` (Rempl) — Remplacement
- `ECHANGE` (Echge) — Échange de poste
- `REUNION_FOURNISSEUR` (Réun.F) — Réunion fournisseurs / représentants labo

**Absences** :
- `ABSENT` — Absent sans précision
- `CONGE` — Congé payé
- `MALADIE` — Arrêt maladie
- `FORMATION_ABS` — Formation externe (absent du site)

### Règles de compatibilité rôle / poste

Chaque statut d'employé n'a accès qu'à un ensemble restreint de postes. Ces règles sont **obligatoires** et reflètent le fonctionnement réel d'une officine de pharmacie.

#### Affectations par rôle

**PHARMACIEN** — Dispensation uniquement :
- Comptoir ✅
- Tout le reste ❌ (pas de secrétariat, pas de téléphone, pas de mail, pas de para, pas de livraison)

**PREPARATEUR** — Polyvalent comptoir + support :
- Comptoir ✅
- Parapharmacie ✅
- Mail ✅
- Mise à prix ✅
- Robot ✅
- Tout le reste ❌

**ETUDIANT** — Comptoir encadré :
- Comptoir ✅
- Tout le reste ❌

**TITULAIRE** — Dispensation + gestion + dépannage livraison :
- Comptoir ✅
- Parapharmacie ✅
- Réunion fournisseur ✅
- Livraison ✅ (assure les tournées en l'absence du livreur)
- Tout le reste ❌

**SECRETAIRE** — Administratif + étiquetage :
- Secrétariat ✅
- Commandes ✅
- Mise à prix ✅
- Tout le reste ❌

**BACK_OFFICE** — Commandes :
- Commandes ✅
- Mise à prix ✅
- Tout le reste ❌

**LIVREUR** — Logistique + étiquetage :
- Livraison ✅
- Mise à prix ✅ (étiquetage entre deux tournées)
- Tout le reste ❌

> **Échange de poste** : seuls les pharmaciens peuvent utiliser le code `ECHANGE` (échange de garde). Pour les autres rôles, on ne propose plus ce poste.
>
> **Remplacement** : le code `REMPLACEMENT` n'est plus proposé dans l'interface (l'enum reste pour compatibilité avec les anciennes données).

#### Postes universels (autorisés pour TOUS les rôles)

Les postes suivants sont transversaux et peuvent être affectés à n'importe quel employé quel que soit son statut :
- `FORMATION` — Formation (sur site ou externe)
- `HEURES_SUP` — Heures supplémentaires

#### Matrice récapitulative

| Poste | Pharmacien | Titulaire | Préparateur | Étudiant | Livreur | Back-office | Secrétaire |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| COMPTOIR | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| PARAPHARMACIE | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| COMMANDE | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| SECRETARIAT | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| MAIL | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| MISE_A_PRIX | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| LIVRAISON | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| ROBOT | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| REUNION_FOURNISSEUR | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| ECHANGE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| FORMATION | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| HEURES_SUP | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> Les absences (Absent, Congé, Maladie, Formation externe) sont toujours applicables à tous les rôles — elles ne sont pas des postes.

#### Implémentation technique

Cette validation doit être appliquée à **3 niveaux** :

1. **Frontend (TaskSelector.tsx)** : quand l'admin clique sur une cellule pour affecter un poste, le modal ne doit afficher QUE les postes autorisés pour le statut de l'employé. Les postes interdits ne sont pas affichés du tout — UX propre, pas de boutons grisés.

2. **API (validation serveur)** : chaque requête POST/PATCH sur `/api/planning` doit vérifier la compatibilité rôle/poste AVANT écriture en BDD. Rejet avec erreur 400 et message explicite :
   `"Le poste SECRETARIAT n'est pas autorisé pour un Pharmacien."`

3. **Application de templates S1/S2** : si un employé a changé de statut depuis la création du template, les créneaux incompatibles sont ignorés silencieusement avec un warning affiché à l'admin après application.

#### Constante de référence — `src/lib/role-task-rules.ts`

```typescript
import type { EmployeeStatus, TaskCode } from '@prisma/client';

// Postes universels autorisés pour tous les rôles
const UNIVERSAL_TASKS: TaskCode[] = ['FORMATION', 'HEURES_SUP'];

// Postes spécifiques autorisés par rôle (hors universels)
const ROLE_SPECIFIC_TASKS: Record<EmployeeStatus, TaskCode[]> = {
  PHARMACIEN:  ['COMPTOIR', 'ECHANGE'],
  TITULAIRE:   ['COMPTOIR', 'PARAPHARMACIE', 'REUNION_FOURNISSEUR', 'LIVRAISON'],
  PREPARATEUR: ['COMPTOIR', 'PARAPHARMACIE', 'MAIL', 'MISE_A_PRIX', 'ROBOT'],
  ETUDIANT:    ['COMPTOIR'],
  LIVREUR:     ['LIVRAISON', 'MISE_A_PRIX'],
  BACK_OFFICE: ['COMMANDE', 'MISE_A_PRIX'],
  SECRETAIRE:  ['SECRETARIAT', 'COMMANDE', 'MISE_A_PRIX'],
};

// Liste complète des postes autorisés pour un rôle
export function getAllowedTasks(status: EmployeeStatus): TaskCode[] {
  return [...ROLE_SPECIFIC_TASKS[status], ...UNIVERSAL_TASKS];
}

// Vérifie si un poste est autorisé pour un rôle donné
export function isTaskAllowed(status: EmployeeStatus, task: TaskCode): boolean {
  return getAllowedTasks(status).includes(task);
}
```

## Conventions de code

### Nommage
- Components : PascalCase (`PlanningGrid.tsx`)
- Hooks : camelCase préfixé `use` (`usePlanning.ts`)
- Utils : camelCase (`planning-utils.ts`)
- Routes API : kebab-case dossiers, `route.ts` fichier
- Types : PascalCase, suffixe explicite si DTO (`ScheduleEntryDTO`)
- Enums Prisma : SCREAMING_SNAKE_CASE

### Patterns obligatoires
- **Server Components par défaut** : Seuls les composants interactifs sont `"use client"`.
- **API routes** : Toujours valider avec Zod avant traitement. Toujours vérifier le rôle (middleware auth).
- **Optimistic updates** : Le planning utilise des mutations optimistes (Zustand) pour fluidité.
- **Responsive** : Mobile-first. La grille planning doit scroller horizontalement sur mobile avec la colonne heure sticky.
- **Accessibilité** : Labels ARIA sur les cellules du planning, navigation clavier possible.

### Style et UI
- Palette principale : tons violets/indigo (cohérent avec le prototype).
- Les cellules de tâches ont un code couleur fixe (voir constante `TASK_COLORS` dans `types/index.ts`).
- Les absences sont visuellement distinctes (fond grisé, jaune, rouge selon le type).
- Le compteur d'effectif par créneau utilise un code couleur vert/orange/rouge selon le seuil min paramétrable.
- Typography : DM Sans (display) + DM Mono (heures/chiffres).

## Logique métier — Règles importantes

### Calcul des heures
- 1 créneau = 30 minutes = 0.5h
- **Heures quotidiennes** = nombre de créneaux avec une TÂCHE (pas les absences) × 0.5
- **Heures hebdomadaires cumulées** = somme des heures quotidiennes sur la semaine
- **Heures supplémentaires** = heures hebdo cumulées − heures contractuelles (si positif)
- **Solde HS/Absences** (HS-Abs dans l'Excel) = heures sup cumulées − heures d'absence cumulées sur le semestre

### Détection sous-effectif
- Seuil minimum configurable par pharmacie (défaut : 4 personnes)
- Comptage par créneau : nombre d'employés ayant une TÂCHE (pas absent)
- Alerte visuelle (orange si < seuil, rouge si < 50% du seuil)
- Un créneau à 0 effectif entre 8h et 20h est critique (rouge clignotant)

### Semaine type S1/S2
- Les pharmacies utilisent souvent 2 modèles de semaine alternés
- L'admin peut créer/éditer les templates S1 et S2
- Bouton "Appliquer template S1/S2" pour pré-remplir une semaine
- Les modifications manuelles après application sont conservées

### Workflow absences
1. L'employé soumet une demande (dates + type + motif optionnel)
2. L'admin reçoit une notification (badge dans la sidebar)
3. L'admin approuve ou refuse
4. Si approuvé, les créneaux correspondants sont automatiquement marqués avec le type d'absence
5. L'employé voit le statut de sa demande

## Commandes de développement

```bash
# Installation
npm install

# Développement
npm run dev

# Base de données
npx prisma generate          # Générer le client
npx prisma db push           # Pousser le schéma
npx prisma db seed           # Seed données démo

# Build
npm run build

# Lint/Format
npm run lint
npm run format
```

## Variables d'environnement

```env
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"
```

## Ordre de développement recommandé

### Phase 1 — Fondations (MVP)
1. Setup Next.js + Prisma + Auth
2. Schéma BDD + seed
3. Page login (simple, email/mdp)
4. Layout dashboard + sidebar
5. **PlanningGrid** — la grille principale (composant le plus critique)
6. API CRUD planning
7. Navigation semaines + jours

### Phase 2 — Fonctionnalités core
8. Édition cellules (admin) avec TaskSelector
9. Calcul et affichage heures (quotid/hebdo/cumul)
10. Indicateur effectif par créneau + alertes sous-effectif
11. Gestion employés (CRUD admin)
12. Bande absents du jour

### Phase 3 — Workflow & Templates
13. Templates semaine S1/S2
14. Workflow demande/validation absences
15. Page statistiques/dashboard heures
16. Export Excel

### Phase 4 — Polish
17. Responsive mobile
18. Notifications (badge absences à valider)
19. Dark mode
20. PWA (installable sur tablette de la pharmacie)

## Notes pour Claude Code

- Quand tu génères un composant, inclus toujours les types TypeScript.
- Utilise `@tanstack/react-query` pour le data fetching côté client (ou SWR si tu préfères, mais reste cohérent).
- Les composants planning sont le cœur de l'app : priorise la performance (virtualisation si > 20 employés, `React.memo` sur les cellules).
- Le planning doit être utilisable sur une tablette en pharmacie : touch-friendly, boutons assez grands.
- Toujours gérer les états loading/error/empty dans les composants.
- Les textes de l'interface sont en français.
- Commente le code en français.
