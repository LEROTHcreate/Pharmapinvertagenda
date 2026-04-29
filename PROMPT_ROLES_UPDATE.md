# INSTRUCTIONS — Mise à jour des règles rôle/poste

Tu dois intégrer les modifications suivantes dans les fichiers CLAUDE.md, schema.prisma, et README.md du projet PharmaPlanning. Lis chaque section attentivement et applique les changements.

---

## 1. Nouveau poste à ajouter

Ajouter le poste `REUNION_FOURNISSEUR` (abréviation : "Réun.F") partout où les postes sont listés.
- Description : Réunion avec les fournisseurs / représentants labo
- Couleur suggérée : bg `#fdf2f8`, text `#831843`, border `#f9a8d4` (rose foncé)

### Dans schema.prisma :
Ajouter `REUNION_FOURNISSEUR` dans l'enum `TaskCode`, après `ECHANGE`.

### Dans CLAUDE.md — section "Codes postes et absences" :
Ajouter la ligne :
```
- `REUNION_FOURNISSEUR` (Réun.F) — Réunion fournisseurs / représentants labo
```

### Dans README.md — tableau "Codes postes" :
Ajouter la ligne :
```
| Réun.F | Réunion fournisseurs | Rose foncé |
```

---

## 2. Remplacement complet de la matrice rôle/poste

Remplacer TOUTE la section "Règles de compatibilité rôle / poste" du CLAUDE.md par le contenu ci-dessous. Ne pas fusionner avec l'ancienne, la remplacer entièrement.

```markdown
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
- Tout le reste ❌

**ETUDIANT** — Comptoir encadré :
- Comptoir ✅
- Tout le reste ❌

**TITULAIRE** — Dispensation + gestion :
- Comptoir ✅
- Parapharmacie ✅
- Réunion fournisseur ✅
- Tout le reste ❌

**SECRETAIRE** — Administratif :
- Secrétariat ✅
- Commandes ✅
- Tout le reste ❌

**BACK_OFFICE** — Commandes :
- Commandes ✅
- Tout le reste ❌

**LIVREUR** — Logistique :
- Livraison ✅
- Tout le reste ❌

#### Postes universels (autorisés pour TOUS les rôles)

Les postes suivants sont transversaux et peuvent être affectés à n'importe quel employé quel que soit son statut :
- `FORMATION` — Formation (sur site ou externe)
- `HEURES_SUP` — Heures supplémentaires
- `REMPLACEMENT` — Remplacement ponctuel
- `ECHANGE` — Échange de créneau entre employés

#### Matrice récapitulative

| Poste | Pharmacien | Titulaire | Préparateur | Étudiant | Livreur | Back-office | Secrétaire |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| COMPTOIR | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| PARAPHARMACIE | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| COMMANDE | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| SECRETARIAT | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| MAIL | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| LIVRAISON | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| REUNION_FOURNISSEUR | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| FORMATION | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| HEURES_SUP | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| REMPLACEMENT | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ECHANGE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

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
const UNIVERSAL_TASKS: TaskCode[] = [
  'FORMATION',
  'HEURES_SUP',
  'REMPLACEMENT',
  'ECHANGE',
];

// Postes spécifiques autorisés par rôle (hors universels)
const ROLE_SPECIFIC_TASKS: Record<EmployeeStatus, TaskCode[]> = {
  PHARMACIEN:  ['COMPTOIR'],
  TITULAIRE:   ['COMPTOIR', 'PARAPHARMACIE', 'REUNION_FOURNISSEUR'],
  PREPARATEUR: ['COMPTOIR', 'PARAPHARMACIE', 'MAIL'],
  ETUDIANT:    ['COMPTOIR'],
  LIVREUR:     ['LIVRAISON'],
  BACK_OFFICE: ['COMMANDE'],
  SECRETAIRE:  ['SECRETARIAT', 'COMMANDE'],
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
```

---

## 3. Nettoyage des postes obsolètes

Les postes suivants présents dans la version précédente doivent être **supprimés** du schema.prisma (enum TaskCode), du CLAUDE.md et du README.md car ils ne correspondent pas au fonctionnement réel :
- `MISE_A_PRIX` (M/A/P)
- `TELEPHONE` (Tél)
- `ROBOT`
- `PREPARATION` (Prép)

Si ces codes apparaissent dans d'autres sections du CLAUDE.md (exemples, constantes, descriptions), les retirer aussi.

### Dans schema.prisma — enum TaskCode :
Le résultat final doit être :
```prisma
enum TaskCode {
  COMPTOIR
  COMMANDE
  PARAPHARMACIE
  SECRETARIAT
  MAIL
  FORMATION
  HEURES_SUP
  LIVRAISON
  REMPLACEMENT
  ECHANGE
  REUNION_FOURNISSEUR
}
```

---

## 4. Vérification finale

Après toutes les modifications, vérifie que :
- [ ] L'enum `TaskCode` dans schema.prisma contient exactement 11 valeurs (les 7 rôle-spécifiques + les 4 universels)
- [ ] La matrice dans CLAUDE.md a 11 lignes (7 spécifiques + 4 universels)
- [ ] La constante `ROLE_SPECIFIC_TASKS` dans CLAUDE.md correspond exactement à la matrice
- [ ] Le README.md liste les 11 postes dans son tableau
- [ ] Aucune mention de MISE_A_PRIX, TELEPHONE, ROBOT, ou PREPARATION ne subsiste dans les fichiers
- [ ] Le nouveau poste REUNION_FOURNISSEUR est présent partout
