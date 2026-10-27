# Progression vérifiée du projet — à mettre à jour à chaque session IA

**Date : 2026-10-27 · État : P0-03 implémenté et vérifié localement sur `feat/p0-03-curriculum-model`, PR en préparation. P0-02 reste sur [PR #12](https://github.com/mryoshq/shopflow-academy/pull/12), P0-01 sur [PR #11](https://github.com/mryoshq/shopflow-academy/pull/11), non mergées.**

## Livré et vérifiable dans le ZIP

- [x] CPS révisé **plateforme + studio d'abord, cours réels ensuite**.
- [x] Prompt Codex exhaustif import ZIP + connexion GitHub + implémentation et CI.
- [x] Runbook **Cloudflare Tunnel seulement** pour `shopflow.rapidfox.io`, sans perturber `n8n.rapidfox.io`.
- [x] Backlog P0 plateforme/P1 extensions/P2 cours ; neuf skills et conventions de handoff.
- [x] Monorepo React/FastAPI effectif construit et testé localement via Compose et suites unitaires.
- [x] Authentification, rôles et sessions locales ; seed fictif et import local séparé des dix adresses fournies, sans envoi.
- [x] Référentiel pédagogique, versions figées, projection étudiante, cohortes et assignations, sans cours définitifs.
- [ ] Studio visuel, correcteur, dashboards.
- [ ] Déploiement public et vérification externe.

## Prochain lot réel

**P0-04** — studio no-code dans le navigateur sur le référentiel P0-03. Les PR sont empilées et restent ouvertes, non mergées.

## Registre des sessions

| Date | Lot | Branche / commit / PR | Tests exécutés | Résultat / risques |
|---|---|---|---|---|
| 2026-10-27 | KIT-02 | ZIP local sans dépôt GitHub | `python3 scripts/verify_kit.py` PASS 0 erreurs ; `python3 -m unittest discover -s tests -v` PASS 4 tests | Kit documentaire validé ; aucune application / aucun conteneur testé |
| 2026-10-27 | P0-01 | `feat/p0-01-foundation` ; [issue #1](https://github.com/mryoshq/shopflow-academy/issues/1) ; [PR #11](https://github.com/mryoshq/shopflow-academy/pull/11) ; commit fonctionnel initial distant `7798c0f` et local `a312de8` (arbres identiques ; commits de suivi dans la PR) | `backend: python -m pytest -q` PASS 4 ; `frontend: npm run test -- --maxWorkers=1` PASS 2 ; `npm run build` PASS ; `docker compose config --quiet` PASS ; `docker compose up -d --build` PASS après correction du gateway ; `curl` /, /health/live, /health/ready, /api/v1/status PASS ; table `users` vérifiée dans PostgreSQL ; CI backend/frontend/Compose/kit PASS après correction du test de reprise du backlog | Aucun compte réel, aucun contenu de cours, aucune publication Cloudflare ; n8n inchangé. Git HTTPS bloqué, synchronisation distante par `gh api`. |
| 2026-10-27 | P0-02 | `feat/p0-02-auth-rbac` ; [issue #2](https://github.com/mryoshq/shopflow-academy/issues/2) ; [PR #12](https://github.com/mryoshq/shopflow-academy/pull/12) | `backend: pytest -q` PASS 10 ; `docker compose up -d --build` PASS ; seed local 11 comptes fictifs ; import local 10 comptes fournis sans envoi ; HTTP login/me/logout, rôles, isolation, CSRF PASS ; frontend build Docker PASS ; `scripts/verify_kit.py` PASS ; CI backend/frontend/Compose/kit PASS ; capture UI locale anonyme `outputs/p0-02-login.png`. Vitest sur ce Mac : worker expiré avant tests. | Identifiants dans `.local/` ignoré et mode 0600. Aucun changement Cloudflare/n8n. |
| 2026-10-27 | P0-03 | `feat/p0-03-curriculum-model` ; [issue #3](https://github.com/mryoshq/shopflow-academy/issues/3) ; PR en préparation | `backend: pytest -q` PASS 13 ; `docker compose up -d --build` PASS, migration 0003 ; parcours HTTP local PostgreSQL brouillon→preview→publication→assignation→projection étudiant PASS ; `scripts/verify_kit.py` PASS. Une première requête `DISTINCT` sur JSON a échoué sur PostgreSQL, corrigée puis retestée PASS. | Tests avec comptes fictifs seulement ; dix comptes fournis toujours hors Git et non assignés. Aucun contenu réel ni publication Cloudflare. |
