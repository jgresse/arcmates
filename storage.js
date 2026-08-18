/* ---------------------------------------------------------
   STORAGE — couche Supabase (Plan V1, Phase C).
   Remplace les tableaux en mémoire par de vrais appels réseau, et fait le
   pont entre le modèle JS utilisé par data.js/chart.js (camelCase, objets
   Date) et les colonnes SQL (snake_case, dates en string ISO) — le schéma
   exact est dans scripts/schema.sql.

   CONFIG — à compléter une fois le projet Supabase créé, cf. INSTALL.md :
   - SUPABASE_URL : l'URL du projet (visible dans Project Settings > API).
   - SUPABASE_ANON_KEY : la clé "anon" / "publishable" (PAS "service_role"
     / "secret"). Cette clé est FAITE pour être publique — elle n'ouvre
     que ce qu'autorisent les policies RLS déclarées dans
     scripts/schema.sql (cf. Plan V1, Phase B). La coller en dur ici est
     volontaire, ce n'est pas un secret à cacher.
--------------------------------------------------------- */

const SUPABASE_URL = "https://izzwaxgtwikjweebtcgs.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SEK_DarXbn5HrP5zJQ27Dw_odORi51s"; // cf. INSTALL.md étape 4

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Conversion date JS <-> colonne `date` Postgres (string "YYYY-MM-DD") ---
// Toujours passer par "T00:00:00" en local au parsing pour éviter le décalage
// d'un jour que provoquerait `new Date("2024-05-01")` seul (interprété en
// UTC) dans un fuseau horaire à l'ouest de Greenwich — même logique que les
// <input type="date"> déjà utilisés dans chart.js.
function toISODate(date) {
  return d3.timeFormat("%Y-%m-%d")(date);
}
function fromISODate(str) {
  return str ? new Date(str + "T00:00:00") : undefined;
}

function rowToEvent(row) {
  return {
    id: row.id,
    titre: row.titre,
    type: row.type,
    date: fromISODate(row.date_debut),
    dateFin: fromISODate(row.date_fin),
    personnesTaguees: row.personnes_taguees || [],
    description: row.description || undefined,
    creePar: row.cree_par || undefined
  };
}

function eventToRow(evt) {
  return {
    titre: evt.titre,
    type: evt.type,
    date_debut: toISODate(evt.date),
    date_fin: evt.dateFin ? toISODate(evt.dateFin) : null,
    personnes_taguees: evt.personnesTaguees || [],
    description: evt.description || null,
    cree_par: evt.creePar || null
  };
}

// people : lecture seule depuis l'app (cf. Plan V1 Phase B — pas de policy
// insert/update sur cette table, les personnes sont ajoutées à la main via
// scripts/seed-people.sql). La couleur/l'avatar/le "side" restent calculés
// côté client dans data.js, pas stockés en base.
async function listPeople() {
  const { data, error } = await supabaseClient.from("people").select("*").order("nom");
  if (error) throw error;
  return data.map(row => ({ id: row.id, nom: row.nom, emoji: row.emoji }));
}

async function listEvents() {
  const { data, error } = await supabaseClient.from("events").select("*");
  if (error) throw error;
  return data.map(rowToEvent);
}

async function createEvent(evt) {
  const { data, error } = await supabaseClient
    .from("events")
    .insert(eventToRow(evt))
    .select()
    .single();
  if (error) throw error;
  return rowToEvent(data);
}

async function updateEvent(id, evt) {
  const { data, error } = await supabaseClient
    .from("events")
    .update(eventToRow(evt))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return rowToEvent(data);
}
