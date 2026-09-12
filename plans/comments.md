# Plan — Commentaires sur un évènement

> Cf. entrée correspondante dans [`plans/roadmap.md`](roadmap.md) (section
> Backlog, "Commentaires sur un évènement").

## Objectif

Permettre à n'importe quel mate d'ajouter un commentaire texte libre sur un
évènement existant — "qui se souvient de quoi" — en plus du champ
`description` déjà présent (qui reste la description de référence, écrite
par le créateur/éditeur de l'évènement ; les commentaires sont un fil de
réactions de plusieurs personnes, chronologique, non éditable a posteriori
par quelqu'un d'autre que son auteur).

## Périmètre

**Dans le scope de cette itération :**
- Table Supabase `comments`, une ligne par commentaire, liée à un
  évènement.
- Lecture publique, ajout par n'importe qui (même modèle de confiance que
  `events` aujourd'hui — pas d'auth réelle, cf. roadmap).
- Modification/suppression d'un commentaire réservée à son auteur, **côté
  UI seulement** (bouton affiché seulement si tu es l'auteur) — pas
  d'application côté RLS pour l'instant (voir "Sécurité" ci-dessous, même
  limite déjà actée pour la suppression d'évènement dans la roadmap).
- Section commentaires affichée dans le panneau d'édition d'un évènement
  existant (`#add-panel` en mode édition) : liste chronologique + formulaire
  d'ajout.
- Notification email à l'admin à chaque nouveau commentaire (réutilise le
  pattern Database Webhook + Edge Function déjà en place pour
  `notify-new-person`).

**Hors scope pour cette itération** (à revisiter séparément si voulu) :
- Suppression/édition *réellement* restreinte à l'auteur côté serveur —
  dépend de l'**Authentification par email** (item roadmap existant) : sans
  identité fiable côté serveur, un `auteur_id` envoyé par un client anon
  est usurpable, exactement le même problème déjà documenté pour
  "Suppression restreinte à l'auteur" sur les évènements.
- Temps réel (Realtime) sur les commentaires — contrairement à `events`, on
  ne s'abonne pas aux changements Postgres pour cette table : la liste est
  simplement rechargée après chaque ajout/modif/suppression faite depuis ce
  client. Si quelqu'un d'autre commente pendant que ton panneau est ouvert,
  tu ne le verras qu'en rouvrant le panneau. Limite acceptée pour rester
  simple ; à revisiter si ça gêne en usage réel.
- Notifier l'auteur de l'évènement (ou les personnes taguées) quand un
  commentaire arrive — seul l'admin est notifié pour commencer (décision
  explicite, cf. tableau plus bas). Notifier aussi l'auteur de l'évènement
  resterait à ajouter séparément si le besoin se confirme.
- Réponses/threading (commenter un commentaire) — un seul niveau de fil
  plat pour l'instant.
- Édition du texte d'un commentaire par un admin/modérateur autre que
  l'auteur (cf. item roadmap "Modération légère", non lié spécifiquement
  aux commentaires).

## Modèle de données

Nouvelle table, migration séparée (comme `2026-09-add-person-email-and-write-policies.sql`)
plutôt qu'une édition rétroactive de `schema.sql` (cf. CLAUDE.md) :
`scripts/2026-09-add-comments.sql`.

```sql
create table comments (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid not null references events(id) on delete cascade,
  auteur_id uuid references people(id),
  texte text not null,
  cree_le timestamptz default now(),
  modifie_le timestamptz default now()
);

-- Réutilise la fonction set_modifie_le() déjà définie dans schema.sql pour
-- les évènements (générique, pas de raison de la dupliquer).
create trigger comments_set_modifie_le
  before update on comments
  for each row execute function set_modifie_le();

alter table comments enable row level security;
create policy "comments_select_all" on comments for select using (true);
create policy "comments_insert_all" on comments for insert with check (true);
create policy "comments_update_all" on comments for update using (true);
create policy "comments_delete_all" on comments for delete using (true);
```

