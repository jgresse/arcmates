-- ---------------------------------------------------------------------
-- Arcmates — schéma Supabase
-- À exécuter une fois dans Supabase : Dashboard > SQL Editor > New query,
-- coller ce fichier en entier, "Run". Cf. INSTALL.md pour le contexte.
-- ---------------------------------------------------------------------

create table people (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  surnoms text[] default '{}',
  emoji text,
  created_at timestamptz default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  type text not null check (type in (
    'Fête / Anniversaire', 'Rencontre / Retrouvaille',
    'Déménagement', 'Voyage', 'Concert'
  )),
  date_debut date not null,
  date_fin date,
  personnes_taguees uuid[] default '{}',
  description text,
  cree_par uuid references people(id),
  cree_le timestamptz default now(),
  modifie_le timestamptz default now(),
  historique jsonb default '[]'::jsonb
);

-- Maintient modifie_le à jour automatiquement à chaque update, pour garder
-- une trace fiable des modifications sans dépendre du client.
create or replace function set_modifie_le()
returns trigger as $$
begin
  new.modifie_le = now();
  return new;
end;
$$ language plpgsql;

create trigger events_set_modifie_le
  before update on events
  for each row execute function set_modifie_le();

-- Row Level Security : la clé "anon"/"publishable" utilisée côté client
-- (storage.js) est volontairement publique — c'est CE qui doit filtrer les
-- droits, pas la clé elle-même. Cf. INSTALL.md pour le rappel de sécurité.
alter table people enable row level security;
alter table events enable row level security;

create policy "people_select_all" on people for select using (true);
create policy "events_select_all" on events for select using (true);
create policy "events_insert_all" on events for insert with check (true);
create policy "events_update_all" on events for update using (true);
create policy "events_delete_all" on events for delete using (true);
-- Volontairement PAS de policy insert/update sur `people` : la table est en
-- lecture seule depuis l'app. Les personnes sont ajoutées à la main par le
-- propriétaire du projet via scripts/seed-people.sql (cf. Plan V1 — pas de
-- formulaire d'inscription pour le v1).

-- Realtime (postgres_changes) sur `events` : permet aux autres clients
-- connectés de voir en direct les créations/modifications/suppressions
-- faites par quelqu'un d'autre, sans recharger la page (cf.
-- storage.js#subscribeToEvents). La policy events_select_all ci-dessus
-- suffit à autoriser la lecture des changements diffusés — rien à ajouter
-- côté RLS.
alter publication supabase_realtime add table events;
