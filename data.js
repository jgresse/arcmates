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

// Titres piochés/inspirés du Dico et des Tomes, groupés par type d'évènement
// (types codés en dur pour le MVP, cf. plan).
const TITLES_BY_TYPE = {
  "Marqueur rabbeutique": [
    "Réception des tablettes du Mont Canigag",
    "Élection Grand Rabbeut",
    "Passage Talibbeut",
    "Premier Signe de croix rabbeut",
    "Titre de Mouillettologue",
    "Initiation aux Francs Moussons",
    "Sacre Grand Rabbeut de France"
  ],
  "Fête": [
    "Shabbeut à l'Astoria",
    "Grand Shabbeut du Bud & Breakfast",
    "Viandredi chez Butch",
    "Solstice & Saint Fiacre",
    "Shabbeut au Kanterbrau",
    "Synagag plénière",
    "High Mousse au Quiquimousse"
  ],
  "Première rencontre": [
    "Rencontre à l'Astoria",
    "Présentation par un Rabbeuteur",
    "Croisement au Bud & Breakfast",
    "Rencontre pendant un Shabbeut",
    "Rencontre au Molzhenbek"
  ],
  "Déménagement": [
    "Emménagement au Molzhenbek",
    "Installation du Caisson hyperbarge",
    "Départ de la Jerk-Station",
    "Nouvelle colocation rabbeutique"
  ],
  "Voyage": [
    "Le Mexperience",
    "Pèlerinage au Mont Canigag",
    "Retraite shabanique",
    "Grand Carême à l'étranger",
    "Expédition Endurhum"
  ],
  "Concert": [
    "Concert Kamran",
    "Messe hardcore Panterabbeut",
    "Concert Nulle Part Ailleurs",
    "Kamran à Venelles"
  ]
};

const EVENT_TYPES = Object.keys(TITLES_BY_TYPE);

function pickTitleForType(type) {
  const pool = TITLES_BY_TYPE[type];
  return pool[Math.floor(Math.random() * pool.length)];
}

// Couleur fixe par type d'évènement (indépendante des couleurs par personne,
// qui elles restent réservées aux arcs) — c'est ce qui colore les nœuds.
// Palette validée (skill dataviz), colonne DARK (les 6 slots ont chacun une
// marche claire/sombre pré-validée pour le contraste selon la surface —
// la carte est maintenant sombre, donc on prend la marche prévue pour ça
// plutôt que la version "light" utilisée avant le passage en dark mode).
const TYPE_COLORS = {
  "Marqueur rabbeutique": "#3987e5", // slot 1 — bleu (dark)
  "Fête": "#d95926",                 // slot 2 — orange (dark)
  "Première rencontre": "#199e70",   // slot 3 — aqua (dark)
  "Déménagement": "#c98500",         // slot 4 — jaune (dark)
  "Voyage": "#d55181",               // slot 5 — magenta (dark)
  "Concert": "#22b022"               // slot 6 — vert, éclairci pour rester visible sur fond quasi-noir
};
const TYPE_EMOJIS = {
  "Marqueur rabbeutique": "⭐",
  "Fête": "🎉",
  "Première rencontre": "🤝",
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

async function initData() {
  const rawPeople = await listPeople();

  // Palette dynamique, dimensionnée sur le nombre réel de personnes plutôt
  // qu'une palette catégorielle fixe (d3.schemeTableau10 n'a que 10 teintes :
  // au-delà, deux personnes finiraient avec la même couleur d'arc). Teintes
  // réparties régulièrement sur la roue des couleurs (toujours distinctes
  // quel que soit N), désaturées/éclaircies façon aquarelle plutôt qu'un
  // arc-en-ciel plein, luminosité relevée pour bien ressortir en dark mode.
  color = d3.scaleOrdinal(
    d3.quantize(t => d3.hsl(t * 360, 0.55, 0.64), Math.max(rawPeople.length, 1))
  ).domain(rawPeople.map(p => p.nom));

  people = rawPeople.map((p, i) => ({
    id: p.id,
    nom: p.nom,
    couleur: color(p.nom),
    avatar: p.emoji || AVATAR_EMOJIS[i % AVATAR_EMOJIS.length],
    // Une personne sur deux a ses arcs au-dessus / en-dessous du tronc, pour
    // désencombrer une frise dense (cf. retour POC).
    side: i % 2 === 0 ? "above" : "below"
  }));

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
    TITLES_BY_TYPE, EVENT_TYPES, pickTitleForType,
    TYPE_COLORS, TYPE_EMOJIS, typeColor, AVATAR_EMOJIS,
    computeArcsForPerson, applyRealtimeChange
  };
}
