-- ---------------------------------------------------------------------
-- Migration ponctuelle : remplace le CHECK constraint sur events.type par
-- la nouvelle liste de types (suppression de "Marqueur rabbeutique",
-- renommage "Fête" -> "Fête / Anniversaire" et
-- "Première rencontre" -> "Rencontre / Retrouvaille").
-- Nécessaire uniquement si schema.sql a déjà été exécuté une première fois
-- (schema.sql à jour contient désormais directement la nouvelle liste pour
-- les nouvelles installations). À exécuter une fois dans le SQL Editor
-- Supabase — aucune ligne existante ne portait ces anciens types au moment
-- de la migration.
-- ---------------------------------------------------------------------

alter table events drop constraint events_type_check;

alter table events add constraint events_type_check check (type in (
  'Fête / Anniversaire', 'Rencontre / Retrouvaille',
  'Déménagement', 'Voyage', 'Concert'
));
