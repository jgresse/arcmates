# 🧪 Campagne de tests — état des lieux

Généré le 2026-08-31 à partir de `npm test` / `node --test --experimental-test-coverage`
/ `npm run test:e2e` (Node v25.9.0, Playwright/Chromium 1.62). À régénérer
après tout changement dans `data.js`, `storage.js`, `guide-i18n.js`,
`guide.html` ou `arc-diagram.html` — les chiffres ci-dessous sont une photo,
pas une valeur qui se met à jour toute seule.

Deux suites, deux vitesses, deux usages :

```bash
npm test                                    # unitaire + intégration DOM (jsdom), ~1s
node --test --experimental-test-coverage    # idem + rapport de couverture
npm run test:e2e                            # navigation dans un vrai Chromium, ~10s
```

## 1. ✅ Dernière exécution — `npm test` (unitaire + intégration jsdom)

**🟢 34 / 34 tests passent, 0 échec, 0 skip — durée totale ≈ 0.7 s.**

| Fichier de test | Tests | Résultat | Portée |
|---|---|---|---|
| `tests/data.test.js` | 6 | ✅ 6/6 | Modèle statique + calcul des arcs (`data.js`) |
| `tests/storage.test.js` | 6 | ✅ 6/6 | Mapping JS ↔ Supabase (`storage.js`) |
| `tests/guide-i18n.test.js` | 7 | ✅ 7/7 | Dictionnaire FR/EN, pure logique (`guide-i18n.js`) |
| `tests/guide-integration.test.js` | 10 | ✅ 10/10 | DOM réel (`guide.html`, `arc-diagram.html`) via `jsdom` |
| **Total** | **29** | **✅ 29/29** | |

