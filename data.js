/* ---------------------------------------------------------
   1) DONNÉES — modèle statique (types/titres) + chargement Supabase
   Les personnes et les évènements ne sont plus générés côté client : ils
   sont chargés depuis Supabase (cf. storage.js, Plan V1 Phase C) via
   initData(), appelée une seule fois au démarrage par le boot() de
   chart.js avant le premier render().

   Les personnes elles-mêmes sont gérées à la main par le propriétaire du
   projet via scripts/seed-people.sql (pas de formulaire d'inscription,
   cf. Plan V1) — data.js ne fait que les récupérer et calculer leur
   couleur/avatar/côté d'affichage une fois qu'on connaît leur nombre réel.
--------------------------------------------------------- */

// Types d'évènements codés en dur pour le MVP (cf. plan).
const EVENT_TYPES = ["Fête / Anniversaire", "Rencontre / Retrouvaille", "Déménagement", "Voyage", "Concert"];

// Couleur fixe par type d'évènement (indépendante des couleurs par personne,
// qui elles restent réservées aux arcs) — c'est ce qui colore les nœuds.
// Palette validée (skill dataviz), colonne DARK (les slots ont chacun une
// marche claire/sombre pré-validée pour le contraste selon la surface —
// la carte est maintenant sombre, donc on prend la marche prévue pour ça
// plutôt que la version "light" utilisée avant le passage en dark mode).
const TYPE_COLORS = {
  "Fête / Anniversaire": "#d95926",     // slot 2 — orange (dark)
  "Rencontre / Retrouvaille": "#199e70", // slot 3 — aqua (dark)
  "Déménagement": "#c98500",         // slot 4 — jaune (dark)
  "Voyage": "#d55181",               // slot 5 — magenta (dark)
  "Concert": "#22b022"               // slot 6 — vert, éclairci pour rester visible sur fond quasi-noir
};
const TYPE_EMOJIS = {
  "Fête / Anniversaire": "🎉",
  "Rencontre / Retrouvaille": "🤝",
  "Déménagement": "📦",
  "Voyage": "✈️",
  "Concert": "🎤"
};
function typeColor(type) {
  return TYPE_COLORS[type] || "#999";
}

// Avatars en emoji (conforme à la décision du concept : pas d'upload d'image,
// pas de dépendance à une lib externe — un emoji par personne suffit).
// Sélection thématique rabbeutique plutôt que des animaux neutres : alcool,
// craze, religion parodique — cohérent avec le lore de L'Almonarque. Le pool
// est plus petit que le nombre de personnes en général (cycle avec %).
const AVATAR_EMOJIS = [
  "🍺", "🍻", "🥃", "🍷", "🥂", "🍾", "🔥", "👑", "😇", "🐐", "🍖", "🕺",
  "🍸", "🍹", "🧉", "🌭", "💀", "👹", "🙏", "📿", "⛪", "😈", "🎸", "🧢", "🎀", "💊"
];

// Bindings peuplés par initData() — vides tant que Supabase n'a pas répondu.
// `color` ne peut être construite qu'une fois qu'on connaît le nombre réel
// de personnes (palette dimensionnée sur people.length, cf. commentaire plus
// bas), donc elle aussi n'existe qu'après le premier chargement.
let people = [];
let events = [];
let allArcs = [];
let color;

/* ---------------------------------------------------------
   2) CHARGEMENT DEPUIS SUPABASE
--------------------------------------------------------- */

