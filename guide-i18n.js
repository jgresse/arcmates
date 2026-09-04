/* ---------------------------------------------------------
   i18n du guide utilisateur (guide.html uniquement — l'app Arcmates elle-même
   reste en français, cf. plans/guide-utilisateur.md).

   Dictionnaire plat { fr: {clé: texte}, en: {clé: texte} } appliqué aux
   éléments marqués data-i18n="clé" via applyLang(). Choix volontairement
   simple (pas de lib i18n) : le volume de texte est petit et statique.
--------------------------------------------------------- */

const SUPPORTED_LANGS = ["fr", "en"];
const DEFAULT_LANG = "fr";
const STORAGE_KEY = "guideLang";

const GUIDE_I18N = {
  fr: {
    meta_title: "Guide — Arcmates",
    nav_back: "← Retour à Arcmates",
    lang_label: "Langue",
    hero_title: "Mode d'emploi",
    hero_subtitle: "Comment lire, filtrer et compléter Arcmates.",

    s1_title: "Qu'est-ce qu'Arcmates ?",
    s1_body: "Arcmates retrace, sur un même tronc temporel vertical, les évènements marquants de chacun·e. Chaque personne a sa propre couleur : ses évènements sont reliés entre eux par des arcs de cette couleur, un peu comme un arbre de vie partagé.",

    s2_title: "Se déplacer sur Arcmates",
    s2_body: "Fais glisser pour te déplacer le long du tronc temporel, et pince ou utilise la molette pour zoomer/dézoomer. Le bouton ☰ en haut à gauche ouvre le panneau des filtres et du formulaire d'ajout.",

    s3_title: "Filtrer par personne ou par type",
    s3_body: "Dans le panneau, clique sur une personne pour ne voir que ses arcs (re-clique pour désélectionner). Clique sur un type d'évènement (fête, voyage, concert…) pour ne garder que les nœuds de ce type. Les deux filtres se combinent.",

    s6_title: "Qui es-tu ? Ajouter une personne",
    s6_body: "Au tout premier chargement, Arcmates te demande de te choisir dans la liste des personnes existantes : ce choix est mémorisé sur cet appareil pour préremplir tes évènements et ton filtre. Si ton profil n'a pas encore d'email, un formulaire te propose de le compléter — tu peux annuler, il te sera reproposé au prochain chargement tant que l'email manque.",
    s6_body2: "Pour ajouter une nouvelle personne à Arcmates, utilise le bouton « + Ajouter une personne » dans le panneau (☰) : renseigne son nom, et si tu les as, ses surnoms/avatar/email. Elle apparaît immédiatement, sans validation préalable — il n'y a pas de compte ni de mot de passe, comme pour les évènements.",

    s4_title: "Ajouter un évènement",
    s4_body: "Clique sur une zone vide d'Arcmates à la date qui t'intéresse : un formulaire s'ouvre.",
    s4_step1: "Renseigne le titre, le type d'évènement et les personnes taguées.",
    s4_step2: "Ajuste la date précise (et une date de fin si l'évènement dure plusieurs jours).",
    s4_step3: "Valide avec « Créer » — l'évènement apparaît immédiatement sur Arcmates.",

    s5_title: "Modifier ou supprimer un évènement",
    s5_body: "Clique sur un nœud existant pour rouvrir son formulaire, pré-rempli. Modifie ce que tu veux puis valide, ou utilise le bouton « Supprimer » pour le retirer définitivement.",

    s7_title: "Questions fréquentes",
    faq1_q: "Je ne vois pas l'évènement que je viens d'ajouter, pourquoi ?",
    faq1_a: "Vérifie qu'aucun filtre (personne ou type) n'est actif — un filtre peut masquer l'évènement fraîchement créé. Sinon, vérifie ta connexion : sans réseau, l'enregistrement échoue et un message d'erreur s'affiche en haut de l'écran.",
    faq2_q: "Puis-je modifier l'évènement de quelqu'un d'autre ?",
    faq2_a: "Oui : il n'y a pas de compte personnel, tout le monde peut ajouter, modifier ou supprimer n'importe quel évènement. Fais preuve de bon sens collectif.",
    faq3_q: "Comment ajouter une nouvelle personne à Arcmates ?",
    faq3_a: "Utilise le bouton « + Ajouter une personne » dans le panneau de gauche (☰) — plus besoin de demander à quelqu'un d'autre de le faire à ta place."
  },
  en: {
    meta_title: "Guide — Arcmates",
    nav_back: "← Back to Arcmates",
    lang_label: "Language",
    hero_title: "How it works",
    hero_subtitle: "How to read, filter, and add to Arcmates.",

    s1_title: "What is Arcmates?",
    s1_body: "Arcmates lays out everyone's key moments along a single vertical time trunk. Each person has their own color: their events are connected by arcs in that color, like a shared tree of life.",

    s2_title: "Moving around Arcmates",
    s2_body: "Drag to move along the time trunk, and pinch or use your scroll wheel to zoom in and out. The ☰ button in the top-left opens the filters panel and the add-event form.",

    s3_title: "Filtering by person or type",
    s3_body: "In the panel, click a person to show only their arcs (click again to deselect). Click an event type (party, trip, concert…) to keep only nodes of that type. Both filters can be combined.",

    s6_title: "Who are you? Adding a person",
    s6_body: "On your very first visit, Arcmates asks you to pick yourself from the list of existing people: that choice is remembered on this device to pre-fill your events and your filter. If your profile doesn't have an email yet, a form offers to complete it — you can cancel, and it'll be offered again next time as long as the email is missing.",
    s6_body2: "To add a new person to Arcmates, use the “+ Add a person” button in the panel (☰): fill in their name, and if you have them, their nicknames/avatar/email. They show up right away, no approval needed — there's no account or password, just like for events.",

    s4_title: "Adding an event",
    s4_body: "Tap an empty spot on Arcmates at the date you want: a form opens.",
    s4_step1: "Fill in the title, event type, and tagged people.",
    s4_step2: "Adjust the exact date (and an end date if the event spans several days).",
    s4_step3: "Confirm with “Create” — the event shows up on Arcmates right away.",

    s5_title: "Editing or deleting an event",
    s5_body: "Click an existing node to reopen its pre-filled form. Change what you need and confirm, or use the “Delete” button to remove it for good.",

    s7_title: "Frequently asked questions",
    faq1_q: "I don't see the event I just added, why?",
    faq1_a: "Check that no filter (person or type) is active — a filter can hide a freshly created event. Otherwise, check your connection: without network access, saving fails and an error message appears at the top of the screen.",
    faq2_q: "Can I edit someone else's event?",
    faq2_a: "Yes: there's no personal account — anyone can add, edit, or delete any event. Use good collective judgment.",
    faq3_q: "How do I add a new person to Arcmates?",
    faq3_a: "Use the “+ Add a person” button in the left panel (☰) — no need to ask someone else to do it for you."
  }
};

