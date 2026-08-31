const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  EVENT_TYPES,
  TYPE_COLORS, TYPE_EMOJIS, typeColor,
  AVATAR_EMOJIS, computeArcsForPerson, applyRealtimeChange
} = require("../data.js");

test("EVENT_TYPES / TYPE_COLORS / TYPE_EMOJIS restent en phase", () => {
  // Les 3 tables sont indexées par les mêmes clés (le type d'évènement) —
  // si on ajoute/renomme un type dans l'une sans les autres, un nœud se
  // retrouverait sans couleur ou sans emoji dans le rendu.
  for (const type of EVENT_TYPES) {
    assert.ok(TYPE_COLORS[type], `TYPE_COLORS manque une entrée pour "${type}"`);
    assert.ok(TYPE_EMOJIS[type], `TYPE_EMOJIS manque une entrée pour "${type}"`);
  }
});

test("typeColor() renvoie une couleur de secours pour un type inconnu", () => {
  assert.equal(typeColor("Type qui n'existe pas"), "#999");
  assert.equal(typeColor("Fête / Anniversaire"), TYPE_COLORS["Fête / Anniversaire"]);
});

test("AVATAR_EMOJIS n'a pas de doublons", () => {
  assert.equal(new Set(AVATAR_EMOJIS).size, AVATAR_EMOJIS.length);
});

test("computeArcsForPerson() relie les évènements d'une personne dans l'ordre chronologique", () => {
  const p = { id: "p1", side: "above" };
  const events = [
    { id: "e3", date: new Date(2020, 0, 3), personnesTaguees: ["p1"] },
    { id: "e1", date: new Date(2020, 0, 1), personnesTaguees: ["p1"] },
    { id: "e2", date: new Date(2020, 0, 2), personnesTaguees: ["p1"] },
    { id: "e-autre", date: new Date(2020, 0, 1, 12), personnesTaguees: ["p2"] } // doit être ignoré
  ];

  const arcs = computeArcsForPerson(p, events);

  assert.equal(arcs.length, 2, "3 évènements pour p1 => 2 arcs consécutifs");
  assert.equal(arcs[0].from.id, "e1");
  assert.equal(arcs[0].to.id, "e2");
  assert.equal(arcs[1].from.id, "e2");
  assert.equal(arcs[1].to.id, "e3");
  assert.ok(arcs.every(a => a.personId === "p1" && a.side === "above"));
});

test("computeArcsForPerson() ne crée aucun arc s'il y a 0 ou 1 évènement", () => {
  const p = { id: "p1", side: "above" };
  assert.equal(computeArcsForPerson(p, []).length, 0);
  assert.equal(computeArcsForPerson(p, [
    { id: "e1", date: new Date(2020, 0, 1), personnesTaguees: ["p1"] }
  ]).length, 0);
});

test("applyRealtimeChange() ajoute un évènement créé par un autre client (INSERT)", () => {
  const events = [{ id: "e1" }];
  const inserted = { id: "e2", titre: "Nouveau" };
  const next = applyRealtimeChange({ eventType: "INSERT", event: inserted }, events);
  assert.equal(next.length, 2);
  assert.deepEqual(next[1], inserted);
});

test("applyRealtimeChange() remplace un évènement existant (UPDATE)", () => {
  const events = [{ id: "e1", titre: "Ancien titre" }, { id: "e2" }];
  const updated = { id: "e1", titre: "Nouveau titre" };
  const next = applyRealtimeChange({ eventType: "UPDATE", event: updated }, events);
  assert.equal(next.length, 2);
  assert.equal(next.find(e => e.id === "e1").titre, "Nouveau titre");
});

test("applyRealtimeChange() retire un évènement supprimé (DELETE)", () => {
  const events = [{ id: "e1" }, { id: "e2" }];
  const next = applyRealtimeChange({ eventType: "DELETE", id: "e1" }, events);
  assert.deepEqual(next.map(e => e.id), ["e2"]);
});

test("applyRealtimeChange() est idempotent : réappliquer son propre changement ne crée pas de doublon", () => {
  // Cas réel : ce même client vient de créer l'évènement (push optimiste
  // local dans chart.js), puis reçoit l'écho de son propre INSERT via le
  // channel Realtime (cf. storage.js#subscribeToEvents, qui ne filtre pas
  // l'origine du changement).
  const created = { id: "e1", titre: "Shabbeut" };
  const next = applyRealtimeChange({ eventType: "INSERT", event: created }, [created]);
  assert.equal(next.length, 1);
});
