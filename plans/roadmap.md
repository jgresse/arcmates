# Arcmates — Roadmap (features à implémenter / idées)

> Fichier unique qui remplace les anciennes notes de plan du vault Obsidian
> (Concept, Plan MVP, Plan V1). Ne garde que ce qui reste à faire ou à
> creuser ; l'historique (décisions déjà prises, ce qui est déjà fait) vit
> dans le code et `CLAUDE.md`/`README.md`, pas ici. Le conceptuel/vision
> reste dans le vault Obsidian (`Arcmates - Concept.md`).

## Idée à évaluer (pas prioritaire)

- [ ] **Authentification par email (magic link Supabase)** — remplacer la
      "confiance déclarative" actuelle (écriture ouverte à qui a le lien, via
      les policies `events_insert_all`/`events_update_all`/`events_delete_all`
      dans `schema.sql`) par un vrai contrôle d'accès : seules les personnes
      déjà créées dans `people` (via `seed-people.sql`) peuvent écrire.
      Choix de design actés (2026-08) :
        - ✅ Colonne `email` sur `people` — faite (2026-09, cf.
          `scripts/2026-09-add-person-email-and-write-policies.sql`), dans le
          cadre de l'écran "qui es-tu"/complétion de profil, indépendamment
          de cette auth qui reste, elle, à faire.
        - Login sans mot de passe : `supabase.auth.signInWithOtp({ email })`
          envoie un lien de connexion ; l'utilisateur revient sur l'app avec
          une session (JWT contenant son email).
        - L'autorisation se fait **côté RLS, pas côté front** : remplacer les
          policies d'écriture `using (true)` par une vérification du type
          `using (exists (select 1 from people where email = auth.jwt() ->> 'email'))`.
          Raison : la clé `anon` est publique et le front est entièrement
          contournable (n'importe qui peut appeler l'API REST Supabase
          directement avec la clé copiée depuis le site) — une vérification
          faite uniquement en JS n'est que de l'UX, jamais un vrai contrôle
          d'accès.
        - Le front (`chart.js`/`storage.js`) ne gère que l'UX : écran de
          login, écouteur `onAuthStateChange`, masquer/désactiver les actions
          d'écriture si pas connecté — zéro rôle de sécurité dans cette
          couche.
        - Le "pas de build/bundler" du MVP (cf. `CLAUDE.md`) n'est pas un
          obstacle à ce choix : la frontière de sécurité vit dans Postgres
          (RLS), pas dans la façon dont le JS est livré au navigateur.

- [ ] **Suppression restreinte à l'auteur** — n'autoriser la suppression d'un
      évènement que par la personne qui l'a créé (aujourd'hui : ouverte à qui
      a le lien, via la policy `events_delete_all`). Dépend de
      l'**Authentification par email** ci-dessus pour avoir une identité
      fiable côté serveur — un id envoyé par un client anon non authentifié
      serait usurpable par n'importe qui — une fois l'auth en place, la
      policy devient `using (cree_par = (select id from people where email =
      auth.jwt() ->> 'email'))`. `cree_par` est déjà rempli à la création
      d'un évènement depuis l'identité locale choisie via l'écran "qui
      es-tu" (`getCurrentPersonId()` dans `chart.js`) — il ne manque plus
      que l'auth pour que cette valeur devienne fiable côté serveur.

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
- [ ] Types d'évènements en table Supabase plutôt que codés en dur dans
      `data.js` (`EVENT_TYPES`/`TYPE_COLORS`/`TYPE_EMOJIS`) — permettrait
      d'ajouter/renommer un type sans déploiement, et prépare la gestion en
      UI listée sous "Hors périmètre actuel". Implique une migration du
      CHECK constraint `events.type` vers une clé étrangère, et de charger
      la liste au boot comme `people`/`events` aujourd'hui.

## Hors périmètre actuel (v2+)

- Frises personnelles — instances autonomes du même graphe, décorrélées de
  la frise fondatrice, pour d'autres groupes.
- Page admin / rôles / gestion des types d'évènements en UI (aujourd'hui
  liste fixe codée en dur).
- Notifications e-mail quand une personne est taguée.

## Risques encore ouverts

- **Écriture ouverte sur `people`** (comme sur `events`) : n'importe qui
  ayant le lien peut créer une personne ou modifier le profil de n'importe
  laquelle (pas de policy RLS restreignant l'update à "son propre profil" —
  impossible à faire fiablement sans auth, cf. **Authentification par
  email** ci-dessus). Notification email à l'admin à chaque création (cf.
  `supabase/functions/notify-new-person/`), mais pas de blocage.
- **Édition simultanée du même évènement** par deux personnes en même
  temps : "dernier arrivé gagne" par défaut, assumé comme acceptable à
  cette échelle (petit groupe) — pas de résolution de conflit fine prévue.
