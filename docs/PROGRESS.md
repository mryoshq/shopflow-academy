# Progression vérifiée du projet — à mettre à jour à chaque session IA

**Date : 2026-10-27 · État : P0-01 implémenté et vérifié localement ; CI applicative à confirmer sur PR. Branche locale `feat/p0-01-foundation`.**

## Livré et vérifiable dans le ZIP

- [x] CPS révisé **plateforme + studio d'abord, cours réels ensuite**.
- [x] Prompt Codex exhaustif import ZIP + connexion GitHub + implémentation et CI.
- [x] Runbook **Cloudflare Tunnel seulement** pour `shopflow.rapidfox.io`, sans perturber `n8n.rapidfox.io`.
- [x] Backlog P0 plateforme/P1 extensions/P2 cours ; neuf skills et conventions de handoff.
- [x] Monorepo React/FastAPI effectif construit et testé localement via Compose et suites unitaires.
- [ ] Authentification, studio, correcteur, dashboards.
- [ ] Déploiement public et vérification externe.

## Prochain lot réel

**P0-02** — authentification, rôles et comptes fictifs après validation de la PR P0-01. Le studio no-code reste P0-04 ; contenus définitifs en P2.

## Registre des sessions

| Date | Lot | Branche / commit / PR | Tests exécutés | Résultat / risques |
|---|---|---|---|---|
| 2026-10-27 | KIT-02 | ZIP local sans dépôt GitHub | `python3 scripts/verify_kit.py` PASS 0 erreurs ; `python3 -m unittest discover -s tests -v` PASS 4 tests | Kit documentaire validé ; aucune application / aucun conteneur testé |
| 2026-10-27 | P0-01 | `feat/p0-01-foundation` ; [issue #1](https://github.com/mryoshq/shopflow-academy/issues/1) ; PR en préparation | `backend: python -m pytest -q` PASS 4 ; `frontend: npm run test -- --maxWorkers=1` PASS 2 ; `npm run build` PASS ; `docker compose config --quiet` PASS ; `docker compose up -d --build` PASS après correction du gateway ; `curl` /, /health/live, /health/ready, /api/v1/status PASS ; table `users` vérifiée dans PostgreSQL | Aucun compte réel, aucun contenu de cours, aucune publication Cloudflare ; n8n inchangé. |
