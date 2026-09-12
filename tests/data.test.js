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
  needsIdentitySelection, needsProfileCompletion,
  availableYears, computeAlmanarcGroupe, computeAlmanarcPersonne,
  diaporamaWindow
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

/* ---------------------------------------------------------
   ALMANARC — availableYears / computeAlmanarcGroupe / computeAlmanarcPersonne
--------------------------------------------------------- */

// Jeu de données partagé par les tests Almanarc ci-dessous : 4 personnes
// (Zoé n'apparaît taguée dans aucun évènement, pour tester les cas "vide"),
// 4 évènements en 2023 + 1 en 2022 (pour vérifier le filtrage par année).
// e4 tague 3 personnes à la fois : sert à vérifier que les 3 paires qu'il
// contient comptent bien pour topDuo/topMate.
const almanarcPeople = [
  { id: "p1", nom: "Greg" },
  { id: "p2", nom: "Dirty" },
  { id: "p3", nom: "Antho" },
  { id: "p4", nom: "Zoé" }
];
const almanarcEvents = [
  { id: "e1", date: new Date(2023, 0, 1), type: "Voyage", personnesTaguees: ["p1", "p2"] },
  { id: "e2", date: new Date(2023, 1, 1), type: "Voyage", personnesTaguees: ["p1"] },
  { id: "e3", date: new Date(2023, 2, 1), type: "Concert", personnesTaguees: ["p2", "p3"] },
  { id: "e4", date: new Date(2023, 3, 1), type: "Concert", personnesTaguees: ["p1", "p2", "p3"] },
  { id: "e5", date: new Date(2022, 0, 1), type: "Fête / Anniversaire", personnesTaguees: ["p3"] }
];

test("availableYears() renvoie les années distinctes présentes, triées décroissant", () => {
  assert.deepEqual(availableYears(almanarcEvents), [2023, 2022]);
});

test("availableYears() renvoie [] pour une liste vide", () => {
  assert.deepEqual(availableYears([]), []);
});

test("availableYears() ne renvoie pas de doublon pour plusieurs évènements la même année", () => {
  const evts = [
    { date: new Date(2021, 0, 1) },
    { date: new Date(2021, 5, 1) },
    { date: new Date(2020, 0, 1) }
  ];
  assert.deepEqual(availableYears(evts), [2021, 2020]);
});

test("computeAlmanarcGroupe() calcule le bilan d'une année avec des données", () => {
  const res = computeAlmanarcGroupe(2023, almanarcEvents, almanarcPeople);

  assert.equal(res.year, 2023);
  assert.equal(res.totalEvents, 4, "seuls les 4 évènements de 2023 comptent, pas e5 (2022)");

  // Voyage et Concert sont à 2 chacun : Voyage l'emporte car il précède
  // Concert dans EVENT_TYPES, indépendamment de l'ordre des évènements.
  assert.deepEqual(res.topType, { type: "Voyage", count: 2 });

  // p1 et p2 sont tous les deux taggés 3 fois (e1,e2,e4 / e1,e3,e4) : p1
  // l'emporte car il précède p2 dans peopleList.
  assert.equal(res.mostActivePerson.person.id, "p1");
  assert.equal(res.mostActivePerson.count, 3);

  // Seuls e1 (p1,p2) et e2 (p1) sont des voyages : p1 en a 2, p2 en a 1.
  assert.equal(res.topTraveler.person.id, "p1");
  assert.equal(res.topTraveler.count, 2);

  // Paires co-taguées : (p1,p2) via e1+e4 = 2 ; (p2,p3) via e3+e4 = 2 ;
  // (p1,p3) via e4 = 1. Ex-aequo (p1,p2)/(p2,p3) à 2 : (p1,p2) l'emporte car
  // rencontrée en premier dans la double boucle sur peopleList.
  assert.equal(res.topDuo.personA.id, "p1");
  assert.equal(res.topDuo.personB.id, "p2");
  assert.equal(res.topDuo.count, 2);
});

test("computeAlmanarcGroupe() sur une année sans aucun évènement : tout est null sauf year/totalEvents", () => {
  const res = computeAlmanarcGroupe(2099, almanarcEvents, almanarcPeople);
  assert.deepEqual(res, {
    year: 2099,
    totalEvents: 0,
    topType: null,
    mostActivePerson: null,
    topTraveler: null,
    topDuo: null
  });
});

test("computeAlmanarcGroupe() : ex-aequo sur topType résolu par l'ordre de EVENT_TYPES, pas par l'ordre des évènements", () => {
  const people = [{ id: "p1", nom: "Greg" }];
  // Concert apparaît en premier dans le tableau, mais Voyage doit gagner car
  // il précède Concert dans EVENT_TYPES.
  const evts = [
    { id: "e1", date: new Date(2023, 5, 1), type: "Concert", personnesTaguees: ["p1"] },
    { id: "e2", date: new Date(2023, 5, 2), type: "Voyage", personnesTaguees: ["p1"] }
  ];
  assert.deepEqual(computeAlmanarcGroupe(2023, evts, people).topType, { type: "Voyage", count: 1 });
});

