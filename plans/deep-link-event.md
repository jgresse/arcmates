# Plan — Lien partageable vers un évènement précis (`#event=<id>`)

> Cf. entrée correspondante dans [`plans/roadmap.md`](roadmap.md) (section
> Backlog, "Lien partageable vers un évènement précis... variante ciblée de
> la persistance des filtres dans l'URL"). Ce plan couvre **uniquement**
> cette variante ciblée (un id d'évènement) — la persistance générale des
> filtres personne/type dans l'URL reste un item roadmap séparé, non traité
> ici.

## Objectif

Deux faces d'une même feature :
1. **Générer** le lien — un bouton dans le panneau d'édition d'un
   évènement copie une URL du type `arc-diagram.html#event=<id>`.
2. **Consommer** le lien — au chargement, si l'URL contient
   `#event=<id>`, la frise centre/zoome automatiquement la caméra sur cet
   évènement, sans action de l'utilisateur.

## Périmètre

**Dans le scope :**
- Lecture de `location.hash` au boot, centrage + zoom sur l'évènement
  correspondant s'il existe.
- Réutilisation de la mécanique de zoom déjà en place pour le diaporama
  (`transformForDomain`, `clampWindowToZoomExtent`, `diaporamaWindow`)
  plutôt que d'inventer un nouveau calcul de fenêtre.
- Petit flash de mise en évidence du nœud ciblé à l'arrivée (repère visuel
  "c'est celui-là"), en réutilisant le halo déjà dessiné par le diaporama.
- Bouton "🔗 Copier le lien" dans `#add-panel`, visible seulement en mode
  édition (comme `#add-delete`).
- Dégradation silencieuse si l'id ne correspond à aucun évènement (lien
  copié avant suppression de l'évènement, faute de frappe dans l'URL...) :
  pas d'erreur bloquante, juste rien ne se passe (pas de zoom).

**Hors scope pour cette itération** (déjà listé séparément dans
`roadmap.md`) :
- Persistance des filtres personne/type dans l'URL (item roadmap distinct).
- Ouvrir automatiquement le panneau d'édition de l'évènement ciblé au
  chargement — ce plan se limite à centrer/zoomer la caméra dessus (cf.
  formulation roadmap), pas à entrer en mode édition. Voir "Ouvert" plus
  bas si ce comportement est finalement voulu.

## Comment center/zoomer (réutilisation, pas de nouvelle mécanique)

Le diaporama (`plans/diaporama.md`, déjà implémenté) résout déjà exactement
ce problème — centrer la caméra sur un évènement avec un niveau de zoom
cohérent avec son voisinage temporel — via :
- `diaporamaCenterDate(evt)` — centre d'un évènement (milieu du segment
  pour un multi-jours, sa date sinon).
- `diaporamaWindow(prevDate, currentDate, nextDate, opts)` (pure, `data.js`)
  — calcule `[start, end]`, resserré/élargi selon la proximité du voisin le
  plus proche.
- `clampWindowToZoomExtent(centerDate, start, end, base)` (`chart.js`) —
  garde le zoom résultant dans `zoomBehavior.scaleExtent()`.
- `transformForDomain(start, end, base)` + `svg.call(zoomBehavior.transform, ...)`
  — applique effectivement le zoom.

Différence avec le diaporama : celui-ci calcule `prevDate`/`nextDate` à
partir de l'ordre de lecture *filtré* (la séquence `diaporamaState.order`
d'une personne/d'un type). Un lien profond n'a pas ce contexte (on arrive
sur la frise complète, sans filtre actif) — `prevDate`/`nextDate` doivent
donc être calculés sur **tous les évènements**, triés par date, pas sur une
personne en particulier.

Nouvelle fonction pure dans `data.js` (testable sans DOM, même famille que
`diaporamaWindow`) :

```js
// Dates de l'évènement précédent/suivant `eventId` dans l'ordre
// chronologique de TOUS les évènements de eventsList (pas filtré par
// personne/type — un lien profond arrive sur la frise complète). Renvoie
// { prevDate: null, nextDate: null } si eventId est introuvable.
function neighborDates(eventId, eventsList = events) {
  const sorted = [...eventsList].sort((a, b) => a.date - b.date);
  const idx = sorted.findIndex(e => e.id === eventId);
  if (idx === -1) return { prevDate: null, nextDate: null };
  return {
    prevDate: idx > 0 ? sorted[idx - 1].date : null,
    nextDate: idx < sorted.length - 1 ? sorted[idx + 1].date : null
  };
}
```

`chart.js` compose les trois : `neighborDates` → `diaporamaWindow` →
`clampWindowToZoomExtent` → `transformForDomain` → `svg.call(zoomBehavior.transform, ...)`.

## Découpage technique

**`data.js`** :
- `neighborDates(eventId, eventsList = events)` ci-dessus.
- Exportée via le `module.exports` existant.

