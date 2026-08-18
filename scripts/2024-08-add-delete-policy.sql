-- ---------------------------------------------------------------------
-- Migration ponctuelle : autorise la suppression d'un évènement.
-- Nécessaire uniquement si schema.sql a déjà été exécuté une première fois
-- (ta base n'a alors pas encore la policy de delete, ajoutée après coup —
-- schema.sql à jour la contient désormais directement pour les nouvelles
-- installations). À exécuter une fois dans le SQL Editor Supabase.
-- ---------------------------------------------------------------------

create policy "events_delete_all" on events for delete using (true);
