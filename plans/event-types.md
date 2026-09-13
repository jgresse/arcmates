# Plan — Types d'évènements en table Supabase (plutôt que codés en dur)

> Cf. entrée correspondante dans [`plans/roadmap.md`](roadmap.md) (section
> Backlog, "Types d'évènements en table Supabase plutôt que codés en dur
> dans `data.js`").

## Objectif

Charger `EVENT_TYPES`/`TYPE_COLORS`/`TYPE_EMOJIS` (aujourd'hui codés en dur
dans `data.js`) depuis une nouvelle table Supabase `event_types`, au boot,
comme `people`/`events` le sont déjà. Permet d'ajouter/renommer un type sans
déploiement (juste une requête SQL), et prépare une future gestion en UI —
qui **n'est pas** dans le scope de ce plan (cf. "Périmètre").

## Périmètre

**Dans le scope de cette itération :**
- Table `event_types` (nom, couleur, emoji, ordre d'affichage), remplaçant
  les 3 structures hardcodées de `data.js`.
- Migration du `CHECK constraint` sur `events.type` vers une clé étrangère
  vers `event_types`.
- Chargement au boot (`initData()`), comme `people`/`events`.
- Lecture publique uniquement (même modèle que `people` avant sa migration
  d'écriture) — voir "Sécurité" plus bas.

**Hors scope pour cette itération** (déjà listé séparément dans
`roadmap.md`, section "Hors périmètre actuel") :
- Formulaire/UI pour ajouter, renommer ou réordonner un type depuis l'app —
  ce plan déplace juste la *source de vérité* de `data.js` vers Supabase,
  un type se gère encore en éditant la base à la main (SQL Editor
  Supabase), exactement comme `data.js` se modifiait à la main avant.
- Page admin / rôles.
- Suppression d'un type déjà utilisé par des évènements existants (pas de
  policy/contrainte spécifique pensée pour ce cas — un `DELETE` sur
  `event_types` référencé par des évènements échouerait simplement sur la
  contrainte FK, ce qui est un comportement sûr par défaut mais pas une
  fonctionnalité gérée).

## Modèle de données

`event_types` est une **clé étrangère par nom** (`nom text primary key`),
pas un `type_id uuid` séparé : tout le code JS existant (`data.js`,
`chart.js`, `tests/`) manipule déjà `evt.type` comme une chaîne
(`"Voyage"`, `"Concert"`, etc.), utilisée directement comme clé dans
`TYPE_COLORS`/`TYPE_EMOJIS` et comme valeur de `<option>`. Garder `nom`
comme clé naturelle évite de faire un `JOIN`/une résolution d'id partout où
`evt.type` est déjà lu comme texte — diff minimal, cohérent avec le reste
de l'app (`personnes_taguees` référence aussi les personnes par leurs
valeurs, pas d'indirection ajoutée sans besoin).

```sql
create table event_types (
  nom text primary key,
  couleur text not null,
  emoji text not null,
  ordre integer not null unique, -- ordre d'affichage (légende, <select>, tie-break Almanarc)
  created_at timestamptz default now()
);

alter table event_types enable row level security;
create policy "event_types_select_all" on event_types for select using (true);
-- Volontairement PAS de policy insert/update/delete : lecture seule depuis
-- l'app, comme `people` avant sa migration d'écriture (cf. commentaire
-- schema.sql) — cohérent avec "pas de gestion des types en UI" ci-dessus.

insert into event_types (nom, couleur, emoji, ordre) values
  ('Fête / Anniversaire',     '#d95926', '🎉', 1),
  ('Rencontre / Retrouvaille', '#199e70', '🤝', 2),
  ('Déménagement',            '#c98500', '📦', 3),
  ('Voyage',                  '#d55181', '✈️', 4),
  ('Concert',                 '#22b022', '🎤', 5);

alter table events drop constraint events_type_check;
alter table events add constraint events_type_fkey
  foreign key (type) references event_types(nom);
```

Le seed ci-dessus n'a rien d'optionnel (contrairement à
`scripts/seed-people.sql`, qui peut rester vide sans casser l'app) : une
`event_types` vide laisse le formulaire de création sans aucun type
sélectionnable, donc l'app est inutilisable tant qu'elle n'est pas
peuplée — les inserts vont directement dans la migration/`schema.sql`, pas
dans un script de seed séparé à exécuter "si besoin".

**Deux endroits à mettre à jour, comme pour la précédente migration de
cette même colonne** (cf. `scripts/2026-08-update-event-types.sql`, dont le
commentaire précise déjà que `schema.sql` a été mis à jour en parallèle
pour les nouvelles installations) :
- `scripts/2026-09-add-event-types-table.sql` — migration ci-dessus, pour
  une base déjà créée avec l'ancien `CHECK constraint`.
- `scripts/schema.sql` — édité directement pour intégrer `create table
  event_types`, son seed, et le FK à la place du `CHECK constraint`, pour
  qu'une toute nouvelle installation parte directement sur le bon schéma
  (précédent déjà établi par cette codebase pour ce même genre de
  changement, contrairement à la règle générale "jamais d'édition
  rétroactive de schema.sql" qui vaut pour les autres migrations).

## Points techniques critiques (pourquoi ce n'est pas qu'un changement de source de données)

### 1. `EVENT_TYPES`/`TYPE_COLORS`/`TYPE_EMOJIS` deviennent des `let`, comme `people`/`color`

Aujourd'hui ce sont des `const` toujours disponibles, y compris avant tout
chargement réseau. Une fois peuplées par `initData()` (async, dépend de
Supabase), elles doivent devenir des `let` réassignées après le chargement
— exactement le même changement d'état que `people`/`events`/`color` a déjà
subi. Conséquence directe : **elles ne peuvent plus être lues comme des
variables libres dans du code qui doit rester testable sans Supabase** —
c'est précisément pour ça que `computeArcsForPerson`/`computeAlmanarcGroupe`
prennent déjà `eventsList = events`/`peopleList = people` en paramètres
avec valeur par défaut, plutôt que de lire `events`/`people` directement.
Deux endroits dans `data.js` n'ont pas encore ce traitement et doivent
l'obtenir maintenant :
- `computeAlmanarcGroupe`/`computeAlmanarcPersonne` lisent aujourd'hui
  `EVENT_TYPES` comme variable libre (via
  `pickMaxByOrder(EVENT_TYPES, typeCounts)`) pour départager les ex-aequo
  de type dominant. À changer en un paramètre `typesOrder = EVENT_TYPES`
  (même pattern que `eventsList`/`peopleList`), sinon ces fonctions
  renvoient systématiquement `topType: null` dans les tests (`EVENT_TYPES`
  y vaut `[]`, `initData()` n'étant jamais appelée en environnement Node —
  cf. point 2 ci-dessous).
- `typeColor(type)` lit `TYPE_COLORS` comme variable libre. À changer en
  `typeColor(type, colors = TYPE_COLORS)`, même raison.

### 2. `module.exports` fige `EVENT_TYPES`/`TYPE_COLORS`/`TYPE_EMOJIS` au moment du `require()`

C'est la même raison pour laquelle `people`/`events`/`color`/`allArcs` **ne
sont pas exportés** aujourd'hui dans `module.exports` (voir bas de
`data.js`) : un objet `module.exports = { EVENT_TYPES, ... }` capture la
*valeur* de la variable au moment de l'évaluation (juste après le chargement
du fichier), pas une référence live vers le `let` — réassigner `EVENT_TYPES`
plus tard (par `initData()`, jamais appelée dans les tests unitaires) ne
change rien à ce qui a été exporté, qui reste `[]`/`{}` pour toujours dans
`tests/data.test.js`. Sans les changements du point 1 ci-dessus, le test
existant `typeColor("Fête / Anniversaire") === TYPE_COLORS["Fête / Anniversaire"]`
casserait silencieusement en comparant deux `undefined`/fallback plutôt que
la vraie couleur.

### 3. `chart.js` peuple aujourd'hui la légende types et le `<select>` **avant** tout chargement Supabase

```js
// chart.js, actuellement en dehors de toute fonction, exécuté au parsing
// du script — donc AVANT que boot()/initData() n'aient tourné :
d3.select("#legend-types").selectAll(".legend-item").data(EVENT_TYPES)...
d3.select(addType).selectAll("option").data(EVENT_TYPES)...
```

Le commentaire actuel ("statique — indépendante de Supabase — donc peut
être peuplée tout de suite") devient faux : ces deux blocs doivent être
déplacés dans une nouvelle fonction `renderTypesUI()`, appelée depuis
`boot()` juste après `await initData()` — exactement là où `renderPeopleUI()`
est déjà appelée aujourd'hui, même rôle. `renderTypesUI()` regroupe les deux
blocs ci-dessus tels quels (déplacés, pas réécrits) + met à jour/retire le
commentaire devenu obsolète.

## Découpage technique

**`scripts/2026-09-add-event-types-table.sql`** + **`scripts/schema.sql`** :
migration et schéma à jour, cf. "Modèle de données" ci-dessus.

**`storage.js`** (même pattern que `rowToPerson`/`listPeople`) :
- `rowToEventType(row)` → `{ nom: row.nom, couleur: row.couleur, emoji: row.emoji, ordre: row.ordre }`.
- `listEventTypes()` → `.from("event_types").select("*").order("ordre")`,
  map `rowToEventType` (tri fait côté requête, comme `listPeople().order("nom")`
  — `buildEventTypes` ci-dessous fait confiance à l'ordre reçu, ne re-trie
  pas côté client).
- Exportées via le `module.exports` existant.

**`data.js`** :
- `EVENT_TYPES`/`TYPE_COLORS`/`TYPE_EMOJIS` passent de `const` à `let`
  (vides par défaut : `[]`/`{}`/`{}`), à côté de `people`/`events`/`color`.
- `buildEventTypes(rawTypes)` — fonction pure, même esprit que
  `buildPeople` : construit `{ types, colors, emojis }` à partir des lignes
  triées par `ordre` (déjà triées par `listEventTypes()`). Remplace les 3
  structures hardcodées.
- `initData()` : ajoute `const rawTypes = await listEventTypes();
  ({ types: EVENT_TYPES, colors: TYPE_COLORS, emojis: TYPE_EMOJIS } = buildEventTypes(rawTypes));`
  avant le chargement de `people` (pas de dépendance stricte entre les
  deux, mais garder l'ordre séquentiel simple plutôt que paralléliser avec
  `Promise.all`, cohérent avec le style actuel de la fonction).
- `typeColor(type, colors = TYPE_COLORS)` — voir point technique 1.
- `computeAlmanarcGroupe(year, eventsList = events, peopleList = people, typesOrder = EVENT_TYPES)`
  et `computeAlmanarcPersonne(personId, year, eventsList = events, peopleList = people, typesOrder = EVENT_TYPES)`
  — ajout du 4ᵉ paramètre, transmis à `pickMaxByOrder(typesOrder, typeCounts)`
  à la place de la lecture directe de `EVENT_TYPES`. Voir point technique 1.
- `module.exports` : ajoute `buildEventTypes`.

**`chart.js`** :
- Nouvelle fonction `renderTypesUI()` (à côté de `renderPeopleUI()`,
  ~ligne 889) reprenant les deux blocs `d3.select("#legend-types")...` et
  `d3.select(addType).selectAll("option")...` aujourd'hui au niveau
  racine du fichier (~lignes 647 et 722).
- `boot()` : ajoute `renderTypesUI();` juste après `renderPeopleUI();`.
- Suppression des deux blocs de leur emplacement actuel + du commentaire
  devenu obsolète ("statique — indépendante de Supabase...").
- Aucun autre changement : les lectures de `TYPE_COLORS`/`TYPE_EMOJIS`
  ailleurs dans le fichier (nœuds colorés, slides Almanarc, diaporama —
  lignes ~309, ~1113-1140, ~1541) lisent déjà les bindings globaux du
  navigateur (pas un `module.exports` figé comme dans les tests Node), donc
  continuent de fonctionner sans modification une fois `initData()` passée.

**`tests/data.test.js`** :
- Le test "EVENT_TYPES / TYPE_COLORS / TYPE_EMOJIS restent en phase" perd
  son sens tel quel (les 3 structures n'existent plus indépendamment,
  elles sont dérivées des mêmes lignes par `buildEventTypes` — la
  désynchronisation qu'il vérifiait devient structurellement impossible).
  À remplacer par un test de `buildEventTypes()` : lignes brutes en entrée
  → `types`/`colors`/`emojis` correctement peuplés et dans l'ordre attendu.
- Nouveau fixture local `TYPE_ORDER` (ex. les 5 noms dans l'ordre actuel)
  pour remplacer les usages de l'ancien `EVENT_TYPES` importé dans les
  tests de tie-break (`computeAlmanarcGroupe`, ~lignes 201/233) — passé
  explicitement en 4ᵉ argument.
- Test `typeColor()` : passer un objet `colors` construit localement (ou
  via `buildEventTypes(seedRows).colors`) en 2ᵉ argument plutôt que
  compter sur le `TYPE_COLORS` importé (toujours `{}` dans ce fichier,
  cf. point technique 2).

## Sécurité

Table en lecture seule depuis l'app (`event_types_select_all` uniquement,
pas d'`insert`/`update`/`delete`) — cohérent avec "pas de gestion des types
en UI" listé dans `roadmap.md` sous "Hors périmètre actuel". Un type se
gère toujours à la main via le SQL Editor Supabase, comme les évènements de
`data.js` se géraient à la main dans le code avant ce plan — ce plan ne
change *que* l'endroit où vit cette liste, pas qui peut la modifier.

Pas de Realtime sur `event_types` (mêmes raisons que `comments`, cf.
`plans/comments.md`) : un type ajouté via SQL par l'admin est un évènement
rare, pas déclenché par les utilisateurs de l'app — un rechargement de
page suffit à le voir apparaître, pas besoin d'abonnement `postgres_changes`
en plus de celui déjà en place sur `events`.

## Ouvert

1. **Fenêtre de chargement avant `boot()`** : les gestionnaires de clic sur
   la frise existent dès le parsing du script (indépendants des données,
   cf. commentaire existant dans `chart.js` avant `async function boot()`)
   — un clic pendant le court chargement réseau pourrait ouvrir le panneau
   avec `EVENT_TYPES` encore vide (`addType.value = EVENT_TYPES[0]` →
   `undefined`). Risque déjà présent en pratique aujourd'hui pour d'autres
   champs dépendant du chargement, pas introduit par ce plan — laissé tel
   quel plutôt que d'ajouter un verrou d'interaction pendant le chargement,
   sauf si ça se révèle gênant en usage réel.
2. **Suppression d'un type utilisé** : la contrainte FK bloquera nativement
   toute tentative de `DELETE` sur un type référencé par des évènements
   existants (erreur SQL explicite) — comportement sûr par défaut, pas de
   gestion applicative dédiée dans ce plan.

Prêt pour l'implémentation.
