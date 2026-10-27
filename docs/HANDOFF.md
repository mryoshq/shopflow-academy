# HANDOFF — reprise Codex entre sessions, agents et modèles

## État au 27/10/2026 — P0-02

Kit documentaire **v2.0** importé sans perte. P0-01 fournit React/Chakra v3, FastAPI, Alembic, PostgreSQL, Nginx et Compose local. P0-02 ajoute l'authentification, les rôles et les sessions. Le studio de cours reste P0-04 ; les contenus définitifs restent P2. Lire le prompt exhaustif et les sources de vérité au début de la reprise.

## Contexte à préserver impérativement

- Domaine cible `shopflow.rapidfox.io` ; un **n8n existant** fonctionne déjà sur `n8n.rapidfox.io` avec Cloudflare. Aucune opération sur n8n ni Cloudflare/DNS sans accord. Une seule stratégie Mac Compose + Tunnel.
- GitHub : dépôt privé [mryoshq/shopflow-academy](https://github.com/mryoshq/shopflow-academy), `main` contient le kit complet, issues P0 [#1 à #10](https://github.com/mryoshq/shopflow-academy/issues). Le transport Git HTTPS s'est bloqué depuis ce Mac ; `gh api` fonctionne et a servi à importer le kit. Ne pas force-push.
- 10 étudiants, 1 distant ; sans code obligatoire ; assistant IA optionnel ; budget hébergement max 50 €/mois.

## Routine début de session

`AGENTS.md` → `docs/CPS.md` → `docs/BACKLOG.md` → `docs/PROGRESS.md` → `git status` / PR → tests existants. Ne jamais inventer les travaux de la session précédente.

## Preuves et reprise

- **Lot / issue / branche / PR :** P0-01 ; [issue #1](https://github.com/mryoshq/shopflow-academy/issues/1) ; `feat/p0-01-foundation` ; [PR #11](https://github.com/mryoshq/shopflow-academy/pull/11), ouverte et non mergée ; commit fonctionnel initial distant `7798c0f`, local `a312de8` (commits de suivi dans la PR). Les arbres Git correspondent ; l'historique diffère parce que le transport Git HTTPS s'est bloqué et que `gh api` a importé le contenu distant. Rétablir `git fetch` avant de poursuivre un workflow Git habituel ; ne pas force-push.
- **Implémenté :** `backend/` (API health/status, schéma `users`, migration et tests), `frontend/` (page Academy et tests Chakra v3), `gateway/` (Nginx), `compose.yaml` (gateway loopback, backend, frontend, Postgres, MySQL facultatif), Makefile, script de génération de `.env`, workflow applicatif.
- **Tests :** `python -m pytest -q` dans `backend` PASS 4 ; `npm run test -- --maxWorkers=1` dans `frontend` PASS 2 ; `npm run build` PASS ; `docker compose config --quiet` PASS ; `docker compose up -d --build` PASS après correction d'un bind mount Nginx ; `curl` sur `/`, `/health/live`, `/health/ready`, `/api/v1/status` PASS ; table `users` présente dans PostgreSQL. GitHub Actions [PR #11](https://github.com/mryoshq/shopflow-academy/pull/11) backend/frontend/Compose/kit PASS. Playwright, RBAC, charge et restauration NOT RUN car prévus dans les lots suivants.
- **Sécurité :** aucun compte étudiant, secret ou corrigé dans Git. `.env` local généré et ignoré. Uniquement gateway sur `127.0.0.1:3080`; Postgres interne. Auth/RBAC reste P0-02.
- **ADR et tunnel :** ADR-0006. NS publics `aria.ns.cloudflare.com` et `jobs.ns.cloudflare.com` observés en lecture seule ; un processus `cloudflared` hôte et un conteneur n8n existent sur ce Mac, sans preuve que ce processus dessert le hostname n8n. Une commande d'inventaire a affiché un jeton `cloudflared` dans sa sortie d'outil ; ne jamais le copier dans Git ou les réponses. Rotation manuelle requise avant toute publication. Aucun changement Cloudflare/DNS/n8n.
- **P0-02 :** [PR #12](https://github.com/mryoshq/shopflow-academy/pull/12) sur branche `feat/p0-02-auth-rbac` empilée sur P0-01 ; sessions serveur à hash stocké, Argon2, cookies/CSRF, rate limit, rôles et contrôle propriétaire. Migration `0002_auth`; interface Chakra v3. Tests backend 10 PASS, Compose local build/health PASS, HTTP login/me/logout, 403 inter-rôle et inter-compte, CSRF PASS. Seed local 11 comptes fictifs ; les dix adresses fournies par le responsable sont importées séparément en local, sans message. `.local/student-emails.txt`, `.local/student-credentials.json` et `.local/demo-credentials.json` sont ignorés par Git et réservés à l'utilisateur local. Ne jamais imprimer ni committer adresses ou identifiants. Vitest local a expiré au démarrage du worker ; CI distante à vérifier avant de considérer la PR prête.
- **Tâche suivante :** finaliser la PR P0-02 et ses checks, puis P0-03 (référentiel sans cours réels) sur une branche empilée si les PR précédentes restent ouvertes.

Trois tentatives de réparation maximum par **même** échec avant de documenter le blocage ; aucune boucle IA infinie ni publication non autorisée.
