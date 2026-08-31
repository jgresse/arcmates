// Serveur statique minimal, sans dépendance, utilisé uniquement par
// playwright.config.js pour servir les fichiers du repo (arc-diagram.html,
// guide.html, style.css, *.js) pendant les tests e2e — pas d'équivalent
// "npm run dev" dans ce projet sans build (cf. CLAUDE.md), donc pas de
// serveur à réutiliser tel quel.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const PORT = process.env.E2E_PORT || 4321;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".sql": "text/plain; charset=utf-8"
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.join(ROOT, urlPath === "/" ? "/arc-diagram.html" : urlPath);

  // Ne jamais servir en dehors du repo (pas de "../../../etc/passwd").
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`e2e static server listening on http://localhost:${PORT}`);
});
