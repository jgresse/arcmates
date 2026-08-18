// storage.js utilise l'identifiant global `d3` (comme dans le navigateur, où
// il est chargé par le <script src="https://d3js.org/..."> avant storage.js)
// — on le fournit ici via `global` avant le require().
global.d3 = require("d3");

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { toISODate, fromISODate, rowToEvent, eventToRow } = require("../storage.js");

test("toISODate() / fromISODate() font un aller-retour fidèle", () => {
  const date = new Date(2024, 4, 1); // 1er mai 2024, en local
  const iso = toISODate(date);
  assert.equal(iso, "2024-05-01");
  assert.deepEqual(fromISODate(iso), date);
});

test("fromISODate() renvoie undefined pour une valeur vide/nulle", () => {
  assert.equal(fromISODate(null), undefined);
  assert.equal(fromISODate(undefined), undefined);
  assert.equal(fromISODate(""), undefined);
});

test("rowToEvent() convertit une ligne Supabase (snake_case) en évènement JS (camelCase)", () => {
  const row = {
    id: "uuid-1",
    titre: "Shabbeut à l'Astoria",
    type: "Fête",
    date_debut: "2024-05-01",
    date_fin: "2024-05-03",
    personnes_taguees: ["p1", "p2"],
    description: "Un bon Shabbeut",
    cree_par: "p1"
  };
  const evt = rowToEvent(row);
  assert.equal(evt.id, "uuid-1");
  assert.deepEqual(evt.date, new Date(2024, 4, 1));
  assert.deepEqual(evt.dateFin, new Date(2024, 4, 3));
  assert.deepEqual(evt.personnesTaguees, ["p1", "p2"]);
  assert.equal(evt.description, "Un bon Shabbeut");
  assert.equal(evt.creePar, "p1");
});

test("rowToEvent() gère les champs optionnels absents (pas de dateFin/description/personnes)", () => {
  const evt = rowToEvent({
    id: "uuid-2", titre: "Solo", type: "Voyage",
    date_debut: "2024-01-01", date_fin: null,
    personnes_taguees: null, description: null, cree_par: null
  });
  assert.equal(evt.dateFin, undefined);
  assert.deepEqual(evt.personnesTaguees, []);
  assert.equal(evt.description, undefined);
  assert.equal(evt.creePar, undefined);
});

test("eventToRow() convertit un évènement JS en ligne Supabase, et est l'inverse de rowToEvent()", () => {
  const original = {
    titre: "Le Mexperience", type: "Voyage",
    date: new Date(2022, 6, 1), dateFin: new Date(2022, 6, 10),
    personnesTaguees: ["p1", "p2"], description: "Épique", creePar: "p2"
  };
  const row = eventToRow(original);
  assert.equal(row.date_debut, "2022-07-01");
  assert.equal(row.date_fin, "2022-07-10");
  assert.deepEqual(row.personnes_taguees, ["p1", "p2"]);

  const roundTripped = rowToEvent({ id: "uuid-3", ...row });
  assert.equal(roundTripped.titre, original.titre);
  assert.deepEqual(roundTripped.date, original.date);
  assert.deepEqual(roundTripped.dateFin, original.dateFin);
});

test("eventToRow() met null (pas undefined) pour les champs optionnels absents — important pour Supabase", () => {
  const row = eventToRow({
    titre: "Solo", type: "Voyage", date: new Date(2024, 0, 1), personnesTaguees: []
  });
  assert.equal(row.date_fin, null);
  assert.equal(row.description, null);
  assert.equal(row.cree_par, null);
});
