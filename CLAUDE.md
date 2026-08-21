# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Frise chronologique verticale, collaborative (arc diagram) rendue avec D3.js.
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
npm install   # une fois, installe d3 comme dépendance de test
npm test      # node --test — seule commande de dev existante
```

Pas de lint ni de build configurés. Pour un test unique :
`node --test tests/data.test.js` (ou `tests/storage.test.js`).

À lancer avant tout commit touchant `data.js`, `storage.js`, ou `chart.js`
(s'il touche au calcul des arcs) — ces fichiers exposent un `module.exports`
CommonJS (ignoré par le navigateur) uniquement pour que `tests/*.test.js`
puisse les `require()` sans dépendre d'un DOM ou d'un vrai appel réseau.

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
   dates ISO string) via `rowToEvent`/`eventToRow`. `people` est en lecture
   seule depuis l'app (pas de policy insert/update — ajout à la main via
   `scripts/seed-people.sql`) ; `events` a du CRUD complet.
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

Contexte et décisions produit détaillées : notes du projet dans le vault
Obsidian (`Frise chronolobbeutique - Concept.md` et
`Frise chronolobbeutique - Plan V1.md`) — pas versionnées dans ce repo.
