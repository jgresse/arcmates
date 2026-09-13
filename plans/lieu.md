# Plan — Lieu sur un évènement (autocomplétion façon Google Maps)

> Cf. entrées correspondantes dans [`plans/roadmap.md`](roadmap.md) (section
> Backlog, "Lieu sur un évènement, avec autocomplétion façon Google Maps" et
> "Carte des voyages", qui dépend de celle-ci mais reste un plan séparé).

## Objectif

Ajouter un champ `lieu` optionnel sur les évènements, saisi via un champ à
autocomplétion (façon Google Places Autocomplete) plutôt qu'un texte libre
non structuré. En plus du libellé affiché, on stocke les coordonnées
(`lieu_lat`/`lieu_lng`) renvoyées par le service d'autocomplétion dès cette
itération, même si rien ne les exploite encore — évite une seconde
migration le jour où la carte des voyages (roadmap) sera implémentée.

## Choix du service d'autocomplétion

Google Places Autocomplete est écarté : il demande une clé API liée à un
compte de facturation Google Cloud, ce qui casse le modèle du projet
("pas de build/bundler", pas de backend à soi, cf. `CLAUDE.md`) et
introduirait un secret à gérer alors que tout le reste (clé Supabase
`anon`) est volontairement public.

Retenu : **Photon** (`photon.komoot.io`), API HTTP publique basée sur
OpenStreetMap, sans clé, CORS ouvert, requêtable directement en `fetch()`
depuis le client — cohérent avec l'absence de bundler/backend. Couverture
mondiale (pas limité à la France), pertinent vu que le groupe voyage
(évènements "Voyage" hors France).

Alternative écartée par défaut : `api-adresse.data.gouv.fr` (encore plus
léger, aucune clé non plus) — limité aux adresses françaises, inadapté aux
évènements "Voyage" hors France. À reconsidérer seulement si l'usage réel
montre que Photon est trop bruité/imprécis sur des adresses françaises
précises.

