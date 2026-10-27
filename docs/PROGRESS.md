# Progression vérifiée du projet — à mettre à jour à chaque session IA

**Date : 2026-10-27 · État : P0-02 implémenté et vérifié localement sur `feat/p0-02-auth-rbac`, revue distante en préparation. P0-01 reste sur [PR #11](https://github.com/mryoshq/shopflow-academy/pull/11), non mergée.**

## Livré et vérifiable dans le ZIP

- [x] CPS révisé **plateforme + studio d'abord, cours réels ensuite**.
- [x] Prompt Codex exhaustif import ZIP + connexion GitHub + implémentation et CI.
- [x] Runbook **Cloudflare Tunnel seulement** pour `shopflow.rapidfox.io`, sans perturber `n8n.rapidfox.io`.
- [x] Backlog P0 plateforme/P1 extensions/P2 cours ; neuf skills et conventions de handoff.
- [x] Monorepo React/FastAPI effectif construit et testé localement via Compose et suites unitaires.
- [x] Authentification, rôles et sessions locales ; seed fictif et import local séparé des dix adresses fournies, sans envoi.
- [ ] Studio, correcteur, dashboards.
- [ ] Déploiement public et vérification externe.

## Prochain lot réel

**P0-03** — référentiel pédagogique sans contenu définitif, puis studio no-code en P0-04. Les PR P0-01 et P0-02 restent ouvertes et non mergées ; P0-02 est empilée sur P0-01.

## Registre des sessions

| Date | Lot | Branche / commit / PR | Tests exécutés | Résultat / risques |
|---|---|---|---|---|
| 2026-10-27 | KIT-02 | ZIP local sans dépôt GitHub | `python3 scripts/verify_kit.py` PASS 0 erreurs ; `python3 -m unittest discover -s tests -v` PASS 4 tests | Kit documentaire validé ; aucune application / aucun conteneur testé |
| 2026-10-27 | P0-01 | `feat/p0-01-foundation` ; [issue #1](https://github.com/mryoshq/shopflow-academy/issues/1) ; [PR #11](https://github.com/mryoshq/shopflow-academy/pull/11) ; commit fonctionnel initial distant `7798c0f` et local `a312de8` (arbres identiques ; commits de suivi dans la PR) | `backend: python -m pytest -q` PASS 4 ; `frontend: npm run test -- --maxWorkers=1` PASS 2 ; `npm run build` PASS ; `docker compose config --quiet` PASS ; `docker compose up -d --build` PASS après correction du gateway ; `curl` /, /health/live, /health/ready, /api/v1/status PASS ; table `users` vérifiée dans PostgreSQL ; CI backend/frontend/Compose/kit PASS après correction du test de reprise du backlog | Aucun compte réel, aucun contenu de cours, aucune publication Cloudflare ; n8n inchangé. Git HTTPS bloqué, synchronisation distante par `gh api`. |
| 2026-10-27 | P0-02 | `feat/p0-02-auth-rbac` ; [issue #2](https://github.com/mryoshq/shopflow-academy/issues/2) ; PR en préparation | `backend: pytest -q` PASS 10 ; `docker compose up -d --build` PASS ; seed local 11 comptes fictifs ; import local 10 comptes fournis sans envoi ; HTTP login/me/logout, rôles, isolation, CSRF PASS ; frontend build Docker PASS ; Vitest local en cours | Identifiants dans `.local/` ignoré et mode 0600. Aucun changement Cloudflare/n8n. |