<details>
<summary>📋 Détail des 29 tests (nom exact, tel qu'exécuté)</summary>

**`data.test.js`**
- ✅ EVENT_TYPES / TYPE_COLORS / TYPE_EMOJIS restent en phase
- ✅ typeColor() renvoie une couleur de secours pour un type inconnu
- ✅ pickTitleForType() pioche toujours dans le bon pool
- ✅ AVATAR_EMOJIS n'a pas de doublons
- ✅ computeArcsForPerson() relie les évènements d'une personne dans l'ordre chronologique
- ✅ computeArcsForPerson() ne crée aucun arc s'il y a 0 ou 1 évènement

**`storage.test.js`**
- ✅ toISODate() / fromISODate() font un aller-retour fidèle
- ✅ fromISODate() renvoie undefined pour une valeur vide/nulle
- ✅ rowToEvent() convertit une ligne Supabase (snake_case) en évènement JS (camelCase)
- ✅ rowToEvent() gère les champs optionnels absents (pas de dateFin/description/personnes)
- ✅ eventToRow() convertit un évènement JS en ligne Supabase, et est l'inverse de rowToEvent()
- ✅ eventToRow() met null (pas undefined) pour les champs optionnels absents — important pour Supabase

**`guide-i18n.test.js`**
- ✅ SUPPORTED_LANGS contient bien FR et EN, DEFAULT_LANG est supporté
- ✅ GUIDE_I18N a une entrée par langue supportée
- ✅ fr et en ont exactement le même jeu de clés — sinon une traduction manque
- ✅ aucune valeur de traduction n'est vide
- ✅ fr et en diffèrent bien sur le contenu (pas un copier-coller oublié)
- ✅ pickLang() renvoie la langue demandée si supportée
- ✅ pickLang() retombe sur DEFAULT_LANG pour toute valeur non supportée

**`guide-integration.test.js`**
- ✅ guide.html : toutes les clés data-i18n du HTML correspondent exactement au dictionnaire FR
- ✅ guide.html : le sélecteur de langue expose bien un bouton FR et un bouton EN
- ✅ guide.html : lien retour vers la frise présent
- ✅ applyLang('en') traduit réellement le texte visible du DOM et persiste le choix
- ✅ applyLang('en') traduit aussi les attributs data-i18n-aria (ex. aria-label du sélecteur de langue)
- ✅ applyLang('fr') après applyLang('en') repasse bien tout le texte en français
- ✅ applyLang() avec une langue non supportée retombe sur le français plutôt que de planter
- ✅ initLang() lit la langue précédemment stockée dans localStorage au chargement
- ✅ initLang() branche le sélecteur : cliquer sur EN traduit la page en direct
- ✅ arc-diagram.html : un lien vers guide.html est présent dans le drawer #sidebar

</details>

## 2. 🌐 Dernière exécution — `npm run test:e2e` (navigation, vrai navigateur)

**🟢 6 / 6 tests passent — durée totale ≈ 3.3 s (4 workers, Chromium headless).**

⚠️ Contrairement à `npm test`, cette suite fait de vraies requêtes réseau vers
Supabase (lecture seule — `listPeople`/`listEvents`) pour charger
`arc-diagram.html`. Elle échouera si Supabase est injoignable, et n'écrit
jamais rien en base (pas de création/édition/suppression d'évènement testée
ici — cf. §5).

| Test | Résultat | Durée |
|---|---|---|
| `guide.html` se charge en français par défaut, sans erreur console | ✅ | 385ms |
| Le sélecteur EN traduit le texte et le choix survit à un reload | ✅ | 1.3s |
| Le lien retour ramène bien vers `arc-diagram.html` | ✅ | 1.1s |
| `arc-diagram.html` : le bouton ☰ ouvre le drawer, qui contient un lien vers le guide | ✅ | 1.3s |
| Cliquer sur le lien Guide dans le drawer navigue vers `guide.html` | ✅ | 6.1s |
| `arc-diagram.html` charge les données sans passer en état d'erreur | ✅ | 589ms |

## 3. 📊 Couverture par fichier

Mesurée par le reporter de couverture intégré à Node (`--experimental-test-coverage`) —
concerne uniquement les fichiers `require()`-ables depuis les tests (donc pas
`chart.js`, cf. §5).

| Fichier | Lignes | Branches | Fonctions | Lignes non couvertes |
|---|---|---|---|---|
| `data.js` | 🟡 83.96 % | 🟢 100.00 % | 🟡 71.43 % | 119-145, 174-176 |
| `guide-i18n.js` | 🟢 96.20 % | 🟠 57.89 % | 🟢 100.00 % | 123-126, 141-142 |
| `storage.js` | 🟠 65.55 % | 🟢 82.35 % | 🔴 44.44 % | 68-72, 74-78, 80-88, 90-99, 101-112 |
| **Global (3 fichiers)** | **🟡 83.41 %** | **🟢 75.00 %** | **🟡 70.83 %** | |

## 4. 🔍 Couverture par fonction

Vue fonction par fonction — plus utile que le %/fichier pour juger si un trou
est un problème ou un choix assumé.

### `data.js`

| Fonction | Testée | Test(s) | Note |
|---|---|---|---|
| `pickTitleForType(type)` | ✅ | `pickTitleForType() pioche toujours dans le bon pool` | |
| `typeColor(type)` | ✅ | `typeColor() renvoie une couleur de secours...` | |
| `computeArcsForPerson(person, eventsList)` | ✅ | `computeArcsForPerson() relie...` / `...0 ou 1 évènement` | |
| `initData()` | ⬜ | — | 🌐 Appelle Supabase (`listPeople`/`listEvents`) + construit une échelle D3 — nécessite un navigateur, hors périmètre `node --test`. |
| `recomputeArcs()` | ⬜ | — | Wrapper d'une ligne autour de `computeArcsForPerson` (déjà testée) ; pas de logique propre à couvrir. |

### `storage.js`

| Fonction | Testée | Test(s) | Note |
|---|---|---|---|
| `toISODate(date)` | ✅ | `toISODate() / fromISODate() font un aller-retour fidèle` | |
| `fromISODate(str)` | ✅ | même test + `fromISODate() renvoie undefined...` | |
| `rowToEvent(row)` | ✅ | `rowToEvent() convertit...` / `...champs optionnels absents` | |
| `eventToRow(evt)` | ✅ | `eventToRow() convertit...` / `...met null (pas undefined)...` | |
| `listPeople()` | ⬜ | — | 🌐 Appel réseau Supabase direct, pas de mock DB (choix assumé du projet, cf. `CLAUDE.md`). |
| `listEvents()` | ⬜ | — | 🌐 Idem. |
| `createEvent(evt)` | ⬜ | — | 🌐 Idem. |
| `updateEvent(id, evt)` | ⬜ | — | 🌐 Idem. |
| `deleteEvent(id)` | ⬜ | — | 🌐⚠️ Idem — contient la logique métier "0 ligne supprimée ⇒ erreur explicite" (cf. commentaire dans le fichier), qui reste donc **non vérifiée par un test automatisé**. Candidat le plus net si vous voulez augmenter la couverture un jour (nécessiterait un faux client Supabase injecté, pas la vraie base). |

### `guide-i18n.js`

| Fonction | Testée | Test(s) | Note |
|---|---|---|---|
| `pickLang(requested)` | ✅ | `pickLang()` × 2 | |
| `applyLang(lang, root)` | ✅ | 5 tests (`applyLang('en')...`, `applyLang('fr')...`, langue non supportée, `data-i18n-aria`, indirectement via `initLang`) | |
| `initLang(root)` | ✅ | `initLang() lit la langue...` / `initLang() branche le sélecteur...` | |
| bloc `catch` de `applyLang`/`initLang` | ⬜ | — | 🛡️ Protège contre un `localStorage` indisponible (navigation privée stricte) ; `jsdom` ne reproduit pas ce cas, donc ces 2 lignes restent hors couverture. Comportement défensif, pas un chemin utilisateur normal. |

### `chart.js`

🚫 Aucune fonction n'est exécutée par `node --test` (pas d'export CommonJS,
rendu D3/DOM pur) — mais depuis l'ajout de la suite `test:e2e`, une partie de
ses effets **est** exercée automatiquement, dans un vrai Chromium :

