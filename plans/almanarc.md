# Plan — Almanarc (bilan annuel)

> Plan validé (2026-09-12) — prêt à implémenter. Cf. entrée correspondante
> dans [`plans/roadmap.md`](roadmap.md).
>
> Nommage : "Wrapped" (référence externe, écarté) → "Récap Arcmates"
> (jugé trop plat) → **Almanarc**, retenu — contraction d'"almanach" (le
> carnet annuel traditionnel, ce que fait cette feature) et d'"arc", avec
> un écho à "L'Almonarque" (lore du groupe, cf. commentaire des avatars
> dans `data.js:44`).

## Objectif

Une vue qui résume une année de la frise, en deux temps : un bilan de
groupe (qui a fait quoi collectivement) et un bilan par personne (ce que
*toi* — ou n'importe quel mate — as fait cette année-là). Déclenchée à la
demande (bouton), pas automatiquement.

Aucune nouvelle donnée à stocker : tout se calcule côté client à partir de
`people`/`events`/`allArcs` déjà chargés par `initData()`. Zéro migration
SQL, zéro nouvelle table, zéro dépendance à l'auth (pas encore faite, cf.
roadmap).

## Périmètre

**Dans le scope de cette itération :**
- Un bouton "✨ Almanarc" pour ouvrir la modale.
- Un sélecteur d'année (années déduites des évènements existants, pas de
  saisie libre), par défaut l'**année civile en cours**.
- Deux onglets dans la même modale :
  - **Groupe** — bilan collectif de l'année sélectionnée.
  - **Par personne** — sélection d'un mate (réutilise le pattern déjà en
    place pour la liste "qui es-tu"), bilan individuel de l'année.

**Hors scope pour cette itération** (à revisiter séparément si voulu) :
- Auto-affichage en fin d'année ou à la connexion — ajoute de la
  complexité (quand exactement ? une fois par session/personne, donc
  localStorage à gérer) pour un bénéfice incertain vu la taille du groupe.
  On commence en déclenchement manuel.
- Partage/export du récap en image — dépend du futur item roadmap
  "Import/export (JSON/PDF/image)", pas dupliqué ici.
- Badges *permanents* affichés directement sur la frise/légende (item
  roadmap "Badges statistiques par personne") — ce plan calcule déjà les
  agrégats nécessaires (voir "Par personne" ci-dessous), donc cet item
  backlog se réduira probablement à un nouvel affichage réutilisant les
  mêmes fonctions, pas un nouveau calcul.

## Stats calculées

Un évènement compte dans l'année de sa **date de début** (`date`) ;
`dateFin` est ignorée pour éviter qu'un évènement à cheval sur deux années
ne compte double.

Ex-aequo (sur n'importe quelle stat "le plus/la plus...") : pas de
tie-break, le premier trouvé dans l'ordre de `people`/`events` gagne —
même logique que le "dernier arrivé gagne" déjà assumé ailleurs dans le
projet pour l'édition simultanée (cf. roadmap, section Risques). Décidé
2026-09-12, pas à revalider.

### Onglet Groupe

Sur les évènements de l'année sélectionnée :
1. **Nombre total d'évènements**.
2. **Type dominant** — le type le plus fréquent (`EVENT_TYPES`) + son
   compte.
3. **Personne la plus active** — celle taguée (`personnesTaguees`) dans le
   plus d'évènements de l'année.
4. **Plus grand voyageur** — personne avec le plus d'évènements de type
   "Voyage" dans l'année.
5. **Duo le plus fréquent** — la paire de personnes co-taguées ensemble
   sur le plus d'évènements de l'année (paires dérivées de
   `personnesTaguees`, taille ≥ 2).

### Onglet Par personne

Pour la personne sélectionnée, sur les évènements de l'année où elle
apparaît dans `personnesTaguees` :
1. **Nombre d'évènements** de son année.
2. **Son type dominant** — le type le plus fréquent parmi ses évènements.
3. **Son meilleur mate de l'année** — la personne avec qui elle partage le
   plus d'évènements communs (même mécanique que le "duo" du bilan
   groupe, mais ancrée sur une personne fixe plutôt que sur toutes les
   paires).

Année sans aucun évènement (pour le groupe, ou pour la personne
sélectionnée) : message "Rien à raconter pour {année}" plutôt que des
cartes à 0/undefined.

