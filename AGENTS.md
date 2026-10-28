# AGENTS.md — Règles persistantes Codex pour ShopFlow Academy

## Mission et ordre des priorités

Développer une **plateforme pédagogique complète et durable**, **par incréments testés**, pas un prototype à jeter. **Construire d'abord la plateforme et le studio d'auteur no-code ; intégrer les cours définitifs ensuite**. À ce stade, les activités ShopFlow servent de *démonstration fonctionnelle*, non de programme final. Le suivi dans Git est obligatoire pour pouvoir changer de modèle ou reprendre après interruption.

**Déploiement public unique :** Docker Compose sur **Mac** + **Cloudflare Tunnel** vers `https://shopflow.rapidfox.io`. `n8n.rapidfox.io` existe déjà avec Cloudflare et doit rester inchangé. VPS, Kubernetes, nameserver migration et options alternatives sont hors périmètre, sauf décision future explicite dans un nouvel ADR.

## Avant chaque session

1. Lire `README.md` puis `docs/CPS.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/PROGRESS.md`, `docs/HANDOFF.md`, et ADRs. Pour initialiser depuis le ZIP lire aussi `docs/PROMPT-CODEX-IMPORT-GITHUB-CLOUDFLARE.md`.
2. Vérifier `git status`, branche, commits, issues/PR et CI avant de modifier les fichiers.
3. Choisir un lot non terminé dans `docs/BACKLOG.md`; vérifier ses critères d'acceptation et les dépendances. Le premier est P0-01.
4. Repérer les secrets, données réelles et config n8n existante : **ne jamais les écraser**.

## Contrat de développement

1. Énoncer une intention de lot et les fichiers envisagés; écrire le test ou les critères vérifiables.
2. Implémenter verticalement modèle + API + UI + tests lorsque le lot l'exige, avec structure modulaire claire.
3. Vérifier de vrais résultats (`pytest`, `Vitest`, `Playwright`, Compose, migrations selon existant), jamais déclarer PASS sans exécution.
4. Jusqu'à 3 cycles de réparation pour un blocage identique ; au-delà journaliser la reproduction, le test échoué et la prochaine action.
5. Mettre à jour `docs/PROGRESS.md` et `docs/HANDOFF.md` après chaque session ou PR. Lier issue/commit/PR, noter les résultats exacts.
6. Branches `feat/...` et PR sur GitHub, sans merge automatique ni déploiement public sans validation humaine. Ne pas faire de force-push/suppression/achat.
7. Si une étape requiert autorisation humaine (publication du tunnel, modification DNS, opérations destructives), préparer le nécessaire puis demander un accord ciblé.

## Priorités fonctionnelles non négociables

- **10 étudiants**, 9 présentiels Windows + 1 distanciel Windows ; enseignant Mac, navigateur seul, pas de setup étudiant.
- **Studio de cours P0** : créer/éditer, prévisualiser **sans points**, publier **version immuable**, assigner et archiver, importer/exporter JSON typé, vérifier les règles de score. Le professeur ne doit pas modifier React pour créer une mission.
- **Parcours principal sans code** : QCM, choix guidés, interprétations, graphiques, simulations contrôlées. Bonus SQL/Python facultatifs, isolés et sans impact sur la note fondamentale.
- **Missions serveur** : projections étudiantes expurgées des corrigés ; notation déterministe, idempotente, versionnée et auditable. Aucun score arbitré par LLM.
- **Enseignant** : suivi de dix élèves, sessions, ouvertures/pauses, export et interventions auditables ; pas de classement public imposé.
- **IA facultative** : provider `none` par défaut, indices statiques hors ligne ; OpenRouter via variables serveur ultérieures ; si IA tombe, le cours continue.
- **Contenu des cours** : 28 octobre = 25 % SQL ≤90 min, 75 % ingestion/qualité Python, fenêtres souples ~15 min ; les contenus finaux **attendent la phase P2**, et reprendront les fichiers fournis par le propriétaire.
- UI française adaptée au Maroc (DH, données et villes fictives, darija optionnelle), claire et accessible.

## Sécurité et confidentialité

- Ne jamais committer `.env`, API keys, secrets Cloudflare, credentials, copies privées, données d'étudiants réels, barème/corrigés dans le client.
- Auth côté serveur et permissions par objet (IDOR), CSRF si cookies, rate limits, validation stricte des imports JSON, sanitation HTML/Markdown.
- DB plateforme PostgreSQL isolée de MySQL labs ; SQL libre bonus lecture seule + parsing AST, timeout, quotas, revues ; Python libre **jamais exécuté sur Mac ni dans le processus FastAPI**.
- Aucun service DB exposé sur Internet ; gateway lié au loopback Mac. `localhost` d'un conteneur `cloudflared` n'est pas le Mac.
- **NE PAS TOUCHER `n8n.rapidfox.io`** ni aux DNS, tunnels, tokens, routes et volumes existants sans accord explicite. Avant ajout, identifier où tourne cloudflared et où tourne ShopFlow : même Mac → route supplémentaire ; Mac différent → tunnel Academy dédié.
- Ne jamais lancer automatiquement de déploiement, publication Cloudflare, achat ou opérations destructives.

## Stack et responsabilités

React + TypeScript + Vite, FastAPI + SQLAlchemy + Alembic, PostgreSQL plateforme, MySQL optionnel labo, Docker Compose Mac, gateway HTTP local `127.0.0.1:3080` proposé, Cloudflare Tunnel public, pytest/Vitest/Playwright. Monorepo modulaire, pas de Kubernetes ni de microservices inutiles. Première livraison locale testée avant exposition extérieure.

## Skills du dépôt

`$academy-architect` · `$mission-author` · `$curriculum-mapper` · `$grading-engine` · `$ui-ux` · `$qa-e2e` · `$deploy-ops` · `$session-handoff` · `$bounded-agent-loop` · `$course-import`. Lire les SKILL.md appropriés, ne pas les invoquer décorativement. Consulter le MCP OpenAI Docs quand pertinent et vérifier les versions des bibliothèques avant modification majeure.

## Preuve de fin de lot

Lot ID, issue/PR/commit réels, chemins modifiés, critères d'acceptation couverts, commandes exécutées + PASS/FAIL/NOT RUN, capture/E2E UI si applicable, risques/besoins d'accord humain, prochaine tâche **unique** dans HANDOFF. Ne pas confondre vérification documentaire du kit et validation de l'Academy.
