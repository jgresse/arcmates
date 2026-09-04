# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Arcmates** — frise chronologique verticale, collaborative (arc diagram) rendue avec D3.js.
Chaque personne a ses évènements reliés par des arcs de couleur le long d'un
tronc temporel. Pas de build/bundler : `arc-diagram.html` charge D3 et le SDK
Supabase (CDN), puis `data.js`, `storage.js`, `chart.js` en `<script>`
classiques — l'app tourne telle quelle en ouvrant le fichier HTML.

Persistance : Supabase (Postgres géré), lu/écrit directement depuis le client
avec la clé `anon`/`publishable` (délibérément publique dans `storage.js`) ;
la sécurité est assurée par les policies Row Level Security de
`scripts/schema.sql`, pas par la confidentialité de la clé.

## Commands

```bash
npm install       # une fois, installe d3/jsdom/@playwright/test comme dépendances de test
npx playwright install chromium   # une fois, télécharge le binaire Chromium (~180 Mo)
npm test          # node --test — logique pure + DOM simulé (jsdom), rapide
npm run test:e2e  # playwright test — navigation dans un vrai Chromium
```

Pas de lint ni de build configurés. Pour un test unique :
`node --test tests/data.test.js` (ou `tests/storage.test.js`).

`npm test` : à lancer avant tout commit touchant `data.js`, `storage.js`, ou
`chart.js` (s'il touche au calcul des arcs) — ces fichiers exposent un
`module.exports` CommonJS (ignoré par le navigateur) uniquement pour que
`tests/*.test.js` puisse les `require()` sans dépendre d'un DOM ou d'un vrai
appel réseau. Inclut aussi `tests/guide-i18n.test.js` (dictionnaire i18n) et
`tests/guide-integration.test.js` (DOM simulé via `jsdom` sur `guide.html`
et `arc-diagram.html`).

`npm run test:e2e` (`tests/e2e/`, config `playwright.config.js`) : tests de
navigation dans un vrai navigateur (drawer, lien vers le guide, sélecteur de
langue) — volontairement limités à la navigation UI, sans créer/modifier/
supprimer d'évènement (ça écrirait dans la vraie base Supabase, pas de
projet de test séparé). `arc-diagram.html` y fait de vraies lectures
Supabase (`listPeople`/`listEvents`, lecture seule) : nécessite un accès
réseau sortant. Sert son propre serveur statique local
(`tests/e2e/static-server.js`), lancé automatiquement par Playwright.

Pour tester en local dans le navigateur : ouvrir `arc-diagram.html`
directement (pas de serveur requis).

## Architecture

Trois scripts, chargés dans cet ordre et couplés par des bindings de module
au niveau global (pas d'imports ES) :

1. **`data.js`** — modèle statique (types d'évènements, couleurs, emojis) +
   `initData()`, appelée une fois par `boot()` dans `chart.js`. Charge
   `people`/`events` via `storage.js`, calcule la palette de couleurs par
   personne (dimensionnée dynamiquement sur `people.length`, pas une palette
   catégorielle fixe — au-delà de 10 personnes une palette fixe type
   `schemeTableau10` recommencerait à répéter des teintes), puis calcule les
   arcs (`recomputeArcs`/`computeArcsForPerson` : pour chaque personne, trie
   ses évènements par date et relie chaque paire consécutive par un arc).
2. **`storage.js`** — seul point de contact avec Supabase. Fait le pont entre
   le modèle JS (camelCase, objets `Date`) et les colonnes SQL (snake_case,
   dates ISO string) via `rowToEvent`/`eventToRow` (évènements) et
   `rowToPerson`/`personToRow` (personnes). `people` et `events` ont tous
   les deux du CRUD complet côté client (cf.
   `scripts/2026-09-add-person-email-and-write-policies.sql` — avant cette
   migration, `people` était en lecture seule depuis l'app, ajout à la main
   uniquement via `scripts/seed-people.sql`).
   `deleteEvent` vérifie explicitement que la ligne supprimée est retournée
   par Postgres — un DELETE bloqué par une policy RLS manquante ne renvoie
   aucune erreur, juste 0 ligne affectée, donc l'absence de cette vérif
   masquerait silencieusement l'échec.
3. **`chart.js`** — tout le rendu D3 (axe temporel, zoom, arcs, nœuds,
   labels), les légendes (filtre par personne/type), le panneau de
   création/édition, et `boot()` qui orchestre le chargement initial.
   `render()` est la fonction centrale, rappelée notamment au resize et aux
   changements de filtre. Sur mobile (`isMobile()`, ≤768px), le panneau
   d'ajout/édition (`#add-panel`) est déplacé dans une modal full-screen
   (`openMobileModal`/`closeMobileModal`) plutôt qu'affiché dans la sidebar.
   `boot()` affiche aussi, si besoin, l'écran "qui es-tu"
   (`showWhoAreYouIfNeeded`) : identité locale stockée dans `localStorage`
   (pas une vraie auth, cf. `plans/roadmap.md`), avec complétion de profil
   automatique si la personne choisie n'a pas d'email (`needsProfileCompletion`
   dans `data.js`). Ajouter une personne (depuis ce flux, ou le bouton sidebar
   `#add-person-btn`) est immédiat, sans validation admin — une Edge Function
   (`supabase/functions/notify-new-person/`), déclenchée par un Database
   Webhook Postgres sur `INSERT people` (pas par le front, pour ne pas être
   contournable), envoie un email à l'admin à chaque création. Setup manuel
   de cette fonction : `INSTALL.md` § 8.

Les trois fichiers partagent des variables globales (`people`, `events`,
`allArcs`, `color`, etc. déclarées dans `data.js`) plutôt que d'être
encapsulés — cohérent avec le choix "pas de bundler".

`style.css` : thème dark editorial. Breakpoint mobile à 768px avec un layout
distinct (frise plein écran, filtres en flux, formulaire en modal) — voir la
section "MOBILE" du fichier.

Schéma Supabase dans `scripts/schema.sql` : tables `people`/`events`, trigger
qui maintient `modifie_le`, policies RLS (lecture publique sur les deux
tables, écriture/suppression publique sur `events` seulement). Toute
migration ponctuelle sur une base déjà créée va dans un fichier séparé sous
`scripts/` (voir `scripts/2024-08-add-delete-policy.sql` comme modèle) plutôt
que d'éditer `schema.sql` rétroactivement.

Contexte et décisions produit détaillées : `Arcmates - Concept.md` dans le
vault Obsidian (pas versionné dans ce repo). Features à implémenter et idées
non creusées : [`plans/roadmap.md`](plans/roadmap.md), versionné ici.
