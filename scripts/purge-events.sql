-- ---------------------------------------------------------------------
-- Frise chronolobbeutique — purge des évènements de test
-- À exécuter dans le SQL Editor Supabase quand tu veux repartir d'une
-- frise vide (après une session de tests par exemple), SANS toucher à la
-- table `people` (les personnes du seed restent en place).
-- ---------------------------------------------------------------------

-- Option A (recommandée) : vide la table et réinitialise les séquences /
-- statistiques internes. Plus rapide qu'un DELETE sur une grosse table,
-- mais ne déclenche pas le trigger `events_set_modifie_le` (sans
-- importance ici puisqu'on supprime tout).
truncate table events;

-- Option B, si tu veux ne purger qu'une partie des évènements (ex. ceux
-- créés aujourd'hui pendant une session de tests) : commente le TRUNCATE
-- ci-dessus et utilise plutôt un DELETE ciblé, par exemple :
--
-- delete from events where cree_le >= now() - interval '1 day';
--
-- ou, pour ne garder que ce qui a été créé par une personne précise
-- (utile si "toi" testes au milieu d'events déjà réels d'autres membres) :
--
-- delete from events where cree_par = (select id from people where nom = 'Greg');
