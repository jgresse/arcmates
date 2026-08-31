# Arcmates — Roadmap (features à implémenter / idées)

> Fichier unique qui remplace les anciennes notes de plan du vault Obsidian
> (Concept, Plan MVP, Plan V1). Ne garde que ce qui reste à faire ou à
> creuser ; l'historique (décisions déjà prises, ce qui est déjà fait) vit
> dans le code et `CLAUDE.md`/`README.md`, pas ici. Le conceptuel/vision
> reste dans le vault Obsidian (`Arcmates - Concept.md`).

## À faire (prioritaire)

- [ ] **Identité déclarative** — écran "Qui es-tu ?" au premier chargement
      (si rien en `localStorage`) : liste déroulante des personnes
      existantes (`listPeople()`), pas de saisie libre. Sélection stockée en
      `localStorage` (`{ personId }`), réutilisée pour préremplir `cree_par`
      à la création/édition d'un évènement et pré-cocher "sa" personne dans
      le filtre. Petit lien "Ce n'est pas moi" pour changer d'identité.
      Aujourd'hui : `cree_par` n'est jamais rempli, aucune UI de sélection
      d'identité n'existe.

## Idée à évaluer (pas prioritaire)

- [ ] **Suppression restreinte à l'auteur** — n'autoriser la suppression d'un
      évènement que par la personne qui l'a créé (aujourd'hui : ouverte à qui
      a le lien, via la policy `events_delete_all`). Dépend de l'**Identité
      déclarative** ci-dessus pour savoir qui est "l'utilisateur courant" —
      `cree_par` existe déjà en base mais n'est jamais rempli. Point dur à
      trancher : une vraie policy RLS `using (cree_par = ...)` ne peut pas se
      fier à un id envoyé par un client anon non authentifié (n'importe qui
      pourrait usurper n'importe quel `cree_par`) — donc soit une vraie auth
      Supabase (magic link, déjà listé en "Hors périmètre v2+"), soit accepter
      que ce ne soit qu'une contrainte d'UI (bouton masqué/désactivé si ce
      n'est pas l'auteur déclaré), en sachant qu'elle reste contournable côté
      client.

## Backlog (non bloquant, à revisiter si besoin)

- [ ] Arcs narratifs — regrouper les évènements d'une période sous un
      "arc" nommé par le groupe (ex. "l'arc coloc", "l'arc Berlin"), façon
      chapitres d'une série, en plus du découpage temporel brut. Concept
      posé dans `Arcmates - Concept.md` (vault Obsidian) mais mécanique pas
      définie côté implémentation : création d'un arc, bornes temporelles,
      affichage sur la frise, gestion des arcs qui se chevauchent entre
      personnes.

- [ ] Chargement des évènements par plage de dates plutôt que tout charger
      d'un coup — seulement si le volume réel grossit et ralentit le
      chargement initial. Prématuré tant que le groupe est petit.
- [ ] Persistance des filtres dans l'URL (lien partageable "frise filtrée
      sur Greg").
- [ ] Historique des modifications exploité dans l'UI (voir qui a créé/
      modifié quoi) — le champ `historique`/`cree_par` existe déjà en base,
      rien ne l'affiche encore côté UI.
- [ ] Import/export (JSON/PDF/image) pour archivage ou partage hors-ligne.
- [ ] Modération légère : un évènement ajouté par quelqu'un reste visible
      immédiatement mais signalable/éditable par un admin, plutôt qu'une
      validation bloquante.
- [ ] Recherche texte dans les titres/descriptions, en complément du filtre
      par personne/type.
- [ ] Vue "aujourd'hui il y a X ans" — met en avant les évènements dont
      c'est l'anniversaire, façon "souvenirs".
- [ ] Commentaires sur un évènement (qui se souvient de quoi).

## Hors périmètre actuel (v2+)

- Frises personnelles — instances autonomes du même graphe, décorrélées de
  la frise fondatrice, pour d'autres groupes.
- Page admin / rôles / gestion des types d'évènements en UI (aujourd'hui
  liste fixe codée en dur).
- Notifications e-mail quand une personne est taguée.
- Vraie auth (magic link Supabase) si la "confiance déclarative" (écriture
  ouverte à qui a le lien) pose un jour problème.

## Risques encore ouverts

- **Policies RLS** : vérifier explicitement qu'aucune policy d'écriture
  publique n'existe sur `people` (doit rester lecture seule depuis l'app,
  ajout uniquement via `scripts/seed-people.sql`).
- **Édition simultanée du même évènement** par deux personnes en même
  temps : "dernier arrivé gagne" par défaut, assumé comme acceptable à
  cette échelle (petit groupe) — pas de résolution de conflit fine prévue.