| Comportement | Fonctions `chart.js` concernées | Testé par |
|---|---|---|
| `boot()` charge les données sans passer en état d'erreur | `boot()`, `showStatus()`, `hideStatus()` | ✅ `test:e2e` — "charge les données... sans passer en état d'erreur" |
| Ouverture du drawer au clic sur ☰ | `openDrawer()` | ✅ `test:e2e` — "le bouton ☰ ouvre le drawer..." |
| Rendu initial de l'axe temporel (`svg#chart .axis-line`) | `render()` (partiel — juste sa présence) | ✅ `test:e2e` — même test |
| Zoom/drag sur la frise, filtres légende, panneau d'ajout/édition (clic sur une zone vide ou un nœud), modal mobile | `render()` (reste), `setFilter()`, `setTypeFilter()`, `openAddPanel()`, `openEditPanel()`, `openMobileModal()`, etc. | 🚫 aucun test automatisé — hors périmètre `test:e2e` (cf. §5) |

Reste aussi la vérification manuelle ponctuelle faite via Playwright + Chrome
lors de l'implémentation du guide (captures desktop/mobile FR/EN) — pas
rejouable automatiquement, contrairement à `test:e2e`.

## 5. ⚠️ Ce que la campagne ne couvre toujours pas (assumé)

- **🎨 Zoom/drag sur la frise, filtres légende, panneau d'ajout/édition** :
  aucun test automatisé — `test:e2e` s'arrête à "la page charge et le drawer
  s'ouvre", pas aux interactions D3 fines (zoom, drag, clic sur un nœud pour
  éditer). Le seul filet ici reste la vérification manuelle en navigateur.
- **🌐 CRUD Supabase réel** (`createEvent`, `updateEvent`, `deleteEvent`) :
  volontairement exclu de `test:e2e` (cf. §2) — écrirait dans la vraie base
  de prod, pas de projet Supabase de test séparé. Testé uniquement côté
  mapping pur (`rowToEvent`/`eventToRow`) dans `npm test`. `listPeople`/
  `listEvents` (lecture seule) sont, eux, exercés par `test:e2e` via le
  chargement réel de `arc-diagram.html`.
- **🔄 `initData()` / `recomputeArcs()`** dans `data.js` : la lecture réseau
  qu'ils déclenchent est exercée indirectement par `test:e2e`, mais pas leur
  logique interne (palette de couleurs, calcul des arcs) — celle-ci reste
  testée uniquement via `computeArcsForPerson()` en isolation (`npm test`).