**`chart.js`** :
- `function centerOnEventId(id)` :
  ```js
  function centerOnEventId(id) {
    const evt = events.find(e => e.id === id);
    if (!evt) return; // lien mort (évènement supprimé) — dégradation silencieuse
    const centerDate = diaporamaCenterDate(evt);
    const { prevDate, nextDate } = neighborDates(id);
    const window = diaporamaWindow(prevDate, centerDate, nextDate);
    const clamped = clampWindowToZoomExtent(centerDate, window.start, window.end, baseScale);
    svg.call(zoomBehavior.transform, transformForDomain(clamped.start, clamped.end, baseScale));
    flashHighlight(evt);
  }
  ```
- `function flashHighlight(evt)` — réutilise `gDiaporamaHalo`/`diaporamaHalo`
  (déjà dessiné pour le diaporama) : le positionne sur le nœud de `evt`
  (même calcul que `nodeYFor`/`haloY` déjà utilisés par le diaporama),
  l'affiche, puis le masque après un délai (`setTimeout`, ~1.5s) — pas de
  nouvel élément SVG, pas de nouvelle classe CSS, juste un déclenchement
  ponctuel du halo existant en dehors de `diaporamaState`.
- `boot()` : après le premier `render()`, ajoute :
  ```js
  const hashMatch = location.hash.match(/^#event=([0-9a-f-]{36})$/);
  if (hashMatch) centerOnEventId(hashMatch[1]);
  ```
  (regex UUID plutôt que `location.hash.slice(7)` brut — évite de tenter
  un centrage sur un hash malformé/une valeur qui n'est manifestement pas
  un id.)
- Bouton "Copier le lien" :
  - Référence DOM `addShareLinkBtn` à côté des autres refs `add*`.
  - Listener :
    ```js
    addShareLinkBtn.addEventListener("click", async () => {
      const url = `${location.origin}${location.pathname}#event=${editingEventId}`;
      try {
        await navigator.clipboard.writeText(url);
        showStatus("Lien copié !", false);
      } catch {
        // navigator.clipboard demande un contexte sécurisé — peut échouer
        // en file:// (usage local, cf. CLAUDE.md "ouvrir arc-diagram.html
        // directement") selon le navigateur. Repli : champ texte temporaire
        // pré-sélectionné, pour un copier manuel (Cmd/Ctrl+C).
        promptManualCopy(url);
      }
    });
    ```
  - `function promptManualCopy(url)` — crée un `<input>` temporaire hors
    écran contenant `url`, le sélectionne (`select()`), affiche un message
    `showStatus("Copie automatique indisponible — le lien est sélectionné, Cmd/Ctrl+C pour copier.", false)`.
  - `openEditPanel(evt)` : démasque `addShareLinkBtn` (comme `addDeleteBtn`).
  - `openAddPanel(clickDate)` : masque `addShareLinkBtn` (pas de lien
    possible pour un évènement pas encore créé, pas d'id).

**`arc-diagram.html`** : nouveau bouton dans `.add-actions`, à côté de
`#add-delete` :
```html
<button id="add-share-link" class="hidden">🔗 Copier le lien</button>
```
Style neutre par défaut (`#add-panel button`), pas de nouvelle classe CSS
nécessaire — même traitement que `#add-cancel`.

**`tests/data.test.js`** : cas pour `neighborDates` — évènement au milieu
d'une liste (prev + next), en tête (prev null), en fin (next null), id
introuvable (les deux null), liste à un seul évènement.

## Sécurité / vie privée

Aucune nouvelle surface d'écriture : le lien encode juste un id
d'évènement déjà lisible publiquement (RLS `events_select_all` ouvre déjà
la lecture à qui a le lien de l'app, cf. `roadmap.md`) — un lien profond ne
révèle rien qui n'était pas déjà accessible en naviguant la frise à la
main.

## Ouvert

1. **Ouvrir aussi le panneau d'édition au clic sur un lien profond**, en
   plus de centrer/zoomer — pas fait par défaut dans ce plan (la
   formulation roadmap ne demande que le centrage), mais serait un ajout
   mineur (`openEditPanel(evt)` juste après `centerOnEventId`) si l'usage
   réel montre que "voir le nœud en surbrillance" ne suffit pas et qu'on
   veut directement le détail (titre/description) à l'arrivée.
2. **Durée/style du flash de mise en évidence** : ~1.5s proposé par
   défaut, ajustable sans impact sur le reste du plan.
3. **`history.replaceState` après centrage** pour nettoyer le hash de
   l'URL une fois le centrage fait (évite qu'un `handleResize()`/reload
   ultérieur ne re-déclenche le centrage de façon inattendue) — pas inclus
   par défaut : garder le hash dans l'URL après chargement permet au
   contraire de recharger la page (F5) en restant centré au même endroit,
   ce qui semble plus utile que gênant. À revoir si un cas d'usage réel
   montre le contraire.

Prêt pour l'implémentation.
