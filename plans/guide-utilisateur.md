# Plan — Page "Guide" intégrée au site

## Objectif
Le README couvre la partie technique (dev/déploiement). Il manque une page
accessible depuis l'app elle-même, pour un visiteur qui découvre la frise et
veut comprendre comment la lire et y ajouter un évènement — sans avoir à
aller lire un README sur GitHub.

## Décisions
- Nouvelle page HTML statique `guide.html` à la racine (même approche que
  `arc-diagram.html` : pas de bundler, réutilise `style.css`).
- Lien d'accès placé dans le drawer gauche (`#sidebar`) de `arc-diagram.html`
  — pas dans le header (le layout est mobile-first, le header est vide, tout
  passe par ce drawer). Lien retour depuis `guide.html` vers la frise.
- Contenu pensé pour un utilisateur non technique : comment lire les arcs,
  comment filtrer (personne / type), comment ajouter/modifier/supprimer un
  évènement, spécificités mobile (drawer, modal plein écran).
- **Multi-langue FR/EN, guide uniquement** — l'app frise (`arc-diagram.html`,
  `chart.js`, `data.js`) reste en français uniquement, hors périmètre. Seule
  `guide.html` est traduite, avec un sélecteur de langue (boutons "FR" / "EN"
  ou `<select>`) sur la page.
  - Stratégie i18n légère, sans lib externe : un dictionnaire JS
    `{ fr: {...}, en: {...} }` (dans `guide.html` ou un `guide-i18n.js`
    séparé), textes injectés via `data-i18n="clé"` sur les éléments +
    petite fonction `applyLang(lang)`.
  - Langue retenue en `localStorage` (ex. `guideLang`) pour persister le
    choix d'une visite à l'autre.
  - Langue par défaut : français (cohérent avec le reste du site), sauf si
    une préférence est déjà stockée.
- Pas de nouveau JS complexe côté rendu : page statique, quelques ancres,
  éventuellement 1-2 illustrations (screenshots ou schémas SVG simples).

## Tâches

- [x] **1. Contenu** — Lister les sections du guide :
  - Qu'est-ce que la frise (tronc temporel + arcs par personne)
  - Se déplacer (zoom/scroll, drawer sur mobile)
  - Filtrer par personne / par type d'évènement
  - Ajouter un évènement (clic zone vide → panneau)
  - Modifier / supprimer un évènement (clic sur un nœud)
  - Spécificités mobile (bouton ☰, modal plein écran)
  - FAQ courte (ex. "je ne vois pas mon évènement", "erreur d'enregistrement")
- [x] **2. Dictionnaire i18n** — rédiger les textes FR et EN de chaque
      section (structure `{ fr: {...}, en: {...} }`), clé par clé.
      → `guide-i18n.js`.
- [x] **3. Squelette `guide.html`** — structure HTML + réutilisation de
      `style.css` (variables `--bg`, `--card`, `--accent`, police
      Space Grotesk/Instrument Serif), sans dépendance D3/Supabase. Éléments
      de contenu balisés `data-i18n` + sélecteur de langue FR/EN dans l'en-tête
      de la page.
- [x] **4. Script de langue** — `applyLang(lang)`/`initLang()` dans
      `guide-i18n.js` : set le texte des éléments `data-i18n` (+ attribut
      `aria-label` via `data-i18n-aria`), persiste le choix dans
      `localStorage` (`guideLang`), et applique au chargement (langue stockée
      sinon FR par défaut).
- [x] **5. Styles dédiés** — section `.guide-*` ajoutée à la fin de
      `style.css` (colonne de lecture centrée, sections séparées par
      hairline, sélecteur de langue en pilule).
- [x] **6. Navigation croisée** — lien "📖 Guide d'utilisation" ajouté dans
      `#sidebar` de `arc-diagram.html` (drawer gauche, au-dessus des
      légendes), lien "← Retour à la frise" dans `guide.html`.
- [x] **7. Relecture mobile** — vérifié visuellement en 390px de large (via
      Playwright) : lisible, sections empilées, sélecteur de langue
      accessible, dans les deux langues.
- [x] **8. Mention dans le README** — `guide.html`/`guide-i18n.js` ajoutés
      au tableau "Fichiers" du README.

## Tests

- Unitaires (`tests/guide-i18n.test.js`) : parité des clés FR/EN, pas de
  valeur vide, pas de copier-coller FR→EN oublié, `pickLang()` retombe sur
  le français pour toute langue non supportée.
- Intégration (`tests/guide-integration.test.js`, via `jsdom`, nouvelle
  devDependency) : charge le vrai `guide.html` et le vrai `arc-diagram.html`
  — vérifie que les clés `data-i18n`/`data-i18n-aria` du HTML correspondent
  exactement au dictionnaire, que `applyLang()`/`initLang()` traduisent
  réellement le DOM (texte + `aria-label` + `<html lang>` + persistance
  `localStorage`), que le clic sur le bouton EN fonctionne de bout en bout,
  et que `#sidebar` contient bien un lien vers `guide.html`.
- Validation visuelle manuelle (Playwright + Chrome local, hors suite
  `npm test`) : captures desktop (FR puis EN) et mobile 390px, aucune
  erreur console — voir résultat dans la conversation, pas commité.
- `npm test` : 29/29 tests passent.

## Hors périmètre (pour l'instant)
- Pas de screenshots animés / GIFs.
- Pas de traduction de l'app frise elle-même (`arc-diagram.html`/`chart.js`/
  `data.js` restent en français uniquement) — seul le guide est bilingue.
- Pas d'autres langues que FR/EN pour l'instant (ex. hébreu — RTL — non
  demandé à ce stade).
- Pas de recherche/FAQ interactive — contenu statique dans un premier temps.
