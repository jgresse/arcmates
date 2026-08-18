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

insert into people (nom, surnoms, emoji) values
  ('Greg', '{}', '🍺'),
  ('Ju', '{}', '🍻'),
  ('Vagin', '{}', '🥃');
  -- ... complète avec la vraie liste des membres de la rabbeutique.
  -- Exemple sans emoji (avatar pioché automatiquement) :
  -- ('Ben', '{}', null),

-- Pour ajouter quelqu'un plus tard, pas besoin de relancer tout le fichier :
-- insert into people (nom, emoji) values ('Nouveau Nom', '🎸');
