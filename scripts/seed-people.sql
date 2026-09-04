-- ---------------------------------------------------------------------
-- Arcmates — seed des personnes
-- À exécuter APRÈS schema.sql, dans le même SQL Editor Supabase.
--
-- Sert au seed initial (première mise en route, cf. INSTALL.md). Une fois
-- l'app en route, ajouter quelqu'un peut aussi se faire depuis l'interface
-- (bouton "+ Ajouter une personne" dans la sidebar) — `people` n'est plus en
-- lecture seule depuis l'app (cf.
-- scripts/2026-09-add-person-email-and-write-policies.sql). Ce script reste
-- utile pour un import en masse ou pour repartir d'une liste propre.
--
-- `emoji` sert d'avatar dans la frise ; laisse NULL pour qu'un avatar par
-- défaut soit pioché automatiquement côté client (cf. AVATAR_EMOJIS dans
-- data.js).
-- ---------------------------------------------------------------------

-- Repart d'une liste propre à chaque exécution du script (plutôt que
-- d'accumuler des doublons à chaque relance) : on vide `people` avant de la
-- repeupler. Si ça échoue avec une erreur de clé étrangère, c'est qu'un
-- évènement référence encore une de ces personnes via `events.cree_par` —
-- purge d'abord les évènements de test avec scripts/purge-events.sql, puis
-- relance ce script.
delete from people;

-- Liste basée sur les pseudos cités dans les Tomes (Statistiques des
-- vannes) — mêmes 24 noms utilisés pour le stress-test du POC. Emojis
-- attribués au hasard dans le pool thématique (cf. AVATAR_EMOJIS,
-- data.js) : change-les librement, ils ne servent qu'à distinguer les
-- avatars visuellement.
insert into people (nom, surnoms, emoji) values
  ('Greg', '{}', '🍺'),
  ('Dirty', '{}', '🎸'),
  ('Antho', '{}', '👑'),
  ('Ben', '{}', '🥃'),
  ('Rich', '{}', '🔥'),
  ('Butch', '{}', '🍖'),
  ('Dodo', '{}', '🐐'),
  ('Delph', '{}', '🍷'),
  ('Fabz', '{}', '😇'),
  ('Guillaume', '{}', '🥂'),
  ('Lolo', '{}', '🎀'),
  ('Bert', '{}', '🧢'),
  ('Streetie', '{}', '🕺'),
  ('Pauline', '{}', '🧘‍♀️'),
  ('Laeti', '{}', '🎸'),
  ('Alex', '{}', '📿'),
  ('Franky', '{}', '😈'),
  ('Maud', '{}', '🍩'),
  ('Juliette', '{}', '🧉');
  -- ... ajuste/complète avec la vraie liste des membres de la rabbeutique.
  -- Exemple sans emoji (avatar pioché automatiquement) :
  -- ('Nouveau Nom', '{}', null),

-- Pour ajouter quelqu'un plus tard, pas besoin de relancer tout le fichier :
-- insert into people (nom, emoji) values ('Nouveau Nom', '🎸');
