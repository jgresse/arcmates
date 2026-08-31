// Config Playwright — tests e2e de navigation dans un vrai navigateur
// (tests/e2e/), séparés de la suite `node --test` (tests/*.test.js) qui
// couvre la logique pure. Lancer avec `npm run test:e2e`.
//
// Périmètre volontairement limité à la navigation UI (drawer, liens,
// sélecteur de langue) — pas de création/modification/suppression
// d'évènement, ce qui écrirait réellement dans la base Supabase de prod
// (pas de projet Supabase de test séparé pour l'instant).
const { defineConfig, devices } = require("@playwright/test");

const PORT = process.env.E2E_PORT || 4321;

module.exports = defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } }
  ],
  webServer: {
    command: `node tests/e2e/static-server.js`,
    url: `http://localhost:${PORT}/guide.html`,
    reuseExistingServer: !process.env.CI,
    env: { E2E_PORT: String(PORT) }
  }
});