Notes :
- `evenement_id ... on delete cascade` : supprimer un évènement supprime
  ses commentaires — cohérent avec le fait qu'un commentaire n'a aucun sens
  sans l'évènement qu'il commente (contrairement à `events.cree_par`, qui
  lui n'a pas de `on delete cascade` vers `people` — comportement existant,
  pas touché ici).
- `auteur_id` nullable (comme `events.cree_par`) : si personne n'a
  d'identité locale choisie (`getCurrentPersonId()` vide), le commentaire
  est quand même créé, juste sans auteur identifiable — dans ce cas il
  n'est modifiable/supprimable par personne (cf. "Sécurité").
- Policies `update`/`delete` ouvertes (`using (true)`) : la restriction
  "auteur seulement" est appliquée dans `chart.js` (bouton affiché
  seulement si `comment.auteurId === getCurrentPersonId()`), pas en base.
  Voir "Hors scope" ci-dessus pour pourquoi une vraie restriction serveur
  attend l'auth.
- Pas d'ajout à `supabase_realtime` (cf. "Hors scope" — pas de sync temps
  réel pour cette table en v1).

### Notification admin (Edge Function)

Même mécanique que `supabase/functions/notify-new-person/` :
- Nouvelle fonction `supabase/functions/notify-new-comment/index.ts`,
  déclenchée par un trigger Postgres + `pg_net` (pas de Database Webhook
  natif disponible, cf. commentaire dans
  `scripts/2026-09-notify-admin-new-person-trigger.sql`).
- Contrairement à `notify-new-person` (où le payload contient déjà tout ce
  qu'il faut), le payload d'un INSERT sur `comments` ne contient que des
  ids (`evenement_id`, `auteur_id`) — pas de titre d'évènement ni de nom
  d'auteur. La fonction fait donc un petit lookup côté serveur (client
  Supabase avec la clé `service_role`, injectée automatiquement dans l'env
  des Edge Functions — pas de nouveau secret à configurer) pour récupérer
  `events.titre` et `people.nom` avant d'envoyer l'email. Réutilise les
  secrets déjà configurés (`RESEND_API_KEY`, `ADMIN_EMAIL`,
  `WEBHOOK_SECRET`) — aucun nouveau secret à créer.
- Nouveau script `scripts/2026-09-notify-admin-new-comment-trigger.sql`,
  calqué sur `2026-09-notify-admin-new-person-trigger.sql` (fonction
  `notify_admin_new_comment()`, trigger `comments_notify_admin after
  insert on comments`).
- Même principe fire-and-forget : un échec d'envoi n'annule jamais la
  création du commentaire déjà commitée en base.
- Setup manuel à documenter dans `INSTALL.md` (nouvelle sous-section à côté
  du § 8 existant pour `notify-new-person`).

## Design UI

- Pas de vue "détail" séparée pour un évènement aujourd'hui — cliquer sur
  un nœud ouvre directement `#add-panel` en mode édition
  (`openEditPanel`). Les commentaires vivent donc dans une nouvelle section
  de ce même panneau plutôt que dans une 4ᵉ vue, cohérent avec l'absence de
  bundler/l'architecture à 3 fichiers.
- Nouveau bloc `#add-comments-section` dans `arc-diagram.html`, entre le
  champ `#add-desc` et `.add-actions` :
  - `<h4>💬 Commentaires</h4>`
  - `<ul id="add-comments-list">` — une entrée par commentaire : avatar +
    nom de l'auteur (ou "Quelqu'un" si `auteurId` absent ou personne
    supprimée depuis), date formatée (`d3.timeFormat("%d/%m/%Y")`), texte ;
    si `isCommentEditableBy(comment, getCurrentPersonId())` : boutons
    "Modifier"/"Supprimer" sur la ligne.
  - `<textarea id="add-comment-text" placeholder="Ajouter un commentaire...">`
    + `<button id="add-comment-submit">Publier</button>`.
