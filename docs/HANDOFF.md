# HANDOFF — reprise Codex entre sessions, agents et modèles

## État au 27/10/2026 — P0-01

Kit documentaire **v2.0** importé sans perte. P0-01 fournit maintenant React/Chakra v3, FastAPI, Alembic, PostgreSQL, Nginx et Compose local. Le studio de cours reste P0-04 ; les contenus définitifs restent P2. Lire le prompt exhaustif et les sources de vérité au début de la reprise.

## Contexte à préserver impérativement

- Domaine cible `shopflow.rapidfox.io` ; un **n8n existant** fonctionne déjà sur `n8n.rapidfox.io` avec Cloudflare. Aucune opération sur n8n ni Cloudflare/DNS sans accord. Une seule stratégie Mac Compose + Tunnel.
- GitHub : dépôt privé [mryoshq/shopflow-academy](https://github.com/mryoshq/shopflow-academy), `main` contient le kit complet, issues P0 [#1 à #10](https://github.com/mryoshq/shopflow-academy/issues). Le transport Git HTTPS s'est bloqué depuis ce Mac ; `gh api` fonctionne et a servi à importer le kit. Ne pas force-push.
- 10 étudiants, 1 distant ; sans code obligatoire ; assistant IA optionnel ; budget hébergement max 50 €/mois.

## Routine début de session

`AGENTS.md` → `docs/CPS.md` → `docs/BACKLOG.md` → `docs/PROGRESS.md` → `git status` / PR → tests existants. Ne jamais inventer les travaux de la session précédente.

## Preuves et reprise

- **Lot / issue / branche / PR :** P0-01 ; [issue #1](https://github.com/mryoshq/shopflow-academy/issues/1) ; `feat/p0-01-foundation` ; PR en préparation.
- **Implémenté :** `backend/` (API health/status, schéma `users`, migration et tests), `frontend/` (page Academy et tests Chakra v3), `gateway/` (Nginx), `compose.yaml` (gateway loopback, backend, frontend, Postgres, MySQL facultatif), Makefile, script de génération de `.env`, workflow applicatif.
- **Tests :** `python -m pytest -q` dans `backend` PASS 4 ; `npm run test -- --maxWorkers=1` dans `frontend` PASS 2 ; `npm run build` PASS ; `docker compose config --quiet` PASS ; `docker compose up -d --build` PASS après correction d'un bind mount Nginx ; `curl` sur `/`, `/health/live`, `/health/ready`, `/api/v1/status` PASS ; table `users` présente dans PostgreSQL. Playwright, RBAC, charge et restauration NOT RUN car prévus dans les lots suivants. CI applicative distante en attente de la PR.
- **Sécurité :** aucun compte étudiant, secret ou corrigé dans Git. `.env` local généré et ignoré. Uniquement gateway sur `127.0.0.1:3080`; Postgres interne. Auth/RBAC reste P0-02.
- **ADR et tunnel :** ADR-0006. NS publics `aria.ns.cloudflare.com` et `jobs.ns.cloudflare.com` observés en lecture seule ; emplacement et mode du tunnel n8n inconnus. Aucun changement Cloudflare/DNS/n8n. Aucun accord de publication demandé à ce stade.
- **Tâche suivante unique :** terminer la PR et sa CI P0-01 si nécessaire, puis implémenter P0-02 (authentification, sessions, RBAC et 10 profils fictifs + enseignant) sans créer de comptes réels.

Trois tentatives de réparation maximum par **même** échec avant de documenter le blocage ; aucune boucle IA infinie ni publication non autorisée.
