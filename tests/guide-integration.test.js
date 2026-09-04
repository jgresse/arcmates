// Tests d'intégration : chargent les vrais guide.html / arc-diagram.html via
// jsdom (pas de mock de contenu) pour vérifier que le balisage data-i18n
// colle au dictionnaire, que le sélecteur de langue fonctionne réellement
// sur le DOM de la page, et que le lien d'accès depuis la frise existe.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const GUIDE_HTML_PATH = path.join(__dirname, "..", "guide.html");
const ARC_DIAGRAM_HTML_PATH = path.join(__dirname, "..", "arc-diagram.html");
const guideHtml = fs.readFileSync(GUIDE_HTML_PATH, "utf8");

function makeGuideDom() {
  return new JSDOM(guideHtml, { url: "http://localhost/guide.html" });
}

test("guide.html : toutes les clés data-i18n du HTML correspondent exactement au dictionnaire FR", () => {
  const dom = makeGuideDom();
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  delete require.cache[require.resolve("../guide-i18n.js")];
  const { GUIDE_I18N } = require("../guide-i18n.js");

  const htmlKeys = new Set([
    ...[...dom.window.document.querySelectorAll("[data-i18n]")]
      .map((el) => el.getAttribute("data-i18n")),
    ...[...dom.window.document.querySelectorAll("[data-i18n-aria]")]
      .map((el) => el.getAttribute("data-i18n-aria"))
  ]);
  const dictKeys = new Set(Object.keys(GUIDE_I18N.fr));

  assert.deepEqual(
    [...htmlKeys].sort(),
    [...dictKeys].sort(),
    "guide.html référence des clés absentes du dictionnaire (ou l'inverse) — les deux doivent rester synchronisés"
  );
});

test("applyLang('en') traduit aussi les attributs data-i18n-aria (ex. aria-label du sélecteur de langue)", () => {
  const dom = makeGuideDom();
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  delete require.cache[require.resolve("../guide-i18n.js")];
  const { GUIDE_I18N, applyLang } = require("../guide-i18n.js");

  applyLang("en", dom.window.document);

  const langSwitch = dom.window.document.querySelector("[data-i18n-aria]");
  assert.equal(langSwitch.getAttribute("aria-label"), GUIDE_I18N.en.lang_label);
});

test("guide.html : le sélecteur de langue expose bien un bouton FR et un bouton EN", () => {
  const dom = makeGuideDom();
  const doc = dom.window.document;
  assert.ok(doc.querySelector('[data-lang-btn="fr"]'), "bouton FR manquant");
  assert.ok(doc.querySelector('[data-lang-btn="en"]'), "bouton EN manquant");
});

test("guide.html : lien retour vers la frise présent", () => {
  const dom = makeGuideDom();
  const back = dom.window.document.querySelector(".guide-back");
  assert.ok(back, "lien .guide-back manquant");
  assert.equal(back.getAttribute("href"), "arc-diagram.html");
});

test("applyLang('en') traduit réellement le texte visible du DOM et persiste le choix", () => {
  const dom = makeGuideDom();
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  delete require.cache[require.resolve("../guide-i18n.js")];
  const { GUIDE_I18N, applyLang, STORAGE_KEY } = require("../guide-i18n.js");

  const resolved = applyLang("en", dom.window.document);

  assert.equal(resolved, "en");
  assert.equal(
    dom.window.document.querySelector('h1[data-i18n="hero_title"]').textContent,
    GUIDE_I18N.en.hero_title
  );
  assert.equal(
    dom.window.document.querySelector('dt[data-i18n="faq1_q"]').textContent,
    GUIDE_I18N.en.faq1_q
  );
  assert.equal(dom.window.document.documentElement.lang, "en");
  assert.equal(dom.window.localStorage.getItem(STORAGE_KEY), "en");

  const enBtn = dom.window.document.querySelector('[data-lang-btn="en"]');
  const frBtn = dom.window.document.querySelector('[data-lang-btn="fr"]');
  assert.equal(enBtn.classList.contains("active"), true);
  assert.equal(frBtn.classList.contains("active"), false);
});

test("applyLang('fr') après applyLang('en') repasse bien tout le texte en français", () => {
  const dom = makeGuideDom();
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  delete require.cache[require.resolve("../guide-i18n.js")];
  const { GUIDE_I18N, applyLang } = require("../guide-i18n.js");

  applyLang("en", dom.window.document);
  applyLang("fr", dom.window.document);

  assert.equal(
    dom.window.document.querySelector('h1[data-i18n="hero_title"]').textContent,
    GUIDE_I18N.fr.hero_title
  );
  assert.equal(dom.window.document.documentElement.lang, "fr");
});

