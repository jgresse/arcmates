-- ---------------------------------------------------------------------
-- Arcmates — trigger de notification admin (remplace le Database Webhook
-- du dashboard, absent de cette version de Supabase — Database ne propose
-- que Tables/Functions/Triggers/Extensions/Publications, pas d'entrée
-- "Webhooks" dédiée). Même mécanisme sous le capot : un trigger Postgres
-- qui appelle l'Edge Function via l'extension pg_net à chaque INSERT sur
-- `people`. Cf. supabase/functions/notify-new-person/ pour le code de la
-- fonction, et CLAUDE.md/INSTALL.md § 8 pour le contexte.
--
-- AVANT d'exécuter ce script (dans le SQL Editor, pas en committant les
-- vraies valeurs dans ce fichier) :
--   1. Remplace <TON_WEBHOOK_SECRET> par la VRAIE valeur du secret
--      WEBHOOK_SECRET de la fonction — sert de contrôle d'accès applicatif,
--      cf. notify-new-person/index.ts pour le pourquoi du header dédié
--      "x-webhook-secret" plutôt que "Authorization".
--   2. Remplace <TA_CLE_ANON> par la clé anon/publishable du projet (la
--      même que SUPABASE_ANON_KEY dans storage.js — délibérément publique,
--      ok de la coller ici). Nécessaire pour "Authorization" : la
--      passerelle Supabase exige un JWT valide avant même d'exécuter le
--      code de la fonction, sans quoi la requête est rejetée avec
--      UNAUTHORIZED_INVALID_JWT_FORMAT sans jamais atteindre notre code
--      (vécu en prod : aucun log côté fonction dans ce cas).
-- ---------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;

create or replace function notify_admin_new_person()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url := 'https://izzwaxgtwikjweebtcgs.supabase.co/functions/v1/notify-new-person',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <TA_CLE_ANON>',
      'x-webhook-secret', '<TON_WEBHOOK_SECRET>'
    ),
    body := jsonb_build_object('type', 'INSERT', 'table', 'people', 'record', row_to_json(new))
  );
  return new;
end;
$$;

-- Fire-and-forget par nature (net.http_post est asynchrone côté pg_net) :
-- un échec de l'appel HTTP ne fait pas échouer l'INSERT sur `people`, cf.
-- commentaire dans notify-new-person/index.ts.
-- `drop ... if exists` avant `create` pour que le script reste rejouable
-- tel quel (ex. après une correction du corps de la fonction) sans erreur
-- "trigger already exists".
drop trigger if exists people_notify_admin on people;
create trigger people_notify_admin
  after insert on people
  for each row execute function notify_admin_new_person();
