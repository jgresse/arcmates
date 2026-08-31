-- ---------------------------------------------------------------------
-- Migration ponctuelle : active Supabase Realtime (postgres_changes) sur la
-- table `events`, pour que les créations/modifications/suppressions faites
-- par un autre client apparaissent sans recharger la page (frise
-- collaborative). Nécessaire uniquement si schema.sql a déjà été exécuté une
-- première fois (ta base n'a alors pas encore `events` dans la publication
-- realtime — schema.sql à jour l'ajoute désormais directement pour les
-- nouvelles installations). À exécuter une fois dans le SQL Editor Supabase.
--
-- La policy RLS "events_select_all" (déjà en place) suffit à autoriser la
-- lecture des changements diffusés en realtime — rien à ajouter côté RLS.
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table events;
  end if;
end $$;
