// Edge Function déclenchée par un Database Webhook Supabase (Dashboard >
// Database > Webhooks, table `people`, évènement INSERT) — envoie une
// notification par email à l'admin à chaque nouvelle personne créée.
//
// Contexte : pas de validation admin bloquante (choix produit, cf.
// plans/roadmap.md) — une personne créée via le formulaire est visible
// immédiatement. Cette notification est juste informative, non bloquante :
// un échec d'envoi ne doit jamais faire échouer/annuler la création déjà
// commitée en base (le webhook se déclenche APRÈS le commit de l'INSERT).
//
// Setup manuel (pas automatisable en code versionné — cf. INSTALL.md § 8) :
//   1. Déployer via le dashboard (Edge Functions > Deploy a new function).
//   2. Configurer les secrets RESEND_API_KEY / ADMIN_EMAIL / WEBHOOK_SECRET.
//   3. Trigger Postgres (cf. scripts/2026-09-notify-admin-new-person-trigger.sql)
//      qui appelle cette fonction à chaque INSERT sur `people`.
//
// Note sur les headers : le header "Authorization" est réservé à la
// passerelle Supabase elle-même, qui exige par défaut un JWT valide (clé
// anon/service_role) et rejette toute autre valeur AVANT même que ce code
// ne s'exécute (d'où l'absence de logs côté fonction si on s'en sert pour
// notre propre secret — vécu en prod, cf. conversation). Le contrôle
// d'accès applicatif (empêcher que n'importe qui déclenche l'envoi
// d'emails sans passer par une vraie création en base) se fait donc via un
// header dédié, "x-webhook-secret".
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

Deno.serve(async (req) => {
  if (!WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = await req.json();
  const person = payload.record; // { id, nom, surnoms, emoji, email, created_at }

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      // Domaine d'expéditeur à remplacer par un domaine vérifié dans Resend
      // une fois en usage réel (resend.dev ne fonctionne qu'en test).
      from: "Arcmates <notifications@resend.dev>",
      to: ADMIN_EMAIL,
      subject: `Arcmates — nouvelle personne : ${person.nom}`,
      text: person.email
        ? `${person.nom} vient de s'ajouter (email : ${person.email}).`
        : `${person.nom} vient de s'ajouter (pas d'email renseigné pour l'instant).`
    })
  });

  if (!emailRes.ok) {
    // Ne fait pas échouer la réponse au webhook : Supabase ne rejoue de
    // toute façon pas la création de la personne selon le statut renvoyé
    // ici — un code d'erreur ne changerait rien côté base, juste du bruit.
    console.error("notify-new-person: échec de l'envoi email", await emailRes.text());
  }

  return new Response("ok", { status: 200 });
});