- Visible seulement en mode édition (`editingEventId` non nul) — masqué
  (classe `.hidden`, même pattern que `#add-delete`) en mode création : un
  évènement qui n'existe pas encore en base n'a pas d'id à rattacher aux
  commentaires.
- Mobile : aucun traitement spécial nécessaire — la section fait partie de
  `#add-panel`, qui est déjà déplacé tel quel dans la modale plein écran
  par `openMobileModal()`.

## Découpage technique

**`scripts/2026-09-add-comments.sql`** : migration ci-dessus (table +
trigger + RLS).

**`scripts/2026-09-notify-admin-new-comment-trigger.sql`** +
**`supabase/functions/notify-new-comment/index.ts`** : notification admin
ci-dessus.

**`storage.js`** (ajouts, même pattern que les fonctions `*Event`
existantes) :
- `fromTimestamp(str)` — petit helper à côté de `fromISODate`/`toISODate` :
  `cree_le`/`modifie_le` sont des `timestamptz` (pas des `date`), donc
  `new Date(str)` direct suffit (pas de décalage de fuseau à corriger,
  contrairement à `fromISODate`).
- `rowToComment(row)` / `commentToRow(comment)` — conversion snake_case
  Supabase <-> camelCase JS, même esprit que `rowToEvent`/`eventToRow`.
  `commentToRow` n'envoie que `evenement_id`, `auteur_id`, `texte` (jamais
  `cree_le`/`modifie_le`, gérés par la base).
- `listCommentsForEvent(evenementId)` — `select().eq("evenement_id", ...).order("cree_le")`
  (ordre chronologique croissant), map `rowToComment`.
- `createComment(comment)` — insert + `.select().single()`, comme
  `createEvent`.
- `updateComment(id, texte)` — update `{ texte }` seulement (jamais
  `evenement_id`/`auteur_id`, non réassignables après coup) + `.select().single()`.
- `deleteComment(id)` — même garde que `deleteEvent` : `.select()` après le
  delete, erreur explicite si 0 ligne renvoyée (silencieux sinon en cas de
  policy RLS manquante/désactivée) — garde la même robustesse même si la
  policy est ouverte aujourd'hui, cohérent avec le principe déjà en place
  pour `deleteEvent`.
- Toutes exportées via le `module.exports` existant en bas du fichier.