test("applyLang() avec une langue non supportée retombe sur le français plutôt que de planter", () => {
  const dom = makeGuideDom();
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  delete require.cache[require.resolve("../guide-i18n.js")];
  const { GUIDE_I18N, applyLang } = require("../guide-i18n.js");

  const resolved = applyLang("de", dom.window.document);

  assert.equal(resolved, "fr");
  assert.equal(
    dom.window.document.querySelector('h1[data-i18n="hero_title"]').textContent,
    GUIDE_I18N.fr.hero_title
  );
});

test("initLang() lit la langue précédemment stockée dans localStorage au chargement", () => {
  const dom = makeGuideDom();
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  delete require.cache[require.resolve("../guide-i18n.js")];
  const { GUIDE_I18N, initLang, STORAGE_KEY } = require("../guide-i18n.js");

  dom.window.localStorage.setItem(STORAGE_KEY, "en");
  const resolved = initLang(dom.window.document);

  assert.equal(resolved, "en");
  assert.equal(
    dom.window.document.querySelector('h1[data-i18n="hero_title"]').textContent,
    GUIDE_I18N.en.hero_title
  );
});

test("initLang() branche le sélecteur : cliquer sur EN traduit la page en direct", () => {
  const dom = makeGuideDom();
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  delete require.cache[require.resolve("../guide-i18n.js")];
  const { GUIDE_I18N, initLang } = require("../guide-i18n.js");

  initLang(dom.window.document);
  const enBtn = dom.window.document.querySelector('[data-lang-btn="en"]');
  enBtn.dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(
    dom.window.document.querySelector('h1[data-i18n="hero_title"]').textContent,
    GUIDE_I18N.en.hero_title
  );
});

test("arc-diagram.html : un lien vers guide.html est présent dans le drawer #sidebar", () => {
  const arcHtml = fs.readFileSync(ARC_DIAGRAM_HTML_PATH, "utf8");
  const dom = new JSDOM(arcHtml, { url: "http://localhost/arc-diagram.html" });
  const doc = dom.window.document;

  const sidebar = doc.querySelector("#sidebar");
  assert.ok(sidebar, "#sidebar introuvable dans arc-diagram.html");

  const guideLink = sidebar.querySelector('a[href="guide.html"]');
  assert.ok(guideLink, "aucun lien vers guide.html dans #sidebar");
});

test("arc-diagram.html : le bouton d'ajout de personne est présent dans la sidebar", () => {
  const arcHtml = fs.readFileSync(ARC_DIAGRAM_HTML_PATH, "utf8");
  const dom = new JSDOM(arcHtml, { url: "http://localhost/arc-diagram.html" });
  const doc = dom.window.document;

  const btn = doc.querySelector("#sidebar #add-person-btn");
  assert.ok(btn, "#add-person-btn introuvable dans la sidebar");
});

test("arc-diagram.html : la modal \"qui es-tu\" et le formulaire personne existent avec les bons champs", () => {
  const arcHtml = fs.readFileSync(ARC_DIAGRAM_HTML_PATH, "utf8");
  const dom = new JSDOM(arcHtml, { url: "http://localhost/arc-diagram.html" });
  const doc = dom.window.document;

  const whoAreYou = doc.querySelector("#whoareyou-modal");
  assert.ok(whoAreYou, "#whoareyou-modal introuvable");
  assert.ok(whoAreYou.classList.contains("hidden"), "#whoareyou-modal doit être cachée par défaut");
  assert.ok(doc.querySelector("#whoareyou-list"), "#whoareyou-list introuvable");
  assert.ok(doc.querySelector("#whoareyou-not-in-list"), "lien \"je ne suis pas dans la liste\" introuvable");

  const personModal = doc.querySelector("#person-modal");
  assert.ok(personModal, "#person-modal introuvable");
  assert.ok(personModal.classList.contains("hidden"), "#person-modal doit être cachée par défaut");
  for (const id of ["person-nom", "person-surnoms", "person-emoji", "person-email", "person-submit", "person-cancel"]) {
    assert.ok(doc.getElementById(id), `#${id} introuvable dans #person-modal`);
  }
});
