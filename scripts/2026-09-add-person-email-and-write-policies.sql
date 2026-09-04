-- ---------------------------------------------------------------------
-- Arcmates — migration : email sur `people` + écriture ouverte sur `people`
-- À exécuter APRÈS schema.sql (et après les migrations précédentes sous
-- scripts/), dans le même SQL Editor Supabase. Ne pas reporter ce contenu
-- dans schema.sql (cf. CLAUDE.md — migrations cumulatives, jamais d'édition
-- rétroactive du schéma initial).
--
-- Contexte : jusqu'ici `people` était en lecture seule depuis l'app (ajout
-- à la main via scripts/seed-people.sql). On ouvre l'écriture pour deux
-- usages côté UI : (1) compléter son profil (email) au premier "qui es-tu",
-- (2) ajouter une nouvelle personne depuis la sidebar. Pas de validation
-- admin bloquante (décision produit) — une notification par email à
-- l'admin accompagne chaque création, déclenchée côté base par un Database
-- Webhook + Edge Function (cf. supabase/functions/notify-new-person/).
-- ---------------------------------------------------------------------

-- Coordonnée de contact, aussi réutilisée plus tard par l'auth magic link
-- (cf. plans/roadmap.md) — nullable, pas de contrainte unique pour l'instant
-- (aucune auth active pour s'appuyer dessus).
alter table people add column email text;

create policy "people_insert_all" on people for insert with check (true);
create policy "people_update_all" on people for update using (true);
