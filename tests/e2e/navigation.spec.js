// Tests e2e de navigation, dans un vrai Chromium piloté par Playwright.
// Périmètre volontaire : uniquement la navigation UI (drawer, liens,
// sélecteur de langue) — pas de création/modification/suppression
// d'évènement, ce qui écrirait réellement dans Supabase (pas de projet de
// test séparé). `arc-diagram.html` fait des lectures Supabase réelles
// (listPeople/listEvents, en lecture seule) : ces tests nécessitent donc un
// accès réseau sortant et échoueront si Supabase est injoignable.
const { test, expect } = require("@playwright/test");

// Chaque run Playwright démarre avec un `localStorage` vide (nouveau
// contexte navigateur) : l'écran "qui es-tu" (plein écran, pas de bouton
// fermer, cf. chart.js#showWhoAreYouIfNeeded) s'affiche donc avant qu'on
// puisse atteindre le reste de la page (il intercepte les clics sur
// #drawer-toggle etc.). On le traverse en choisissant la première personne
// de la vraie liste Supabase (peu importe laquelle pour ces tests de
// navigation) plutôt que d'injecter un id dans localStorage à l'avance
// (dépendrait d'un id réel connu d'avance). Si le profil choisi est
// incomplet (pas d'email), la complétion s'enchaîne automatiquement — sans
// lien avec ce que ces tests veulent vérifier, donc on l'annule.
async function dismissWhoAreYou(page) {
  const whoAreYou = page.locator("#whoareyou-modal");
  if (!(await whoAreYou.isVisible())) return;
  await page.click("#whoareyou-list .legend-item >> nth=0");
  const personModal = page.locator("#person-modal");
  if (await personModal.isVisible()) await page.click("#person-cancel");
}

test.describe("guide.html — navigation et langue", () => {
  test("se charge en français par défaut, sans erreur console", async ({ page }) => {
    const consoleErrors = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

    await page.goto("/guide.html");
    await expect(page.locator("h1")).toHaveText("Mode d'emploi");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    expect(consoleErrors).toEqual([]);
  });

  test("le sélecteur EN traduit le texte et le choix survit à un reload", async ({ page }) => {
    await page.goto("/guide.html");
    await page.click('[data-lang-btn="en"]');
    await expect(page.locator("h1")).toHaveText("How it works");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.reload();
    await expect(page.locator("h1")).toHaveText("How it works");
  });

  test("le lien retour ramène bien vers arc-diagram.html", async ({ page }) => {
    await page.goto("/guide.html");
    await page.click(".guide-back");
    await expect(page).toHaveURL(/\/arc-diagram\.html$/);
  });
});

test.describe("arc-diagram.html — drawer et lien vers le guide", () => {
  test("le bouton ☰ ouvre le drawer, qui contient un lien vers le guide", async ({ page }) => {
    await page.goto("/arc-diagram.html");
    await expect(page.locator("#load-status")).not.toHaveClass(/visible/, { timeout: 15000 });
    await dismissWhoAreYou(page);

    await page.click("#drawer-toggle");
    await expect(page.locator("#sidebar")).toHaveClass(/open/);

    const guideLink = page.locator("#sidebar-guide-link");
    await expect(guideLink).toBeVisible();
    await expect(guideLink).toHaveAttribute("href", "guide.html");
  });

  test("cliquer sur le lien Guide dans le drawer navigue vers guide.html", async ({ page }) => {
    await page.goto("/arc-diagram.html");
    await expect(page.locator("#load-status")).not.toHaveClass(/visible/, { timeout: 15000 });
    await dismissWhoAreYou(page);

    await page.click("#drawer-toggle");
    await page.click("#sidebar-guide-link");

    await expect(page).toHaveURL(/\/guide\.html$/);
    await expect(page.locator("h1")).toHaveText("Mode d'emploi");
  });

  test("charge les données (personnes/évènements) sans passer en état d'erreur", async ({ page }) => {
    await page.goto("/arc-diagram.html");
    await expect(page.locator("#load-status")).not.toHaveClass(/visible/, { timeout: 15000 });
    await expect(page.locator("#load-status")).not.toHaveClass(/error/);
    await expect(page.locator("svg#chart .axis-line")).toHaveCount(1);
  });
});

test.describe("arc-diagram.html — ajout de personne (navigation seule)", () => {
  // Volontairement pas de clic sur #person-submit : ça créerait une vraie
  // ligne dans la table `people` de la vraie base Supabase (pas de projet
  // de test séparé, cf. contrainte déjà en place pour les évènements
  // en tête de fichier).
  test("le bouton '+ Ajouter une personne' ouvre le formulaire en mode création", async ({ page }) => {
    await page.goto("/arc-diagram.html");
    await expect(page.locator("#load-status")).not.toHaveClass(/visible/, { timeout: 15000 });
    await dismissWhoAreYou(page);

    await page.click("#drawer-toggle");
    await page.click("#add-person-btn");

    await expect(page.locator("#person-modal")).not.toHaveClass(/hidden/);
    await expect(page.locator("#person-nom")).toBeVisible();
    await expect(page.locator("#person-nom")).toBeEnabled();
    await expect(page.locator("#person-nom")).toHaveValue("");
    await expect(page.locator("#person-email")).toBeVisible();

    await page.click("#person-cancel");
    await expect(page.locator("#person-modal")).toHaveClass(/hidden/);
  });
});