// Construit `people` (enrichi couleur/avatar/side) + la palette `color` à
// partir des lignes brutes renvoyées par listPeople(). Extrait de initData()
// pour être réutilisable quand une personne est ajoutée/complétée en cours
// de session (cf. chart.js) : la palette est dimensionnée sur le nombre
// total de personnes, donc un simple push de la nouvelle entrée sans
// recalculer `color` laisserait les couleurs incohérentes avec ce que
// donnerait un rechargement de page.
function buildPeople(rawPeople) {
  // Palette dynamique, dimensionnée sur le nombre réel de personnes plutôt
  // qu'une palette catégorielle fixe (d3.schemeTableau10 n'a que 10 teintes :
  // au-delà, deux personnes finiraient avec la même couleur d'arc). Teintes
  // réparties régulièrement sur la roue des couleurs (toujours distinctes
  // quel que soit N), désaturées/éclaircies façon aquarelle plutôt qu'un
  // arc-en-ciel plein, luminosité relevée pour bien ressortir en dark mode.
  const newColor = d3.scaleOrdinal(
    d3.quantize(t => d3.hsl(t * 360, 0.55, 0.64), Math.max(rawPeople.length, 1))
  ).domain(rawPeople.map(p => p.nom));

  const newPeople = rawPeople.map((p, i) => ({
    id: p.id,
    nom: p.nom,
    email: p.email,
    couleur: newColor(p.nom),
    avatar: p.emoji || AVATAR_EMOJIS[i % AVATAR_EMOJIS.length],
    // Une personne sur deux a ses arcs au-dessus / en-dessous du tronc, pour
    // désencombrer une frise dense (cf. retour POC).
    side: i % 2 === 0 ? "above" : "below"
  }));

  return { people: newPeople, color: newColor };
}

async function initData() {
  const rawPeople = await listPeople();
  ({ people, color } = buildPeople(rawPeople));

  events = await listEvents();

  recomputeArcs();
}

/* ---------------------------------------------------------
   3) CALCUL DES ARCS
   Pour chaque personne : trier ses évènements par date,
   relier chaque paire consécutive par un arc.
--------------------------------------------------------- */

// `eventsList` par défaut = `events` (binding du module, peuplé par
// initData()) — paramètre explicite surtout pour permettre aux tests
// unitaires d'appeler cette fonction avec un jeu d'évènements contrôlé,
// sans dépendre du chargement Supabase (cf. tests/data.test.js).
function computeArcsForPerson(person, eventsList = events) {
  const personEvents = eventsList
    .filter(e => e.personnesTaguees.includes(person.id))
    .sort((a, b) => a.date - b.date);

  const arcs = [];
  for (let i = 0; i < personEvents.length - 1; i++) {
    arcs.push({
      personId: person.id,
      side: person.side,
      from: personEvents[i],
      to: personEvents[i + 1]
    });
  }
  return arcs;
}

function recomputeArcs() {
  allArcs = people.flatMap(p => computeArcsForPerson(p));
}

/* ---------------------------------------------------------
   3ter) ALMANARC — bilan annuel (groupe + par personne), cf. plans/almanarc.md.
   Calcul pur, appelé par chart.js (renderAlmanarcGroupe/renderAlmanarcPersonne)
   pour peupler la modale. Un évènement compte dans l'année de sa date de
   *début* (`date`) — `dateFin` est ignorée pour qu'un évènement à cheval sur
   deux années ne compte pas double (cf. plan, section "Stats calculées").
--------------------------------------------------------- */

// Années civiles distinctes présentes dans `eventsList` (déduites de `date`,
// jamais `dateFin`), triées décroissant. Même pattern eventsList = events
// que computeArcsForPerson pour rester testable sans Supabase.
function availableYears(eventsList = events) {
  const years = new Set(eventsList.map(e => e.date.getFullYear()));
  return [...years].sort((a, b) => b - a);
}

// Étant donné un ordre de référence (EVENT_TYPES, ou la liste des ids de
// peopleList) et une Map clé -> nombre d'occurrences, renvoie la clé au
// compte maximal — les ex-aequo sont départagés par l'ordre de `orderedKeys`
// (le premier qui atteint le max l'emporte), PAS par l'ordre d'apparition
// dans les données (cf. plan, décision #6 sur les ex-aequo). Renvoie null si
// `counts` est vide (aucune occurrence).
function pickMaxByOrder(orderedKeys, counts) {
  let best = null;
  for (const key of orderedKeys) {
    const count = counts.get(key);
    if (count !== undefined && (best === null || count > best.count)) {
      best = { key, count };
    }
  }
  return best;
}