## Design UI

- **Déclencheur** : nouveau bouton dans la sidebar, à côté du lien
  "📖 Guide d'utilisation" (`arc-diagram.html:28`) — action de consultation,
  pas d'édition, donc pas à côté de "+ Ajouter une personne". Libellé :
  "✨ Almanarc".
- **Modale** : nouveau bloc `#almanarc-modal` réutilisant le pattern déjà en
  place pour `#person-modal`/`#whoareyou-modal` (classe `.app-modal`,
  toggle par `.hidden`, un bouton `.app-modal-close`).
- **Sélecteur d'année** : un `<select id="almanarc-year">` en haut de la
  modale, commun aux deux onglets, rempli avec les années distinctes
  présentes dans `events`, triées décroissant. Valeur par défaut : année
  civile en cours (même si aucun évènement dedans — dans ce cas le message
  "Rien à raconter" s'affiche, ce qui est un état normal et informatif).
- **Onglets** : deux boutons "Groupe" / "Par personne" en haut de la
  modale (sous le sélecteur d'année) qui togglent la vue affichée — pas de
  routing, juste un état local (`almanarcTab`) et un show/hide des deux
  blocs.
- **Onglet Par personne** : un sélecteur de personne réutilisant le style
  de `renderWhoAreYouList` (liste `.legend-list` avec avatar + nom,
  cliquable) plutôt qu'un `<select>` HTML brut — cohérent avec le reste de
  l'app qui affiche toujours les personnes avec leur avatar emoji.
- **Corps — révisé le 2026-09-12** (demande explicite : "vraiment comme le
  Wrapped de Spotify" ; annule le choix initial "pas de carrousel/story"
  ci-dessous conservé uniquement pour l'historique) : une "story" — une
  slide (stat) plein cadre à la fois, pas une grille. Chaque slide a un
  emoji, une valeur en gros/gras, une légende, et un fond teinté par la
  couleur de la personne concernée (ou du type d'évènement pour la slide
  "type dominant") via une variable CSS `--slide-color`. Navigation :
  boutons ‹/› de part et d'autre de la slide, clic sur la moitié gauche/
  droite de la slide elle-même (façon Stories), flèches clavier
  ←/→, Échap pour fermer. Barre de progression façon Stories Instagram
  (un segment par slide, le segment courant se remplit en continu) au-
  dessus de la slide. Auto-avance après 5s d'inactivité par slide,
  s'arrête sur la dernière (pas d'écran de fin/partage, cf. hors-scope).
  Ceci remplace le mode "diaporama" listé séparément dans la roadmap
  backlog pour la frise elle-même — celui-là reste distinct (il concerne
  la navigation dans les évènements de la frise, pas cette modale).
  ~~Pile verticale de cartes, pas de carrousel/story~~ *(choix initial du
  2026-09-12, matin — remplacé le même jour après retour utilisateur)*.

## Découpage technique

Respecte le partage `data.js` (calcul pur, testable) / `chart.js` (rendu
DOM) déjà en place — pas de 4ᵉ fichier, cohérent avec l'absence de
bundler.

**`data.js`** (fonctions pures, ajoutées à côté de `computeArcsForPerson`) :
- `availableYears(eventsList = events)` → tableau d'années distinctes
  (`number[]`), triées décroissant.
- `computeAlmanarcGroupe(year, eventsList = events, peopleList = people)` →
  `{ year, totalEvents, topType, mostActivePerson, topTraveler, topDuo }`
  (champ `null` si non calculable, ex. aucun voyage cette année-là).
- `computeAlmanarcPersonne(personId, year, eventsList = events, peopleList = people)`
  → `{ personId, year, totalEvents, topType, topMate }`.
- Toutes exportées via le `module.exports` existant en bas du fichier.
- Le calcul de "meilleur mate" (groupe : `topDuo` / personne : `topMate`)
  partage une même logique de comptage de paires co-taguées — factorisée
  dans une fonction interne commune plutôt que dupliquée entre les deux.

**`chart.js`** (révisé 2026-09-12, format story) :
- `buildAlmanarcGroupeSlides(year)` / `buildAlmanarcPersonneSlides(personId, year)` :
  appellent les fonctions `data.js` correspondantes, produisent un tableau
  de slides `{ emoji, value, label, color }` (tableau vide = rien à
  raconter cette année-là).
- `almanarcState = { groupe: { slides, index }, personne: { slides, index } }`
  — état des deux stories, reconstruit en bloc par `renderAlmanarcTab(view)`
  à chaque changement d'année/onglet/personne ; navigué slide par slide par
  `goToAlmanarcSlide`/`nextAlmanarcSlide`/`prevAlmanarcSlide`.
- `renderAlmanarcSlide(view)` peuple la slide courante + `renderAlmanarcProgress(view)`
  (barre façon Stories) + `updateAlmanarcNavButtons(view)`, puis
  `scheduleAlmanarcAutoAdvance(view)` programme l'avance automatique
  (`ALMANARC_AUTO_ADVANCE_MS`, 5000ms) sauf sur la dernière slide.
- Listeners : bouton d'ouverture → remplit `#almanarc-year` via
  `availableYears()` (+ année en cours si absente de la liste), sélectionne
  l'année en cours par défaut, affiche l'onglet Groupe ; changement
  d'année/personne → `renderAlmanarcTab` (reconstruit + revient à la 1ère
  slide) ; boutons d'onglet → toggle + `renderAlmanarcTab` ; clic sur la
  slide / boutons ‹› / flèches clavier → navigation sans reconstruction ;
  bouton close (et Échap) → masque la modale + coupe le timer d'auto-avance
  (même pattern `.hidden` que `closePersonModal`).

**`arc-diagram.html`** : bloc `#almanarc-modal` (structure calquée sur
`#person-modal`), avec le sélecteur d'année, les deux boutons d'onglet, une
barre de progression (`#almanarc-progress-groupe`/`-personne`), une zone
"stage" avec boutons ‹›  et la slide courante, et pour l'onglet individuel
une rangée horizontale de personnes (`#almanarc-personne-list`). Bouton
déclencheur `#almanarc-btn` dans la sidebar.

**`style.css`** : styles de la barre de progression façon Stories, des
boutons ‹›, de la slide plein cadre (teintée par `--slide-color`, animations
d'entrée `almanarc-slide-in`/`almanarc-pop`) et de la rangée horizontale
d'avatars, réutilisant les tokens couleur déjà définis plutôt que d'en
introduire de nouveaux (teinte de slide via `color-mix()` avec les tokens
existants).

**`tests/data.test.js`** : cas pour `availableYears`, `computeAlmanarcGroupe`
et `computeAlmanarcPersonne` sur un jeu d'évènements contrôlé (même pattern
que les tests existants de `computeArcsForPerson`) — couvre au minimum :
année avec données, année sans données (groupe et personne), ex-aequo,
duo/mate sur un évènement à 3 personnes taguées.

## Décisions (validées avec l'utilisateur, 2026-09-12)

| # | Question posée | Réponse de l'utilisateur | Décision retenue |
|---|---|---|---|
| 1 | Nom de la feature — "Wrapped" jugé trop plat, à remplacer par qqch en lien avec arc/mates | "faudrait un autre terme... arc ou mates" puis, après proposition de 4 pistes (Rétro-arc / L'Almanach / Le Sacre de l'année / Table des Mates), "Almanarc ?" | **Almanarc** |
| 2 | Bouton "✨ [nom]" dans la sidebar à côté du guide — ok ? | "ok" | Confirmé, emplacement inchangé |
| 3 | Les 5 stats du bilan Groupe (total, type dominant, personne la plus active, plus grand voyageur, duo le plus fréquent) — bon pour une v1 ? | "ok" | Confirmé pour la v1 |
| 4 | Ajout d'un onglet "Par personne" en plus du bilan de groupe, dans la même modale ? | "oui" | Confirmé — réutilise la même mécanique de calcul que le bilan groupe |
| 5 | Année par défaut = dernière année avec des évènements — confirme ? | "oui année en cours par défaut" (réponse qui corrige la proposition plutôt que la confirmer telle quelle) | **Année civile en cours**, pas la dernière année avec données |
| 6 | Ex-aequo non départagés (premier trouvé gagne, pas de gestion d'égalité affichée) — acceptable ? | "oui acceptable" | Confirmé |

Plus de décision ouverte : prêt pour l'implémentation.
