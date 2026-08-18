/* ---------------------------------------------------------
   1) DONNÉES FACTICES
   Noms et évènements inspirés du lore de L'Almonarque (tomes
   I, II, IV, V) : les personnes sont des pseudos réellement
   cités dans les "Statistiques des vannes" (Greg, Ju, Vagin,
   Ben, Rich, Butch, Olive, Delph, Fabz, Charlotte, Antho,
   Lolo), et les titres d'évènements reprennent des termes du
   Dico (Shabbeut, Mont Canigag, Molzhenbek, Astoria, Kamran,
   Mexperience...). ~90 évènements étalés sur 2011–2026, avec
   des clusters denses (grands Shabbeut) pour stress-tester le
   chevauchement des arcs.
--------------------------------------------------------- */

// 24 pseudos réels (tous cités dans les Tomes) — volontairement monté à
// l'échelle annoncée (20-30 personnes) pour stress-tester la légende, la
// palette de couleurs et la densité des arcs à ce niveau.
const PEOPLE_NAMES = [
  "Greg", "Ju", "Vagin", "Ben", "Rich", "Butch",
  "Olive", "Delph", "Fabz", "Mathilde", "Antho", "Lolo",
  "Deuz", "Bert", "Pradel", "Guy", "Ruff", "Streetie",
  "John Deer", "Max", "Cédric", "Alex", "Fky", "Juliette"
];

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

// Palette dynamique, dimensionnée sur le nombre réel de personnes plutôt
// qu'une palette catégorielle fixe (d3.schemeTableau10 n'a que 10 teintes :
// au-delà, deux personnes finissent avec la même couleur d'arc, ce qui est
// justement le genre de problème qu'on veut détecter en montant à 24-30
// personnes). Teintes réparties régulièrement sur la roue des couleurs (donc
// toujours distinctes quel que soit N), mais désaturées/éclaircies façon
// aquarelle plutôt qu'un arc-en-ciel plein — moins "outil de dataviz", plus
// dans l'esprit sobre/organique recherché pour la frise. Luminosité relevée
// (0.58 → 0.64) pour le passage en dark mode : les teintes doivent pop
// davantage sur un fond quasi-noir qu'elles ne le faisaient sur blanc.
const color = d3.scaleOrdinal(
  d3.quantize(t => d3.hsl(t * 360, 0.55, 0.64), PEOPLE_NAMES.length)
).domain(PEOPLE_NAMES);

// Avatars en emoji (conforme à la décision du concept : pas d'upload d'image,
// pas de dépendance à une lib externe — un emoji par personne suffit).
// Sélection thématique rabbeutique plutôt que des animaux neutres : alcool,
// craze, religion parodique — cohérent avec le lore de L'Almonarque. Le pool
// est plus petit que le nombre de personnes (cycle avec %) : c'est volontaire,
// à voir si des avatars dupliqués posent un vrai problème de lisibilité une
// fois testé visuellement.
const AVATAR_EMOJIS = [
  "🍺", "🍻", "🥃", "🍷", "🥂", "🍾", "🔥", "👑", "😇", "🐐", "🍖", "🕺",
  "🍸", "🍹", "🧉", "🌭", "💀", "👹", "🙏", "📿", "⛪", "😈", "🎸", "🧢", "🎀", "💊"
];

const people = PEOPLE_NAMES.map((nom, i) => ({
  id: "p" + i,
  nom,
  couleur: color(nom),
  avatar: AVATAR_EMOJIS[i % AVATAR_EMOJIS.length],
  // Test : une personne sur deux a ses arcs au-dessus / en-dessous du tronc,
  // pour voir si ça aide à désencombrer une frise dense (cf. retour POC).
  side: i % 2 === 0 ? "above" : "below"
}));

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

let eventId = 0;
const events = [];

// Bruit de fond : chaque personne a 4 à 8 évènements solo étalés sur 15 ans
// (les Tomes couvrent 2011-2026)
people.forEach(person => {
  const n = 4 + Math.floor(Math.random() * 5);
  for (let i = 0; i < n; i++) {
    const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
    events.push({
      id: "e" + (eventId++),
      titre: pickTitleForType(type),
      type,
      date: randomDate(new Date(2011, 0, 1), new Date(2026, 0, 1)),
      personnesTaguees: [person.id]
    });
  }
});

// Clusters denses : les grands Shabbeut où toute la communauté (ou presque)
// est taguée le même soir — stress-test du chevauchement d'arcs à une même
// position X, et cohérent avec le lore (le Shabbeut est le rituel collectif
// hebdomadaire du Rabbeutisme).
const clusterDates = [
  new Date(2013, 6, 14), new Date(2015, 11, 31), new Date(2017, 7, 8),
  new Date(2019, 3, 22), new Date(2022, 6, 1), new Date(2024, 11, 24)
];
clusterDates.forEach(date => {
  const participants = d3.shuffle(people.slice()).slice(0, 6 + Math.floor(Math.random() * 5));
  events.push({
    id: "e" + (eventId++),
    titre: pickTitleForType("Fête"),
    type: "Fête",
    date,
    personnesTaguees: participants.map(p => p.id)
  });
});

// Évènements multi-jours (test Phase 1) : la date de l'évènement reste sa
// date de début (utilisée pour le tri/les arcs), mais un champ dateFin
// déclenche un rendu en "haltère" (ligne épaisse à bouts ronds) plutôt qu'un point.
function findPerson(nom) { return people.find(p => p.nom === nom); }
// Dates choisies loin des clusters (2013-07-14, 2015-12-31, 2017-08-08,
// 2019-03-22, 2022-06-01, 2024-11-24) : trop proche d'un cluster, le
// marqueur multi-jours se retrouvait visuellement avalé par le gros nœud
// collectif juste à côté (bug constaté au premier test du POC).
const multiDayEvents = [
  { titre: "Grand Carême à l'étranger", type: "Voyage", debut: new Date(2016, 3, 8), jours: 5, personnes: ["Ben"] },
  { titre: "Retraite shabanique", type: "Voyage", debut: new Date(2020, 8, 10), jours: 4, personnes: ["Rich", "Guy"] },
  { titre: "Grand Shabbeut du Bud & Breakfast", type: "Fête", debut: new Date(2023, 1, 14), jours: 3, personnes: ["Greg", "Ju", "Vagin"] }
];
multiDayEvents.forEach(me => {
  const dateFin = new Date(me.debut.getTime() + me.jours * 24 * 3600 * 1000);
  events.push({
    id: "e" + (eventId++),
    titre: me.titre,
    type: me.type,
    date: me.debut,
    dateFin,
    personnesTaguees: me.personnes.map(nom => findPerson(nom).id)
  });
});

/* ---------------------------------------------------------
   2) CALCUL DES ARCS
   Pour chaque personne : trier ses évènements par date,
   relier chaque paire consécutive par un arc.
--------------------------------------------------------- */

function computeArcsForPerson(person) {
  const personEvents = events
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

let allArcs = people.flatMap(computeArcsForPerson);
function recomputeArcs() {
  allArcs = people.flatMap(computeArcsForPerson);
}