Limite connue : l'instance publique `photon.komoot.io` est un service
gratuit à usage raisonnable (pas de SLA, rate-limiting possible en cas
d'abus) — acceptable pour un petit groupe d'amis, mais si ça devient un
problème en usage réel, la solution est de s'auto-héberger une instance
Photon (hors scope ici).

## Périmètre

**Dans le scope de cette itération :**
- Colonnes `lieu` (texte, libellé affiché), `lieu_lat`/`lieu_lng` (numériques,
  nullables) sur `events`.
- Champ optionnel pour **tous les types d'évènements**, pas restreint à
  "Voyage" (cohérent avec l'entrée roadmap) — une "Fête / Anniversaire" ou
  un "Concert" ont aussi un lieu.
- Champ de saisie avec dropdown de suggestions dans `#add-panel`, alimenté
  par Photon, debounce ~300 ms, 3 caractères minimum avant de requêter.
- Dégradation en texte libre : si l'API est indisponible, en erreur, ou si
  l'utilisateur tape sans jamais sélectionner de suggestion, la valeur
  tapée est acceptée telle quelle à l'enregistrement (`lieu` rempli,
  `lieu_lat`/`lieu_lng` restent `null`) — la sauvegarde n'est **jamais**
  bloquée par l'absence de sélection dans la liste.
- Migration `scripts/2026-09-add-event-lieu.sql`.

**Hors scope pour cette itération** (à revisiter séparément si voulu) :
- **Carte des voyages** (rendu d3-geo des points/trajets) — item roadmap
  séparé, qui consommera `lieu_lat`/`lieu_lng` une fois qu'ils existent.
- **Tracé façon Polarsteps** entre les lieux d'une personne dans l'ordre
  chronologique — sous-item de la carte des voyages ci-dessus, pas de cette
  itération.
- Restreindre le champ aux seuls évènements "Voyage" — décision prise
  d'ouvrir à tous les types dès maintenant (voir ci-dessus), à revoir si
  l'usage réel montre que ça n'a de sens que pour "Voyage".
- Géocodage inverse (proposer un lieu à partir d'une position GPS de
  l'utilisateur) — non demandé, ajoute de la complexité (permission
  navigateur) pour un gain incertain.
- Édition manuelle des coordonnées sur une carte (glisser un point) —
  l'autocomplétion suffit pour fixer `lieu_lat`/`lieu_lng`.
- Afficher le lieu dans le tooltip/la légende — cf. "Ouvert" plus bas.

## Modèle de données

Migration séparée (comme `2026-09-add-person-email-and-write-policies.sql`),
pas d'édition rétroactive de `schema.sql` (cf. `CLAUDE.md`) :
`scripts/2026-09-add-event-lieu.sql`.

```sql
alter table events add column lieu text;
alter table events add column lieu_lat double precision;
alter table events add column lieu_lng double precision;
```

Aucune policy RLS à ajouter : les policies existantes
(`events_insert_all`/`events_update_all`, `using (true)`/`with check (true)`)
s'appliquent à la ligne entière, pas colonne par colonne — les nouvelles
colonnes sont donc déjà couvertes par ce qui existe.

## Design UI

- Placement dans `#add-panel` (`arc-diagram.html`) : juste après le champ
  **Titre**, avant **Type** — le lieu est une propriété descriptive de
  l'évènement au même titre que le titre, pas une catégorisation.
- Structure :
  ```html
  <label for="add-lieu">Lieu</label>
  <div class="add-lieu-wrap">
    <input type="text" id="add-lieu" placeholder="Ex. Berlin, Allemagne" autocomplete="off" />
    <ul id="add-lieu-suggestions" class="add-lieu-suggestions hidden"></ul>
  </div>
  ```
- Comportement :
  - Frappe → debounce 300 ms → si ≥ 3 caractères, requête Photon
    (`AbortController` pour annuler la requête précédente si l'utilisateur
    continue de taper — sinon une réponse lente pourrait écraser
    l'affichage d'une frappe plus récente).
  - Suggestions affichées dans `#add-lieu-suggestions` (libellé lisible,
    ex. "Berlin, Allemagne"), clic sur une suggestion → remplit l'input du
    libellé complet, mémorise `lat`/`lng`, ferme le dropdown.
  - Si l'utilisateur retape dans le champ après avoir sélectionné une
    suggestion (le texte ne correspond plus exactement au dernier libellé
    sélectionné), les `lat`/`lng` mémorisés sont réinitialisés à `null` —
    évite d'enregistrer des coordonnées qui ne correspondent plus au texte
    affiché.
  - Pas de navigation clavier (flèches/Entrée) dans cette itération — clic
    uniquement, pour rester simple ; à ajouter plus tard si ça manque en
    usage réel.
- Mobile : aucun traitement spécial nécessaire, `#add-panel` (avec son
  nouveau champ) est déjà déplacé tel quel dans la modale plein écran par
  `openMobileModal()`, même raisonnement que pour les commentaires
  (`plans/comments.md`).
- `style.css` : positionnement `absolute` du dropdown sous l'input, tokens
  couleur déjà définis (pas de nouvelle palette), état survol sur les
  suggestions.

## Découpage technique

**`scripts/2026-09-add-event-lieu.sql`** : migration ci-dessus.

**`data.js`** (logique pure, testable sans DOM/réseau, même principe que le
reste du fichier) :
- `parsePhotonResults(geojson)` — convertit la réponse GeoJSON de Photon
  (`{ features: [...] }`) en tableau `[{ label, lat, lng }]` : `label`
  construit depuis `properties.name` + `properties.city`/`properties.country`
  quand disponibles (ex. "Berlin, Allemagne"), sinon juste `properties.name`.
  ⚠️ Piège à documenter en commentaire : `geometry.coordinates` de GeoJSON
  est `[lng, lat]` (longitude d'abord), l'inverse de l'ordre habituel
  "latitude, longitude" — source d'erreur classique si on ne fait pas
  attention à l'ordre en extrayant `lat`/`lng`. Renvoie `[]` si
  `geojson.features` est absent/vide.
- Exportée via le `module.exports` existant.

**`storage.js`** (conversion snake_case ↔ camelCase, même pattern que
`rowToEvent`/`eventToRow`) :
- `rowToEvent` : ajoute `lieu: row.lieu || undefined`,
  `lieuLat: row.lieu_lat ?? undefined`, `lieuLng: row.lieu_lng ?? undefined`.
- `eventToRow` : ajoute `lieu: evt.lieu || null`,
  `lieu_lat: evt.lieuLat ?? null`, `lieu_lng: evt.lieuLng ?? null`.
- **Pas** de nouvelle fonction réseau ici pour l'appel à Photon : `storage.js`
  reste "le seul point de contact avec Supabase" (cf. `CLAUDE.md`) — l'appel
  `fetch()` vers Photon (service tiers, pas Supabase) vit dans `chart.js`,
  colocalisé avec la logique DOM de l'autocomplétion plutôt que dans cette
  couche.

**`chart.js`** :
- Références DOM : `addLieu`, `addLieuSuggestions` (const, à côté des autres
  refs `add*` existantes).
- État module : `let selectedLieuLat = null`, `let selectedLieuLng = null`,
  `let lieuDebounceTimer = null`, `let lieuAbortController = null`.
- `async function searchLieu(query)` — `fetch` vers
  `https://photon.komoot.io/api/?q=<query>&limit=5`, abort de la requête
  précédente via `lieuAbortController`, parse avec `parsePhotonResults`,
  appelle `renderLieuSuggestions(results)` ; erreur réseau (y compris abort)
  → silencieuse, dropdown vidé, pas de `showStatus` (ne pas alarmer
  l'utilisateur pour un service annexe qui a une dégradation prévue).
- `function renderLieuSuggestions(results)` — join D3 sur `results` dans
  `#add-lieu-suggestions` ; clic sur une entrée → `addLieu.value = label`,
  `selectedLieuLat/Lng = lat/lng`, vide et cache le dropdown.
- Listener `input` sur `addLieu` : si le texte diffère du dernier libellé
  sélectionné → `selectedLieuLat/Lng = null` ; debounce puis `searchLieu`
  si `addLieu.value.trim().length >= 3`, sinon dropdown vidé/caché.
- `openAddPanel(clickDate)` : `addLieu.value = ""`, réinitialise
  `selectedLieuLat/Lng = null`, cache le dropdown.
- `openEditPanel(evt)` : `addLieu.value = evt.lieu || ""`,
  `selectedLieuLat = evt.lieuLat ?? null`, `selectedLieuLng = evt.lieuLng ?? null`
  (pas de nouvelle requête Photon à l'ouverture — on fait confiance aux
  coordonnées déjà en base tant que le texte n'est pas retouché).
- Listener `#add-submit` : ajoute `lieu: addLieu.value.trim() || undefined,
  lieuLat: selectedLieuLat ?? undefined, lieuLng: selectedLieuLng ?? undefined`
  au payload passé à `createEvent`/`updateEvent`.

**`arc-diagram.html`** : bloc `#add-lieu`/`#add-lieu-suggestions` décrit
ci-dessus, entre `#add-titre` et `#add-type` dans `#add-panel`.

**`style.css`** : styles du dropdown de suggestions (positionnement,
survol), réutilisant les tokens couleur déjà définis.

**`tests/data.test.js`** : cas pour `parsePhotonResults` (feature complète
avec ville+pays, feature avec juste un nom, réponse sans `features`/liste
vide, vérification explicite de l'ordre `[lng, lat]` → `{ lat, lng }`).

**`tests/storage.test.js`** : cas pour `rowToEvent`/`eventToRow` incluant
`lieu`/`lieu_lat`/`lieu_lng` (aller-retour, et cas où ils sont absents/null
— un évènement existant sans lieu ne doit rien casser).

## Sécurité / vie privée

Aucun secret introduit (Photon est public, sans clé). Chaque frappe (après
debounce) envoie la requête de recherche à un service tiers (Komoot) —
même modèle de confiance que le reste de l'app aujourd'hui (pas d'auth
réelle, clé Supabase publique, cf. `roadmap.md`) : acceptable pour un petit
groupe d'amis, mais à noter si une réflexion vie privée plus large est
menée plus tard.

## Ouvert (choix faits par défaut dans ce plan, à corriger si besoin)

1. **Placement du champ** dans le formulaire : proposé juste après Titre,
   avant Type. Pas de contrainte technique à ce choix, purement UX —
   facile à déplacer si un autre ordre est préféré.
2. **Affichage du lieu dans le tooltip/la légende** : ce plan se limite à
   la saisie et au stockage ; rien n'affiche encore le lieu ailleurs dans
   l'UI (la carte des voyages, roadmap, sera le premier consommateur
   visuel). Si un affichage simple (ex. "📍 Berlin" dans le tooltip d'un
   nœud) est voulu dès cette itération, c'est un ajout mineur à
   `chart.js` (fonction `render()`/tooltip) qui peut être glissé dans le
   découpage ci-dessus sans changer le modèle de données.
3. **Type restreint ou non** : ce plan ouvre le champ à tous les types
   d'évènements (cf. roadmap). Si finalement seul "Voyage" doit avoir un
   lieu, ça se limite à masquer/désactiver `#add-lieu` selon `addType.value`
   dans `chart.js`, sans toucher au modèle de données.

Prêt pour l'implémentation.
