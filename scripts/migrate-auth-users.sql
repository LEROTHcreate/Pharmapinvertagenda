-- ============================================================================
-- Migration des comptes existants vers Supabase Auth (auth.users)
-- ----------------------------------------------------------------------------
-- Contexte : on passe l'authentification de NextAuth (table public.users) à
-- Supabase Auth. La table public.users reste la source de vérité métier
-- (role / pharmacyId / status), Supabase Auth gère identité + mot de passe.
--
-- Ce script copie chaque compte ACTIF + APPROUVÉ de public.users vers
-- auth.users en RÉUTILISANT le hash bcrypt existant (colonne "hashedPassword")
-- → les utilisateurs gardent leur mot de passe, aucun reset nécessaire.
-- bcrypt ($2a/$2b) est compatible avec GoTrue (bcrypt Go).
--
-- ⚠️  À EXÉCUTER DANS Supabase → SQL Editor (public.users et auth.users sont
--     dans la MÊME base).
--
-- ⚠️  FRAGILE : le schéma de auth.users / auth.identities varie selon la
--     version de GoTrue. PROCÉDURE RECOMMANDÉE :
--       1. Lancer d'ABORD le bloc "TEST 1 COMPTE" ci-dessous (ex. le démo).
--       2. Aller dans l'app, se connecter avec ce compte + son ancien mot de
--          passe. Si OK → lancer le bloc "MIGRATION COMPLÈTE".
--       3. Vérifier avec le bloc "VÉRIFICATION" en fin de fichier.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- TEST 1 COMPTE  (décommenter, remplacer l'email, exécuter, puis tester login)
-- ─────────────────────────────────────────────────────────────────────────
-- begin;
--   with src as (
--     select * from public.users
--     where email = 'REMPLACE-MOI@exemple.fr'
--       and "isActive" = true and status = 'APPROVED'
--   ),
--   new_auth as (
--     insert into auth.users (
--       instance_id, id, aud, role, email, encrypted_password,
--       email_confirmed_at, created_at, updated_at,
--       raw_app_meta_data, raw_user_meta_data,
--       confirmation_token, recovery_token, email_change,
--       email_change_token_new, reauthentication_token
--     )
--     select
--       '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
--       'authenticated', 'authenticated', s.email, s."hashedPassword",
--       now(), now(), now(),
--       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
--       '', '', '', '', ''
--     from src s
--     where not exists (select 1 from auth.users a where a.email = s.email)
--     returning id, email
--   ),
--   new_ident as (
--     insert into auth.identities (
--       id, user_id, identity_data, provider, provider_id,
--       last_sign_in_at, created_at, updated_at
--     )
--     select gen_random_uuid(), na.id,
--       jsonb_build_object('sub', na.id::text, 'email', na.email),
--       'email', na.id::text, now(), now(), now()
--     from new_auth na
--     returning user_id
--   )
--   update public.users pu
--   set "authUserId" = a.id
--   from auth.users a
--   where pu.email = a.email and pu.email = 'REMPLACE-MOI@exemple.fr';
-- commit;


-- ─────────────────────────────────────────────────────────────────────────
-- MIGRATION COMPLÈTE  (tous les comptes actifs + approuvés)
-- ─────────────────────────────────────────────────────────────────────────
begin;

-- 1) Crée les comptes auth.users manquants à partir de public.users.
with new_auth as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, reauthentication_token
  )
  select
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    u.email,
    u."hashedPassword",
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '', '', '', '', ''
  from public.users u
  where u."isActive" = true
    and u.status = 'APPROVED'
    and not exists (select 1 from auth.users a where a.email = u.email)
  returning id, email
)
-- 2) Crée l'identité "email" associée (requise par GoTrue récent).
insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), na.id,
  jsonb_build_object('sub', na.id::text, 'email', na.email),
  'email', na.id::text, now(), now(), now()
from new_auth na;

-- 3) Backfill public.users.authUserId pour TOUS les comptes (nouveaux + ceux
--    déjà créés via le signup applicatif).
--    NB : authUserId est de type text, auth.users.id de type uuid → cast ::text
--    obligatoire pour la comparaison (sinon ERROR 42883 text <> uuid).
update public.users pu
set "authUserId" = a.id::text
from auth.users a
where pu.email = a.email
  and pu."authUserId" is distinct from a.id::text;

commit;


-- ─────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION
-- ─────────────────────────────────────────────────────────────────────────
-- Comptes actifs/approuvés non encore liés à un auth.users (doit être vide) :
--   select email from public.users
--   where "isActive" = true and status = 'APPROVED' and "authUserId" is null;
--
-- Comparaison des effectifs :
--   select
--     (select count(*) from public.users where "isActive" and status='APPROVED') as domaine,
--     (select count(*) from auth.users) as supabase_auth,
--     (select count(*) from auth.identities where provider='email') as identites;
