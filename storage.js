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

// Garde pour permettre de charger ce fichier avec `require()` depuis les
// tests unitaires Node (cf. tests/), où `window`/le SDK Supabase CDN
// n'existent pas — sans effet sur le comportement dans le navigateur.
const supabaseClient = (typeof window !== "undefined" && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

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

async function deleteEvent(id) {
  // .select() ici pour récupérer la ligne effectivement supprimée : sans ça,
  // un DELETE bloqué par une policy RLS manquante ne renvoie AUCUNE erreur
  // (Postgres/Supabase filtre juste silencieusement 0 ligne) — on le
  // détecterait donc pas, et l'app croirait la suppression réussie alors
  // que la ligne est toujours en base.
  const { data, error } = await supabaseClient.from("events").delete().eq("id", id).select();
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Suppression refusée par la base (policy RLS manquante ou évènement déjà supprimé) — cf. scripts/2024-08-add-delete-policy.sql");
  }
}

// --- Realtime : notifie l'app des créations/modifications/suppressions
// faites par n'IMPORTE QUEL client (app collaborative, cf. CLAUDE.md), y
// compris soi-même — sans ça, un changement fait par quelqu'un d'autre
// n'apparaît qu'au rechargement de la page. Nécessite que `events` soit
// ajoutée à la publication `supabase_realtime` côté base (cf.
// scripts/2026-08-enable-realtime.sql) ; la policy RLS `events_select_all`
// déjà en place suffit à autoriser la lecture des changements diffusés.

// Conversion pure du payload Supabase Realtime vers le format attendu par
// data.js#applyRealtimeChange, séparée de subscribeToEvents() pour rester
// testable sans dépendre d'un vrai channel/websocket (cf. tests/storage.test.js).
function payloadToChange(payload) {
  if (payload.eventType === "DELETE") {
    // Postgres ne renvoie que l'ancienne clé primaire sur un DELETE (REPLICA
    // IDENTITY par défaut = "default", pas la ligne complète) — impossible
    // de reconstruire un évènement complet, on ne renvoie que l'id à retirer.
    return { eventType: "DELETE", id: payload.old.id };
  }
  return { eventType: payload.eventType, event: rowToEvent(payload.new) };
}

// `onChange` est rappelé pour chaque INSERT/UPDATE/DELETE, y compris ceux
// déclenchés par ce client lui-même — on ne filtre pas l'origine, c'est
// data.js#applyRealtimeChange (upsert idempotent par id) qui absorbe le
// doublon sans effet visible.
function subscribeToEvents(onChange) {
  return supabaseClient
    .channel("events-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "events" }, (payload) => {
      onChange(payloadToChange(payload));
    })
    .subscribe();
}

// Export CommonJS pour les tests unitaires Node (cf. tests/storage.test.js) —
// ignoré dans le navigateur (chargé en <script> classique, `module` n'existe
// pas), donc aucun impact sur le comportement de l'app.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    toISODate, fromISODate, rowToEvent, eventToRow,
    listPeople, listEvents, createEvent, updateEvent, deleteEvent,
    payloadToChange, subscribeToEvents
  };
}
