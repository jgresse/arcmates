// data.js utilise l'identifiant global `d3` (comme dans le navigateur) —
// on le fournit ici via `global` avant le require(), même pattern que
// storage.test.js pour buildPeople() (seule fonction de ce fichier qui
// appelle réellement d3, via d3.scaleOrdinal/d3.quantize/d3.hsl).
global.d3 = require("d3");

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  EVENT_TYPES,
  TYPE_COLORS, TYPE_EMOJIS, typeColor,
  AVATAR_EMOJIS, buildPeople, computeArcsForPerson, applyRealtimeChange,
  needsIdentitySelection, needsProfileCompletion
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

test("buildPeople() donne une couleur distincte, un avatar et un side alterné à chaque personne", () => {
  const raw = [
    { id: "p1", nom: "Greg", emoji: "🍺" },
    { id: "p2", nom: "Dirty", emoji: null },
    { id: "p3", nom: "Antho", emoji: "👑" }
  ];
  const { people, color } = buildPeople(raw);

  assert.equal(people.length, 3);
  assert.equal(people[0].avatar, "🍺");
  assert.equal(people[1].avatar, AVATAR_EMOJIS[1 % AVATAR_EMOJIS.length], "fallback sur AVATAR_EMOJIS si emoji absent");
  assert.deepEqual(people.map(p => p.side), ["above", "below", "above"]);

  const couleurs = new Set(people.map(p => p.couleur));
  assert.equal(couleurs.size, 3, "chaque personne doit avoir une couleur distincte");
  assert.equal(typeof color, "function", "buildPeople() renvoie aussi l'échelle de couleur (réutilisée par renderPeopleUI)");
});

test("buildPeople() garde l'email de chaque personne (utilisé par le critère de complétude de profil)", () => {
  const { people } = buildPeople([
    { id: "p1", nom: "Greg", email: "greg@mail.com" },
    { id: "p2", nom: "Dirty" }
  ]);
  assert.equal(people[0].email, "greg@mail.com");
  assert.equal(people[1].email, undefined);
});

test("buildPeople() recalcule la palette sur le nombre total quand appelée à nouveau avec une personne en plus", () => {
  // Cas réel : ajout d'une personne en cours de session (cf. chart.js) —
  // la palette ne doit pas juste être complétée en aveugle avec une couleur
  // de plus, elle doit être redimensionnée sur N+1 comme au rechargement.
  const rawN = [{ id: "p1", nom: "Greg" }, { id: "p2", nom: "Dirty" }];
  const rawNPlus1 = [...rawN, { id: "p3", nom: "Antho" }];

  const built = buildPeople(rawNPlus1);
  const expected = buildPeople(rawNPlus1); // même entrée => même résultat déterministe

  assert.deepEqual(built.people.map(p => p.couleur), expected.people.map(p => p.couleur));
  assert.notDeepEqual(
    buildPeople(rawN).people.map(p => p.couleur),
    built.people.map(p => p.couleur).slice(0, 2),
    "la couleur de Greg/Dirty doit changer entre une palette à 2 et une palette à 3 personnes"
  );
});

test("needsIdentitySelection() est vrai si aucun id courant, ou si l'id ne correspond à aucune personne connue", () => {
  const people = [{ id: "p1" }, { id: "p2" }];
  assert.equal(needsIdentitySelection(null, people), true);
  assert.equal(needsIdentitySelection("p1", people), false);
  assert.equal(needsIdentitySelection("p-supprime", people), true);
});

test("needsProfileCompletion() est vrai seulement si le profil n'a pas d'email", () => {
  assert.equal(needsProfileCompletion({ nom: "Greg" }), true);
  assert.equal(needsProfileCompletion({ nom: "Greg", email: "" }), true);
  assert.equal(needsProfileCompletion({ nom: "Greg", email: "greg@mail.com" }), false);
});
