# Frise chronolobbeutique

Frise chronologique verticale, collaborative, pour la communauté rabbeutique :
chacun peut consulter et ajouter les évènements qui ont marqué son histoire
commune. Rendu en arc diagram avec [D3.js](https://d3js.org/) — un tronc
temporel vertical, les évènements de chaque personne reliés entre eux par des
arcs de couleur, à la manière d'un arbre de vie.

Contexte, décisions et plan détaillé : voir les notes du projet dans le vault
Obsidian (`Frise chronolobbeutique - Concept.md` et
`Frise chronolobbeutique - Plan V1.md`).

## Stack

- **JS vanilla**, aucun bundler ni framework — l'app tient dans quelques
  `<script>` classiques chargés directement par `arc-diagram.html`.
- **[D3.js v7](https://d3js.org/)** pour le rendu (axe temporel, zoom, arcs).
- **[Supabase](https://supabase.com/)** (Postgres géré) pour la persistance :
  lecture/écriture directement depuis le client via la clé `anon`/`publishable`,
  la sécurité est assurée par des policies Row Level Security côté base (pas
  de backend applicatif à déployer).

## Fichiers

| Fichier | Rôle |
|---|---|
| `arc-diagram.html` | Page unique de l'app, charge D3/Supabase puis les scripts ci-dessous dans l'ordre. |
| `data.js` | Modèle statique (types/titres d'évènements) + `initData()` qui charge personnes/évènements depuis Supabase et calcule les arcs. |
| `storage.js` | Client Supabase : CRUD `people`/`events`, conversion camelCase (JS) ↔ snake_case (SQL). |
| `chart.js` | Rendu D3 (axe, arcs, nœuds, labels, zoom), légendes, panneau de création/édition. |
| `guide.html` | Guide utilisateur (doc, pas dev) bilingue FR/EN, accessible depuis le drawer de l'app. |
| `guide-i18n.js` | Dictionnaire FR/EN + application de la langue pour `guide.html`. |
| `style.css` | Thème dark editorial + liquid glass. |
| `scripts/schema.sql` | Tables `people`/`events`, trigger, policies RLS. |
| `scripts/seed-people.sql` | Liste des personnes (à éditer à la main, pas de formulaire d'inscription). |
| `scripts/purge-events.sql` | Vide la table `events` (utile après une session de tests), sans toucher à `people`. |
| `scripts/2024-08-add-delete-policy.sql` | Migration ponctuelle : ajoute la policy de delete sur `events` aux bases créées avant qu'elle soit intégrée à `schema.sql`. |
| `tests/` | Tests unitaires/intégration (`node --test`) + tests e2e de navigation (`tests/e2e/`, Playwright) — détail dans [`tests/campagne-de-tests.md`](tests/campagne-de-tests.md). |

## Installation / déploiement

Voir [`INSTALL.md`](INSTALL.md) : création des tables, seed des personnes,
clé Supabase, test en local, déploiement GitHub Pages.

## Tests

```bash
npm install
npm test                          # unitaire + intégration (node --test, jsdom) — ~1s
npx playwright install chromium   # une fois, pour les tests e2e
npm run test:e2e                  # navigation dans un vrai Chromium — ~10s
```

`npm test` : test runner intégré à Node sur la logique pure de `data.js`/
`storage.js`/`guide-i18n.js`, plus des tests d'intégration DOM (via `jsdom`)
sur `guide.html`/`arc-diagram.html`. À lancer avant de commit tout
changement sur ces fichiers (ou sur `chart.js` s'il touche au calcul des
arcs).

`npm run test:e2e` : tests de navigation dans un vrai navigateur (Playwright)
— drawer, lien vers le guide, sélecteur de langue. Fait de vraies lectures
Supabase (nécessite un accès réseau), mais n'écrit jamais rien en base.

Détail complet (couverture par fonction, dernière exécution) :
[`tests/campagne-de-tests.md`](tests/campagne-de-tests.md).