// Clé canonique (indépendante de l'ordre des deux ids) pour indexer une Map
// de paires co-taguées.
function pairKey(idA, idB) {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

// Compte, pour chaque paire de personnes co-taguées ensemble dans un même
// évènement, le nombre d'évènements de `eventsList` où les deux apparaissent.
// Ne considère que les évènements taguant >= 2 personnes ; un évènement à 3+
// personnes taguées contribue à CHAQUE paire qu'il contient (cf. plan :
// [p1,p2,p3] compte pour (p1,p2), (p1,p3) et (p2,p3)). Helper interne partagé
// par topDuo (bilan groupe) et topMate (bilan personne) — pas exporté.
function countCoTaggedPairs(eventsList) {
  const counts = new Map();
  for (const e of eventsList) {
    const tagged = e.personnesTaguees;
    if (!tagged || tagged.length < 2) continue;
    for (let i = 0; i < tagged.length; i++) {
      for (let j = i + 1; j < tagged.length; j++) {
        const key = pairKey(tagged[i], tagged[j]);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  return counts;
}

// Paire de personnes (parmi peopleList) co-taguée sur le plus d'évènements de
// `eventsList`. Itère peopleList en double boucle (externe i, interne j > i)
// pour que l'ordre d'ex-aequo suive l'ordre de peopleList, personA précédant
// toujours personB — cf. plan. Renvoie null si aucune paire n'a de compte > 0.
function computeTopDuo(eventsList, peopleList) {
  const pairCounts = countCoTaggedPairs(eventsList);
  let best = null;
  for (let i = 0; i < peopleList.length; i++) {
    for (let j = i + 1; j < peopleList.length; j++) {
      const personA = peopleList[i];
      const personB = peopleList[j];
      const count = pairCounts.get(pairKey(personA.id, personB.id)) || 0;
      if (count > 0 && (best === null || count > best.count)) {
        best = { personA, personB, count };
      }
    }
  }
  return best;
}

// Personne (parmi peopleList, personId exclu) la plus souvent co-taguée avec
// `personId` dans `eventsList`. Même mécanique que computeTopDuo, ancrée sur
// une personne fixe plutôt que sur toutes les paires. Renvoie null si
// `personId` ne partage aucun évènement avec quelqu'un d'autre.
function computeTopMate(eventsList, personId, peopleList) {
  const pairCounts = countCoTaggedPairs(eventsList);
  let best = null;
  for (const other of peopleList) {
    if (other.id === personId) continue;
    const count = pairCounts.get(pairKey(personId, other.id)) || 0;
    if (count > 0 && (best === null || count > best.count)) {
      best = { person: other, count };
    }
  }
  return best;
}

// Bilan de groupe d'une année : total d'évènements, type dominant, personne
// la plus active, plus grand voyageur, duo le plus fréquent. Tous les champs
// (hors year/totalEvents) sont null si l'année n'a aucun évènement.
function computeAlmanarcGroupe(year, eventsList = events, peopleList = people) {
  const eventsOfYear = eventsList.filter(e => e.date.getFullYear() === year);
  const totalEvents = eventsOfYear.length;

  if (totalEvents === 0) {
    return { year, totalEvents, topType: null, mostActivePerson: null, topTraveler: null, topDuo: null };
  }

  const typeCounts = new Map();
  for (const e of eventsOfYear) typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1);
  const topTypeEntry = pickMaxByOrder(EVENT_TYPES, typeCounts);
  const topType = topTypeEntry ? { type: topTypeEntry.key, count: topTypeEntry.count } : null;

  const personCounts = new Map();
  for (const e of eventsOfYear) {
    for (const pid of e.personnesTaguees) personCounts.set(pid, (personCounts.get(pid) || 0) + 1);
  }
  const activeEntry = pickMaxByOrder(peopleList.map(p => p.id), personCounts);
  const mostActivePerson = activeEntry
    ? { person: peopleList.find(p => p.id === activeEntry.key), count: activeEntry.count }
    : null;

  const voyageCounts = new Map();
  for (const e of eventsOfYear) {
    if (e.type !== "Voyage") continue;
    for (const pid of e.personnesTaguees) voyageCounts.set(pid, (voyageCounts.get(pid) || 0) + 1);
  }
  const travelerEntry = pickMaxByOrder(peopleList.map(p => p.id), voyageCounts);
  const topTraveler = travelerEntry
    ? { person: peopleList.find(p => p.id === travelerEntry.key), count: travelerEntry.count }
    : null;

  const duo = computeTopDuo(eventsOfYear, peopleList);
  const topDuo = duo ? { personA: duo.personA, personB: duo.personB, count: duo.count } : null;

  return { year, totalEvents, topType, mostActivePerson, topTraveler, topDuo };
}

// Bilan individuel d'une année pour `personId` : nombre d'évènements où elle
// est taguée, son type dominant, son meilleur mate de l'année. Tous les
// champs (hors personId/year/totalEvents) sont null si elle n'a aucun
// évènement cette année-là.
function computeAlmanarcPersonne(personId, year, eventsList = events, peopleList = people) {
  const eventsOfYear = eventsList.filter(
    e => e.date.getFullYear() === year && e.personnesTaguees.includes(personId)
  );
  const totalEvents = eventsOfYear.length;

  if (totalEvents === 0) {
    return { personId, year, totalEvents, topType: null, topMate: null };
  }

  const typeCounts = new Map();
  for (const e of eventsOfYear) typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1);
  const topTypeEntry = pickMaxByOrder(EVENT_TYPES, typeCounts);
  const topType = topTypeEntry ? { type: topTypeEntry.key, count: topTypeEntry.count } : null;

  const mate = computeTopMate(eventsOfYear, personId, peopleList);
  const topMate = mate ? { person: mate.person, count: mate.count } : null;

  return { personId, year, totalEvents, topType, topMate };
}

/* ---------------------------------------------------------
   3bis) IDENTITÉ DÉCLARATIVE — décisions pures utilisées par le flux
   "qui es-tu" de chart.js. Extraites ici (plutôt que laissées inline dans
   chart.js) pour rester testables sans dépendre du rendu D3/SVG, même
   principe que computeArcsForPerson/applyRealtimeChange ci-dessus.
--------------------------------------------------------- */

// Vrai si aucune identité locale valide n'est connue : soit rien n'a jamais
// été choisi (currentId vide), soit la personne choisie a depuis disparu de
// `peopleList` (supprimée entretemps) — dans les deux cas, l'écran "qui
// es-tu" doit s'afficher.
function needsIdentitySelection(currentId, peopleList = people) {
  return !currentId || !peopleList.some(p => p.id === currentId);
}

// Vrai si le profil d'une personne est incomplet — critère retenu : absence
// d'email (pas de colonne booléenne séparée, cf. plans/roadmap.md).
function needsProfileCompletion(person) {
  return !person.email;
}

/* ---------------------------------------------------------
   4) TEMPS RÉEL — merge des changements Supabase Realtime
   (cf. storage.js#subscribeToEvents). Upsert idempotent par id : réappliquer
   un changement déjà présent (notamment le sien — on ne cherche pas à
   filtrer sa propre origine) ne crée pas de doublon, juste un remplacement
   par une valeur identique.
--------------------------------------------------------- */

// `eventsList` par défaut = `events` (même pattern que computeArcsForPerson) :
// permet aux tests d'appeler cette fonction avec un tableau contrôlé, et à
// chart.js de l'appeler sans argument pour merger dans le binding partagé
// (recomputeArcs()/render() restent à la charge de l'appelant).
function applyRealtimeChange(change, eventsList = events) {
  let next;
  if (change.eventType === "DELETE") {
    next = eventsList.filter(e => e.id !== change.id);
  } else {
    const idx = eventsList.findIndex(e => e.id === change.event.id);
    next = idx === -1
      ? [...eventsList, change.event]
      : eventsList.map((e, i) => i === idx ? change.event : e);
  }
  if (eventsList === events) events = next;
  return next;
}

// Export CommonJS pour les tests unitaires Node (cf. tests/data.test.js) —
// ignoré dans le navigateur (chargé en <script> classique, `module` n'existe
// pas), donc aucun impact sur le comportement de l'app.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    EVENT_TYPES,
    TYPE_COLORS, TYPE_EMOJIS, typeColor, AVATAR_EMOJIS,
    buildPeople, computeArcsForPerson, applyRealtimeChange,
    needsIdentitySelection, needsProfileCompletion,
    availableYears, computeAlmanarcGroupe, computeAlmanarcPersonne
  };
}
