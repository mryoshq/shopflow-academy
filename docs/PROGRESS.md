# Progression vérifiée du projet — à mettre à jour à chaque session IA

**Date : 2026-10-27 · État : P0-04 implémenté et vérifié localement sur `feat/p0-04-course-studio`, [PR #14](https://github.com/mryoshq/shopflow-academy/pull/14) ouverte. Les PR [#11](https://github.com/mryoshq/shopflow-academy/pull/11), [#12](https://github.com/mryoshq/shopflow-academy/pull/12) et [#13](https://github.com/mryoshq/shopflow-academy/pull/13) restent ouvertes, non mergées.**

## Livré et vérifiable dans le ZIP

- [x] CPS révisé **plateforme + studio d'abord, cours réels ensuite**.
- [x] Prompt Codex exhaustif import ZIP + connexion GitHub + implémentation et CI.
- [x] Runbook **Cloudflare Tunnel seulement** pour `shopflow.rapidfox.io`, sans perturber `n8n.rapidfox.io`.
- [x] Backlog P0 plateforme/P1 extensions/P2 cours ; neuf skills et conventions de handoff.
- [x] Monorepo React/FastAPI effectif construit et testé localement via Compose et suites unitaires.
- [x] Authentification, rôles et sessions locales ; seed fictif et import local séparé des dix adresses fournies, sans envoi.
- [x] Référentiel pédagogique, versions figées, projection étudiante, cohortes et assignations, sans cours définitifs.
- [x] Studio visuel enseignant et lecture initiale des cours attribués, sans corrigé ni notation.
- [ ] Lecteur interactif complet, correcteur, progression et dashboards.
- [ ] Déploiement public et vérification externe.

## Prochain lot réel

**P0-05** — lecteur étudiant générique et tableau de bord initial, seulement après revue de P0-04. Aucun cours définitif avant P2. Intégrer manuellement les PR dans l'ordre #11 → #12 → #13 → #14 après revue et CI ; ne pas fusionner automatiquement.

## Registre des sessions

| Date | Lot | Branche / commit / PR | Tests exécutés | Résultat / risques |
|---|---|---|---|---|
| 2026-10-27 | KIT-02 | ZIP local sans dépôt GitHub | `python3 scripts/verify_kit.py` PASS 0 erreurs ; `python3 -m unittest discover -s tests -v` PASS 4 tests | Kit documentaire validé ; aucune application / aucun conteneur testé |
| 2026-10-27 | P0-01 | `feat/p0-01-foundation` ; [issue #1](https://github.com/mryoshq/shopflow-academy/issues/1) ; [PR #11](https://github.com/mryoshq/shopflow-academy/pull/11) ; commit fonctionnel initial distant `7798c0f` et local `a312de8` (arbres identiques ; commits de suivi dans la PR) | `backend: python -m pytest -q` PASS 4 ; `frontend: npm run test -- --maxWorkers=1` PASS 2 ; `npm run build` PASS ; `docker compose config --quiet` PASS ; `docker compose up -d --build` PASS après correction du gateway ; `curl` /, /health/live, /health/ready, /api/v1/status PASS ; table `users` vérifiée dans PostgreSQL ; CI backend/frontend/Compose/kit PASS après correction du test de reprise du backlog | Aucun compte réel, aucun contenu de cours, aucune publication Cloudflare ; n8n inchangé. Git HTTPS bloqué, synchronisation distante par `gh api`. |
| 2026-10-27 | P0-02 | `feat/p0-02-auth-rbac` ; [issue #2](https://github.com/mryoshq/shopflow-academy/issues/2) ; [PR #12](https://github.com/mryoshq/shopflow-academy/pull/12) | `backend: pytest -q` PASS 10 ; `docker compose up -d --build` PASS ; seed local 11 comptes fictifs ; import local 10 comptes fournis sans envoi ; HTTP login/me/logout, rôles, isolation, CSRF PASS ; frontend build Docker PASS ; `scripts/verify_kit.py` PASS ; CI backend/frontend/Compose/kit PASS ; capture UI locale anonyme `outputs/p0-02-login.png`. Vitest sur ce Mac : worker expiré avant tests. | Identifiants dans `.local/` ignoré et mode 0600. Aucun changement Cloudflare/n8n. |
| 2026-10-27 | P0-03 | `feat/p0-03-curriculum-model` ; [issue #3](https://github.com/mryoshq/shopflow-academy/issues/3) ; [PR #13](https://github.com/mryoshq/shopflow-academy/pull/13) | `backend: pytest -q` PASS 13 ; `docker compose up -d --build` PASS, migration 0003 ; parcours HTTP local PostgreSQL brouillon→preview→publication→assignation→projection étudiant PASS ; `scripts/verify_kit.py` PASS ; CI backend/frontend/Compose/kit PASS. Une première requête `DISTINCT` sur JSON a échoué sur PostgreSQL, corrigée puis retestée PASS. | Tests avec comptes fictifs seulement ; dix comptes fournis toujours hors Git et non assignés. Aucun contenu réel ni publication Cloudflare. |
| 2026-10-27 | P0-04 + corrections de revue P0-03 | `feat/p0-04-course-studio` ; commit local `c0a82da`, arbre identique au commit distant `4820a6a` ; [issue #4](https://github.com/mryoshq/shopflow-academy/issues/4) ; [PR #14](https://github.com/mryoshq/shopflow-academy/pull/14) | `backend: python -m pytest -q` PASS 16 ; `frontend: npm run test -- --maxWorkers=1` PASS 4 ; `npm run build` PASS ; `docker compose config --quiet` PASS ; `docker compose up -d --build --wait backend frontend gateway` PASS ; `frontend: npm run test:e2e` sur Chrome local PASS 1, parcours création→validation invalide refusée→aperçu non noté→publication→attribution→lecture étudiante sans corrigé ; `python3 scripts/verify_kit.py` PASS 0 erreur documentaire ; connexion du compte enseignant réel local PASS, mode 0600 ; CI PR #14 backend/frontend/Compose/Playwright/kit PASS. | Seuls les comptes fictifs ont été utilisés pour les tests et l'attribution ; aucun e-mail, aucun compte étudiant existant modifié, aucun changement Cloudflare/n8n, aucune publication de l'application. |