test("computeAlmanarcGroupe() : topDuo compte les 3 paires d'un évènement taguant 3 personnes", () => {
  const people = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
  const evts = [
    { id: "e1", date: new Date(2023, 0, 1), type: "Concert", personnesTaguees: ["p1", "p2", "p3"] }
  ];
  const res = computeAlmanarcGroupe(2023, evts, people);
  // Une seule occurrence de chaque paire => (p1,p2), rencontrée en premier
  // dans la double boucle, l'emporte (toutes à 1, pas de count strictement
  // supérieur pour la déloger).
  assert.equal(res.topDuo.personA.id, "p1");
  assert.equal(res.topDuo.personB.id, "p2");
  assert.equal(res.topDuo.count, 1);
});

test("computeAlmanarcPersonne() calcule le bilan d'une personne avec des évènements cette année", () => {
  const res = computeAlmanarcPersonne("p1", 2023, almanarcEvents, almanarcPeople);

  assert.equal(res.personId, "p1");
  assert.equal(res.year, 2023);
  assert.equal(res.totalEvents, 3, "e1, e2, e4 taguent p1 en 2023 (pas e3, pas e5 de 2022)");
  assert.deepEqual(res.topType, { type: "Voyage", count: 2 });

  // Paires impliquant p1 : (p1,p2) via e1+e4 = 2, (p1,p3) via e4 = 1.
  assert.equal(res.topMate.person.id, "p2");
  assert.equal(res.topMate.count, 2);
});

test("computeAlmanarcPersonne() sur une personne sans évènement cette année : tout est null sauf personId/year/totalEvents", () => {
  const res = computeAlmanarcPersonne("p4", 2023, almanarcEvents, almanarcPeople);
  assert.deepEqual(res, { personId: "p4", year: 2023, totalEvents: 0, topType: null, topMate: null });
});

test("computeAlmanarcPersonne() : topMate exclut la personne elle-même", () => {
  // p1 est le seul tagué sur tous ses évènements d'une année donnée => aucun
  // mate possible, même si personCounts contiendrait p1 s'il n'était pas
  // explicitement exclu de la recherche.
  const people = [{ id: "p1" }];
  const evts = [
    { id: "e1", date: new Date(2023, 0, 1), type: "Concert", personnesTaguees: ["p1"] }
  ];
  const res = computeAlmanarcPersonne("p1", 2023, evts, people);
  assert.equal(res.totalEvents, 1);
  assert.equal(res.topMate, null);
});

test("diaporamaWindow() centre la fenêtre sur currentDate et retient le voisin le plus proche", () => {
  const current = new Date(2023, 5, 15);
  const prev = new Date(2023, 5, 1);   // 14 jours avant
  const next = new Date(2023, 6, 15);  // 30 jours après => le voisin le plus proche est prev
  const { start, end } = diaporamaWindow(prev, current, next);

  assert.equal(end - current, current - start, "fenêtre symétrique autour de currentDate");
  const gapPrevMs = current - prev;
  assert.equal(end - start, gapPrevMs * 2.6, "portée basée sur le voisin le plus proche (prev)");
});

test("diaporamaWindow() : premier évènement (pas de prev) se base sur le voisin suivant", () => {
  const current = new Date(2023, 0, 1);
  const next = new Date(2023, 0, 21); // 20 jours après
  const { start, end } = diaporamaWindow(null, current, next);
  assert.equal(end - start, (next - current) * 2.6);
});

test("diaporamaWindow() : dernier évènement (pas de next) se base sur le voisin précédent", () => {
  const current = new Date(2023, 11, 31);
  const prev = new Date(2023, 11, 1); // 30 jours avant
  const { start, end } = diaporamaWindow(prev, current, null);
  assert.equal(end - start, (current - prev) * 2.6);
});

test("diaporamaWindow() : aucun voisin (une seule date au total) retombe sur defaultSpanMs", () => {
  const current = new Date(2023, 0, 1);
  const { start, end } = diaporamaWindow(null, current, null, { defaultSpanMs: 1000, minSpanMs: 0, maxSpanMs: Infinity });
  assert.equal(end - start, 1000 * 2.6);
});

test("diaporamaWindow() : deux évènements très proches, la portée est clampée à minSpanMs", () => {
  const current = new Date(2023, 0, 1, 0, 0, 1); // 1 seconde après prev
  const prev = new Date(2023, 0, 1, 0, 0, 0);
  const { start, end } = diaporamaWindow(prev, current, null, { minSpanMs: 5000 });
  assert.equal(end - start, 5000);
});

test("diaporamaWindow() : deux évènements très éloignés, la portée est clampée à maxSpanMs", () => {
  const current = new Date(2023, 0, 1);
  const prev = new Date(2000, 0, 1); // ~23 ans avant
  const { start, end } = diaporamaWindow(prev, current, null, { maxSpanMs: 1000 * 60 * 60 * 24 * 365 * 2 });
  assert.equal(end - start, 1000 * 60 * 60 * 24 * 365 * 2);
});
