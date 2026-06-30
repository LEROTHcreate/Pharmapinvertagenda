-- ============================================================================
-- BROUILLON — MIGRATION RBAC 4 RÔLES   ⚠ NE PAS APPLIQUER MAINTENANT
-- ============================================================================
-- À exécuter UNIQUEMENT après le commit de la migration auth (éviter deux
-- migrations de schéma concurrentes). Spec : mémoire `rbac-4-roles`.
--
-- Ce fichier .sql n'est ni buildé ni typé : il sert de plan prêt à appliquer.
-- Ordre : (1) enum Prisma  (2) ALTER TYPE Postgres  (3) backfill  (4) prisma generate
-- ============================================================================


-- ─── ÉTAPE 1 — Schéma Prisma (à coller dans prisma/schema.prisma) ───────────
-- Remplacer l'enum actuel :
--     enum UserRole { ADMIN  EMPLOYEE }
-- par :
--
--   enum UserRole {
--     CREATEUR       // Créateur de l'officine — indéracinable, transférable
--     ADMIN          // Titulaire — tous pouvoirs sauf toucher au créateur
--     MANAGEUR       // Planning + équipe + gabarits ; pas paie/absences/users
--     COLLABORATEUR  // Lecture planning équipe + notes + messages + ses demandes
--     EMPLOYEE       // ⚠ LEGACY — gardé pour compat ; mappé → COLLABORATEUR
--   }
--
-- NB : on GARDE `EMPLOYEE` dans l'enum (Postgres ne sait pas retirer une valeur
-- d'enum sans recréer le type). Le code traite EMPLOYEE comme COLLABORATEUR.
-- Le `@default(EMPLOYEE)` de User.role peut rester (ou passer à COLLABORATEUR).


-- ─── ÉTAPE 2 — Ajout des valeurs d'enum en base (Postgres) ──────────────────
-- ⚠ `ALTER TYPE ... ADD VALUE` ne peut PAS tourner dans une transaction et la
--   nouvelle valeur n'est utilisable qu'APRÈS commit → exécuter ce bloc seul,
--   puis le backfill (étape 3) dans un second temps.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CREATEUR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MANAGEUR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COLLABORATEUR';


-- ─── ÉTAPE 3 — Backfill des comptes existants ───────────────────────────────
-- (à exécuter dans une session SÉPARÉE, après que l'étape 2 soit commitée)

-- 3a. Tous les EMPLOYEE deviennent COLLABORATEUR.
UPDATE "users" SET "role" = 'COLLABORATEUR' WHERE "role" = 'EMPLOYEE';

-- 3b. Le CRÉATEUR de chaque officine = l'admin "super-admin" historique
--     (convention actuelle : ADMIN sans fiche Employee liée). À défaut, le
--     plus ancien ADMIN de l'officine. Les autres ADMIN restent ADMIN (titulaires).
--     >>> À RELIRE par officine avant exécution <<<
WITH creator_pick AS (
  SELECT DISTINCT ON ("pharmacyId") "id"
  FROM "users"
  WHERE "role" = 'ADMIN' AND "status" = 'APPROVED' AND "isActive" = true
  ORDER BY "pharmacyId",
           ("employeeId" IS NULL) DESC,  -- privilégie l'admin sans fiche (créateur)
           "createdAt" ASC               -- sinon le plus ancien
)
UPDATE "users" u
SET "role" = 'CREATEUR'
FROM creator_pick c
WHERE u."id" = c."id";

-- 3c. Garde-fou : exactement 1 créateur par officine ?
--     (doit renvoyer 0 ligne ; sinon corriger manuellement)
-- SELECT "pharmacyId", count(*) FROM "users" WHERE "role"='CREATEUR'
--   GROUP BY "pharmacyId" HAVING count(*) <> 1;

-- 3d. Pour Pin Vert spécifiquement, le créateur doit être pharmapinvert.agenda :
-- UPDATE "users" SET "role"='CREATEUR' WHERE "email"='pharmapinvert.agenda@gmail.com';


-- ─── ÉTAPE 4 — Régénérer le client + vérifier ───────────────────────────────
--   npx prisma generate
--   (puis brancher src/lib/permissions.ts selon la "Carte de branchement" de la mémoire rbac-4-roles)
--
-- Le flag `User.canAccessPayroll` devient redondant (l'accès paie se déduit du
-- rôle CREATEUR/ADMIN). On peut le laisser inutilisé puis le retirer plus tard.
