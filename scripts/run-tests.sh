#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Arcmates — lance les deux suites de tests (unitaire+intégration jsdom, puis
# e2e Playwright) et met à jour les lignes de résumé "Dernière exécution"
# dans tests/campagne-de-tests.md (date, pass/fail, durée).
#
# Ne touche PAS aux tableaux détaillés (liste des tests, couverture par
# fichier/fonction, §5 "ce que ça ne couvre pas") : ces parties documentent
# des choix/analyses qui ne se déduisent pas de la seule sortie des tests et
# doivent rester une relecture manuelle si la structure des tests change
# (nouveau fichier de test, nouvelle fonction couverte, etc.).
#
# Usage : ./scripts/run-tests.sh
# ---------------------------------------------------------------------------
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MD_FILE="$ROOT_DIR/tests/campagne-de-tests.md"
cd "$ROOT_DIR"

UNIT_LOG="$(mktemp)"
E2E_LOG="$(mktemp)"
trap 'rm -f "$UNIT_LOG" "$E2E_LOG"' EXIT

echo "== 1/2 — npm test (unitaire + intégration jsdom) =="
npm test 2>&1 | tee "$UNIT_LOG"
UNIT_EXIT=${PIPESTATUS[0]}

echo
echo "== 2/2 — npm run test:e2e (navigation, Chromium) =="
npm run test:e2e 2>&1 | tee "$E2E_LOG"
E2E_EXIT=${PIPESTATUS[0]}

# --- Parse le résumé de `node --test` (bloc "ℹ tests N" / "ℹ pass N" / ...) ---
UNIT_TESTS=$(grep -oE '^ℹ tests [0-9]+' "$UNIT_LOG" | tail -1 | grep -oE '[0-9]+$')
UNIT_PASS=$(grep -oE '^ℹ pass [0-9]+' "$UNIT_LOG" | tail -1 | grep -oE '[0-9]+$')
UNIT_FAIL=$(grep -oE '^ℹ fail [0-9]+' "$UNIT_LOG" | tail -1 | grep -oE '[0-9]+$')
UNIT_SKIP=$(grep -oE '^ℹ skipped [0-9]+' "$UNIT_LOG" | tail -1 | grep -oE '[0-9]+$')
UNIT_DURATION_MS=$(grep -oE '^ℹ duration_ms [0-9.]+' "$UNIT_LOG" | tail -1 | grep -oE '[0-9.]+$')

if [[ -z "${UNIT_TESTS:-}" ]]; then
  echo "⚠️  Impossible de parser le résumé de 'npm test' — campagne-de-tests.md non mis à jour pour cette suite." >&2
else
  UNIT_DURATION_S=$(awk -v ms="$UNIT_DURATION_MS" 'BEGIN { printf "%.1f", ms / 1000 }')
  UNIT_ICON="🟢"; [[ "$UNIT_FAIL" != "0" ]] && UNIT_ICON="🔴"
  UNIT_LINE="**${UNIT_ICON} ${UNIT_PASS} / ${UNIT_TESTS} tests passent, ${UNIT_FAIL} échec, ${UNIT_SKIP} skip — durée totale ≈ ${UNIT_DURATION_S} s.**"
fi

# --- Parse le résumé de Playwright (ex. "6 passed (10.7s)" / "1 failed, 5 passed (12s)") ---
E2E_PASSED=$(grep -oE '[0-9]+ passed' "$E2E_LOG" | tail -1 | grep -oE '^[0-9]+')
E2E_FAILED=$(grep -oE '[0-9]+ failed' "$E2E_LOG" | tail -1 | grep -oE '^[0-9]+')
E2E_DURATION=$(grep -oE '\([0-9.]+m?s\)' "$E2E_LOG" | tail -1 | tr -d '()' | sed -E 's/([0-9.]+)(m?s)/\1 \2/')
E2E_PASSED=${E2E_PASSED:-0}
E2E_FAILED=${E2E_FAILED:-0}
E2E_TOTAL=$((E2E_PASSED + E2E_FAILED))

if [[ -z "$E2E_DURATION" || "$E2E_TOTAL" == "0" ]]; then
  echo "⚠️  Impossible de parser le résumé de 'npm run test:e2e' — campagne-de-tests.md non mis à jour pour cette suite." >&2
else
  E2E_ICON="🟢"; [[ "$E2E_FAILED" != "0" ]] && E2E_ICON="🔴"
  E2E_LINE="**${E2E_ICON} ${E2E_PASSED} / ${E2E_TOTAL} tests passent — durée totale ≈ ${E2E_DURATION} (4 workers, Chromium headless).**"
fi

TODAY=$(date +%F)

# --- Applique les remplacements dans le markdown (uniquement les lignes de résumé + la date d'en-tête) ---
python3 - "$MD_FILE" "$TODAY" "${UNIT_LINE:-}" "${E2E_LINE:-}" <<'PYEOF'
import re, sys

md_path, today, unit_line, e2e_line = sys.argv[1:5]

with open(md_path, encoding="utf-8") as f:
    content = f.read()

content = re.sub(r"Généré le \d{4}-\d{2}-\d{2}", f"Généré le {today}", content, count=1)

if unit_line:
    content = re.sub(
        r"\*\*[🟢🔴] \d+ / \d+ tests passent, \d+ échec, \d+ skip — durée totale ≈ [0-9.]+ s\.\*\*",
        unit_line,
        content,
        count=1,
    )

if e2e_line:
    content = re.sub(
        r"\*\*[🟢🔴] \d+ / \d+ tests passent — durée totale ≈ [0-9.]+\s*m?s \(4 workers, Chromium headless\)\.\*\*",
        e2e_line,
        content,
        count=1,
    )

with open(md_path, "w", encoding="utf-8") as f:
    f.write(content)
PYEOF

echo
echo "== Résumé =="
[[ -n "${UNIT_LINE:-}" ]] && echo "Unitaire/intégration : $UNIT_LINE"
[[ -n "${E2E_LINE:-}" ]] && echo "E2E                   : $E2E_LINE"
echo "tests/campagne-de-tests.md mis à jour (date + lignes de résumé uniquement)."
echo "⚠️  Les tableaux détaillés (liste des tests, couverture, §5) restent à relire à la main si la structure des tests a changé."

if [[ "$UNIT_EXIT" != "0" || "$E2E_EXIT" != "0" ]]; then
  echo
  echo "⚠️  Au moins une suite a échoué (unit exit=$UNIT_EXIT, e2e exit=$E2E_EXIT)."
  exit 1
fi
