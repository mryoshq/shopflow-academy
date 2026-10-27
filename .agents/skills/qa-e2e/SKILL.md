---
name: qa-e2e
description: Tester plateforme, éditeur enseignant, missions, authz, suivi, Playwright et 10 sessions; distinguer tests app et kit.
---

# qa-e2e

Inspect actual code/tests first. P0 test matrix: auth, 10 fake learners, teacher studio CRUD→preview NON SCORED→publish immutable→assign, student renders/answers/hints/scores, reload persistence, invalid content rejected, duplicate submit/concurrency, other user's grade forbidden (IDOR), teacher endpoints 403, IA off fallback. Playwright on Windows-like viewport 1366x768, tests API with pytest, frontend with Vitest; isolate test DB. Remote cloudflared test only AFTER public release authorized, plus n8n regression. No hidden answer in client. State precise PASS/FAIL/NOT RUN; never confuse doc kit CI with functional app tests.

## Sortie obligatoire
- Lot ID, fichiers modifiés, critères d'acceptation.
- Commandes de tests + statut **PASS/FAIL/NOT RUN** réel.
- Risques, demande d'accord humain éventuelle, lien issue/PR si disponible.
- Mise à jour `docs/PROGRESS.md` et `docs/HANDOFF.md`.