**`data.js`** (fonction pure, à côté de `needsIdentitySelection`) :
- `isCommentEditableBy(comment, personId)` → `!!comment.auteurId && comment.auteurId === personId`.
  Extraite ici (plutôt qu'inline dans `chart.js`) pour rester testable sans
  DOM, même principe que le reste du fichier.
- Exportée via le `module.exports` existant.

**`chart.js`** :
- Références DOM : `commentsSection`, `commentsList`, `commentText`,
  `commentSubmitBtn` (const, à côté des autres refs `add*` existantes).
- État : `let currentEventComments = []` (commentaires du panneau
  actuellement ouvert), `let editingCommentId = null` (commentaire en cours
  d'édition inline, distinct de `editingEventId`).
- `async function loadComments(evenementId)` — appelle
  `listCommentsForEvent`, peuple `currentEventComments`, appelle
  `renderComments()` ; erreur réseau → `showStatus(..., true)` (même
  pattern que le reste du panneau) sans bloquer l'affichage du reste du
  formulaire.
- `function renderComments()` — join D3 sur `currentEventComments` dans
  `#add-comments-list` ; pour chaque ligne, résout l'auteur via
  `people.find(p => p.id === comment.auteurId)` (avatar+nom, ou "Quelqu'un"
  si absent) ; boutons Modifier/Supprimer conditionnés par
  `isCommentEditableBy(comment, getCurrentPersonId())` ; la ligne en cours
  d'édition (`comment.id === editingCommentId`) affiche un `<textarea>`
  pré-rempli + "Enregistrer"/"Annuler" au lieu du texte + boutons.
- `openEditPanel(evt)` : en plus du pré-remplissage existant, démasque
  `commentsSection` et appelle `loadComments(evt.id)`.
- `openAddPanel(clickDate)` : masque `commentsSection`, vide
  `currentEventComments`/`editingCommentId` (pas de commentaires en mode
  création).
- `closeAddPanel()` : réinitialise aussi `currentEventComments = []` et
  `editingCommentId = null`, même endroit que la remise à zéro de
  `editingEventId`.
- Listener `#add-comment-submit` (click) : texte trim non vide → disable
  bouton → `createComment({ evenementId: editingEventId, auteurId:
  getCurrentPersonId(), texte })` → vide le textarea → `loadComments(editingEventId)`
  → réactive le bouton ; erreur → `showStatus`.
- Listeners Modifier/Supprimer délégués sur `#add-comments-list` (event
  delegation, la liste est reconstruite à chaque `renderComments()`) :
  - Modifier → `editingCommentId = comment.id` → `renderComments()`.
  - Enregistrer (dans la ligne en édition) → `updateComment(id, texte)` →
    `editingCommentId = null` → `loadComments(editingEventId)`.
  - Annuler → `editingCommentId = null` → `renderComments()` (pas de
    rechargement réseau).
  - Supprimer → `window.confirm(...)` (même pattern que `#add-delete`) →
    `deleteComment(id)` → `loadComments(editingEventId)` ; erreur →
    `showStatus`.

**`arc-diagram.html`** : bloc `#add-comments-section` décrit ci-dessus,
entre `#add-desc` et `.add-actions` dans `#add-panel`.

**`style.css`** : styles de la liste de commentaires (une ligne par
commentaire : avatar+nom+date en en-tête, texte en dessous, boutons
Modifier/Supprimer alignés à droite façon discrète), du textarea/bouton
"Publier", réutilisant les tokens couleur déjà définis (pas de nouvelle
palette).

**`tests/data.test.js`** : cas pour `isCommentEditableBy` (auteur match,
mismatch, `auteurId` absent).

**`tests/storage.test.js`** : cas pour `rowToComment`/`commentToRow`
(aller-retour, champs optionnels absents) et `fromTimestamp`, même pattern
que les tests `rowToEvent`/`eventToRow`/`fromISODate` existants.

**`INSTALL.md`** : nouvelle sous-section (à côté du § 8 existant) pour le
setup manuel de `notify-new-comment` (déploiement + trigger SQL).

## Sécurité — résumé

Même modèle de confiance que le reste de l'app aujourd'hui (pas d'auth
réelle, cf. roadmap) : n'importe qui ayant le lien peut, via l'API REST
Supabase directement (en contournant le front), modifier/supprimer
n'importe quel commentaire malgré la restriction UI "auteur seulement" —
ce n'est **pas** un trou de sécurité nouveau introduit par cette feature,
juste la continuation du risque déjà documenté dans roadmap.md
("Écriture ouverte sur `people`", suppression d'évènement ouverte à tous).
À ajouter à la liste roadmap des risques ouverts.

## Décisions (validées avec l'utilisateur, 2026-09-12)

| # | Question posée | Réponse | Décision retenue |
|---|---|---|---|
| 1 | Un commentaire peut-il être modifié/supprimé par son auteur ? | "supprimer/modifier si c l'auteur du commentaire" | Édition + suppression, restreintes à l'auteur **côté UI** (bouton visible seulement si tu es l'auteur) — pas d'application serveur fiable possible sans auth, cf. "Hors scope" |
| 2 | Notification email à l'ajout d'un commentaire ? | "notifier l'admin seulement pour commencer" | Notification admin uniquement (réutilise `notify-new-person`), pas de notification à l'auteur de l'évènement/aux personnes taguées pour l'instant |

Prêt pour l'implémentation.
