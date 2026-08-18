# Guide d'installation — Frise chronolobbeutique (v1, Supabase)

Ce guide couvre la mise en route de la persistance Supabase. Le reste (D3,
zoom, panneau) fonctionne déjà tel quel, sans build ni dépendance —
`arc-diagram.html` charge simplement D3, le SDK Supabase, puis `data.js`,
`storage.js`, `chart.js` via des balises `<script>` classiques.

## 1. Le projet Supabase

Projet déjà créé : `https://izzwaxgtwikjweebtcgs.supabase.co`.
(Si tu dois en recréer un : [supabase.com](https://supabase.com) → New
project → choisir une région → attendre la fin du provisioning, ~2 min.)

## 2. Créer les tables (schema.sql)

1. Dans le dashboard Supabase, aller dans **SQL Editor** (icône `</>`) →
   **New query**.
2. Ouvrir [`scripts/schema.sql`](scripts/schema.sql), copier tout son
   contenu, le coller dans l'éditeur.
3. **Run**. Ça crée les tables `people` et `events`, un trigger qui met à
   jour `modifie_le` automatiquement, et active la Row Level Security (RLS)
   avec les policies décrites dans le plan (lecture publique sur les deux
   tables, écriture publique sur `events` uniquement — `people` reste en
   lecture seule depuis l'app).

## 3. Ajouter les personnes (seed-people.sql)

1. Toujours dans le SQL Editor, **New query**.
2. Ouvrir [`scripts/seed-people.sql`](scripts/seed-people.sql), remplacer la
   liste d'exemple par la vraie liste des membres (nom + emoji optionnel).
3. **Run**.
4. Pour ajouter quelqu'un plus tard, pas besoin de tout rejouer : un simple

   ```sql
   insert into people (nom, emoji) values ('Nouveau Nom', '🎸');
   ```

   suffit, exécuté à la volée dans le SQL Editor.

## 4. Brancher la clé dans le code

1. Dans le dashboard Supabase : **Project Settings** (roue crantée) →
   **API**.
2. Récupérer :
   - **Project URL** (ex. `https://izzwaxgtwikjweebtcgs.supabase.co`)
   - **anon / public key** — aussi appelée **publishable key** sur les
     projets Supabase récents (elle commence par `sb_publishable_...` ou
     ressemble à un long JWT selon la version du dashboard). C'est la
     même clé, juste un nom différent selon l'interface.
3. Ouvrir [`storage.js`](storage.js), renseigner les deux constantes tout en
   haut du fichier :

   ```js
   const SUPABASE_URL = "https://izzwaxgtwikjweebtcgs.supabase.co";
   const SUPABASE_ANON_KEY = "...";
   ```

   ⚠️ **Utilise bien la clé `anon`/`publishable`, jamais la clé
   `service_role`/`secret`.** La clé anon est *faite* pour être publique et
   visible dans le code client — c'est normal, ce n'est pas un secret à
   cacher. C'est la Row Level Security (les policies définies dans
   `schema.sql`) qui protège les données, pas la confidentialité de cette
   clé. La clé `service_role`, elle, contourne complètement la RLS : elle ne
   doit **jamais** apparaître dans du code qui tourne dans un navigateur.

## 5. Tester en local

Ouvrir `arc-diagram.html` directement dans un navigateur (double-clic, ou
`open arc-diagram.html` depuis le dossier du projet). La frise doit se
charger avec les personnes du seed (sans événement au départ — normal, la
table `events` est vide). Cliquer sur une zone vide de la frise doit ouvrir
le panneau de création, et le clic sur "Créer" doit faire apparaître un
nouveau nœud après un court instant (aller-retour réseau vers Supabase).

En cas d'erreur, un bandeau apparaît en haut de l'écran (`#load-status`) —
ouvrir la console du navigateur (F12) pour le détail de l'erreur Supabase
(clé invalide, RLS mal configurée, etc.).

### Purger les évènements de test

Après une session de tests, `scripts/purge-events.sql` vide la table
`events` (sans toucher à `people`) : à coller/exécuter dans le SQL Editor
Supabase. Il contient aussi des variantes en commentaire pour ne purger
qu'une partie des évènements (par date de création, par personne...).

## 6. Tests unitaires

La logique pure (calcul des arcs, conversion des dates, mapping
camelCase ↔ snake_case) est couverte par des tests Node, sans framework ni
build — juste le test runner intégré à Node (`node --test`) :

```bash
npm install   # une fois, installe d3 comme dépendance de test
npm test
```

Les fichiers `data.js`/`storage.js` restent chargés en `<script>` classique
dans le navigateur (aucun changement de comportement) ; ils exposent en plus
un `module.exports` (ignoré par le navigateur, utilisé par les tests) pour
que `tests/*.test.js` puisse les `require()`. À faire à chaque modif de
`data.js`/`storage.js`/`chart.js` avant de commit, pour attraper vite une
régression sur le calcul des arcs ou le mapping Supabase.

## 7. Déployer (GitHub Pages)

Le site est 100% statique (pas de build), donc GitHub Pages suffit :

1. Sur le repo GitHub ([jgresse/rbbt-rcu](https://github.com/jgresse/rbbt-rcu))
   → **Settings** → **Pages**.
2. **Source** : `Deploy from a branch`, branche `main`, dossier `/ (root)`.
3. **Save**. L'URL de déploiement apparaît en haut de la page quelques
   minutes après (format `https://jgresse.github.io/rbbt-rcu/`).
4. Ouvrir `arc-diagram.html` via cette URL une fois déployé — c'est le lien
   à partager avec la rabbeutique.

Pas de variable d'environnement à gérer côté déploiement : la clé anon est
déjà en dur dans `storage.js`, committée avec le reste du code (cf. § 4 —
c'est voulu).
