const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  SUPPORTED_LANGS, DEFAULT_LANG, GUIDE_I18N, pickLang
} = require("../guide-i18n.js");

test("SUPPORTED_LANGS contient bien FR et EN, DEFAULT_LANG est supporté", () => {
  assert.deepEqual(new Set(SUPPORTED_LANGS), new Set(["fr", "en"]));
  assert.ok(SUPPORTED_LANGS.includes(DEFAULT_LANG));
});

test("GUIDE_I18N a une entrée par langue supportée", () => {
  for (const lang of SUPPORTED_LANGS) {
    assert.ok(GUIDE_I18N[lang], `GUIDE_I18N.${lang} manquant`);
  }
});

test("fr et en ont exactement le même jeu de clés — sinon une traduction manque", () => {
  const frKeys = Object.keys(GUIDE_I18N.fr).sort();
  const enKeys = Object.keys(GUIDE_I18N.en).sort();
  assert.deepEqual(enKeys, frKeys);
});

test("aucune valeur de traduction n'est vide", () => {
  for (const lang of SUPPORTED_LANGS) {
    for (const [key, value] of Object.entries(GUIDE_I18N[lang])) {
      assert.ok(typeof value === "string" && value.trim().length > 0,
        `GUIDE_I18N.${lang}.${key} est vide`);
    }
  }
});

test("fr et en diffèrent bien sur le contenu (pas un copier-coller oublié)", () => {
  // meta_title est légitimement identique (nom propre repris tel quel) —
  // on l'exclut du contrôle.
  const identicalAllowed = new Set(["meta_title"]);
  for (const key of Object.keys(GUIDE_I18N.fr)) {
    if (identicalAllowed.has(key)) continue;
    assert.notEqual(GUIDE_I18N.fr[key], GUIDE_I18N.en[key],
      `GUIDE_I18N.fr.${key} et .en.${key} sont identiques — traduction oubliée ?`);
  }
});

test("pickLang() renvoie la langue demandée si supportée", () => {
  assert.equal(pickLang("fr"), "fr");
  assert.equal(pickLang("en"), "en");
});

test("pickLang() retombe sur DEFAULT_LANG pour toute valeur non supportée", () => {
  assert.equal(pickLang("de"), DEFAULT_LANG);
  assert.equal(pickLang(""), DEFAULT_LANG);
  assert.equal(pickLang(null), DEFAULT_LANG);
  assert.equal(pickLang(undefined), DEFAULT_LANG);
});
