-- ---------------------------------------------------------------------
-- Frise chronolobbeutique — seed des personnes (Plan V1, Phase B)
-- À exécuter APRÈS schema.sql, dans le même SQL Editor Supabase.
--
-- La table `people` est en lecture seule depuis l'app (pas de policy
-- insert/update) : c'est toi qui gères la liste ici, à la main, et qui
-- ré-exécutes ce script (ou des `insert` ponctuels) à chaque nouvel arrivant
-- dans la rabbeutique.
--
-- `emoji` sert d'avatar dans la frise ; laisse NULL pour qu'un avatar par
-- défaut soit pioché automatiquement côté client (cf. AVATAR_EMOJIS dans
-- data.js).
-- ---------------------------------------------------------------------

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
  ('Fky', '{}', '😈'),
  ('Juliette', '{}', '🧉');
  -- ... ajuste/complète avec la vraie liste des membres de la rabbeutique.
  -- Exemple sans emoji (avatar pioché automatiquement) :
  -- ('Nouveau Nom', '{}', null),

-- Pour ajouter quelqu'un plus tard, pas besoin de relancer tout le fichier :
-- insert into people (nom, emoji) values ('Nouveau Nom', '🎸');