// Normalise une langue demandée (ex. venant de localStorage, potentiellement
// absente/corrompue) vers une langue supportée — jamais d'exception, jamais
// de dictionnaire manquant.
function pickLang(requested) {
  return SUPPORTED_LANGS.includes(requested) ? requested : DEFAULT_LANG;
}

// Applique une langue à tous les éléments [data-i18n] sous `root` (document
// par défaut). `root` est paramétrable pour les tests (cf.
// tests/guide-i18n.test.js, qui passe un fragment jsdom isolé).
function applyLang(lang, root) {
  const target = root || (typeof document !== "undefined" ? document : undefined);
  if (!target) return undefined;

  const resolved = pickLang(lang);
  const dict = GUIDE_I18N[resolved];

  target.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key] !== undefined) el.textContent = dict[key];
  });

  // Cas des attributs (ex. aria-label) plutôt que du texte visible.
  target.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (dict[key] !== undefined) el.setAttribute("aria-label", dict[key]);
  });

  const docEl = target.documentElement || (target.ownerDocument && target.ownerDocument.documentElement);
  if (docEl) docEl.lang = resolved;

  target.querySelectorAll("[data-lang-btn]").forEach((btn) => {
    const isActive = btn.getAttribute("data-lang-btn") === resolved;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
  });

  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, resolved);
  } catch (e) {
    // localStorage indisponible (navigation privée stricte, etc.) — la page
    // reste utilisable, elle repartira juste en langue par défaut au prochain
    // chargement.
  }

  return resolved;
}

// Lit la langue stockée (si dispo), applique la langue initiale, et branche
// les boutons du sélecteur pour les changements suivants.
function initLang(root) {
  const target = root || (typeof document !== "undefined" ? document : undefined);
  if (!target) return undefined;

  let stored = null;
  try {
    stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  } catch (e) {
    stored = null;
  }

  const initial = applyLang(pickLang(stored), target);

  target.querySelectorAll("[data-lang-btn]").forEach((btn) => {
    btn.addEventListener("click", () => applyLang(btn.getAttribute("data-lang-btn"), target));
  });

  return initial;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SUPPORTED_LANGS, DEFAULT_LANG, STORAGE_KEY,
    GUIDE_I18N, pickLang, applyLang, initLang
  };
}
