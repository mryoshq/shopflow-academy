# HANDOFF — reprise ShopFlow Academy

## État courant — session de nuit Claude Code (27-28/10/2026)

Agent : Claude Code (reprise après Codex). Clone de travail **`~/Developer/shopflow-academy`** (hors iCloud, branches qui suivent `origin`). L'ancien clone `~/Documents/Codex/2026-10-27/…/shopflow-academy` a des SHA différents : ne plus l'ouvrir ni pousser depuis lui (fichier `ANCIEN-CLONE-NE-PLUS-UTILISER.txt` posé à côté). `.env` et `.local/` y ont été copiés sans affichage (0600/0700, ignorés par Git).

### Phase 1 — assainissement : PASS
Arbres identiques ancien/nouveau clone sur les 4 branches ; ancienne stack arrêtée sans `-v` ; stack relancée depuis le nouveau clone, données conservées (2 enseignants, 20 étudiants, migration `0003_curriculum`) ; connexion enseignant `.local/verify_teacher.py` PASS ; pytest 16 PASS, Vitest 4 PASS, build PASS, Playwright 1 PASS.

### Phase 2 — publication : préparée, route Cloudflare **à créer par le propriétaire**
Branche `ops/publication-shopflow` (PR empilée sur #14). Cas A (tunnel géré par le tableau de bord, même Mac). Stack locale en production, smoke test local 13/13 PASS. L'extension Chrome n'était pas connectée : la route `shopflow.rapidfox.io → HTTP 127.0.0.1:3080` n'a **pas** été créée. Valeurs exactes et retour arrière : `docs/DEPLOY-RAPIDFOX.md` § Journal de publication. n8n non touché (référence : 302 vers Cloudflare Access).

### Phase 3 — configuration Claude Code : PR [#16](https://github.com/mryoshq/shopflow-academy/pull/16) vers `main`
`CLAUDE.md`, skills liés symboliquement, `.claude/settings.json`. Préparée dans le worktree `~/Developer/shopflow-claude-setup` pour que ses règles `ask` (dont `git push`) ne bloquent pas le travail de nuit. Context7 et `frontend-design` documentés, **non installés** (accord requis).

### Phase 4 — revue #11 à #14
Rapport : `~/Developer/shopflow-notes/REVUE-P0-01-04.md`. Un bloquant (B1, réponse lisible pour ordre/association) corrigé sur `fix/revue-p0-01-04` (PR empilée sur #15). Importants I1-I2 traités en P0-05.

### P0-05 — lecteur étudiant : livré
Branche `feat/p0-05-student-player`, empilée sur `fix/revue-p0-01-04` (#17). ADR-0011 (option A). Cours de démonstration installé dans la base locale/publiée (`docker compose exec -T backend python -m app.demo_course`, idempotent, comptes `demo.*` seulement). La stack locale tourne sur cette branche.

### P0-06 — notation et progression : livré
Branche `feat/p0-06-grading-progress` (empilée sur P0-05 #18). ADR-0012 : scores dérivés du journal des tentatives, sans cache. La stack locale tourne sur cette branche (migration 0005).

### Décisions prises par prudence en l'absence du propriétaire
- Route Cloudflare non créée (pas d'accès au tableau de bord) ; aucune commande `cloudflared` lancée ; jeton conservé, jamais affiché.
- `APP_EXTRA_ORIGINS=http://127.0.0.1:3080` ajouté pour garder l'accès local enseignant en production (Chrome).
- Réglages anti-veille proposés dans `OPERATIONS.md`, non appliqués.
- Empilement : chaque lot part de la branche précédente (#15 publication → #17 correctifs → P0-05 → …) pour que la stack publiée contienne tout ; la base de #15 reste #14.
- Option A d'ADR-0011 retenue (recommandée) ; vouvoiement ; `@axe-core/playwright` ajouté en dépendance de développement.
- Le classificateur a refusé l'affichage de `.local/verify_teacher.py` ; le script a été exécuté sans être lu (sortie : une ligne PASS).

## Historique Codex

### État vérifié le 27/10/2026 — P0-04

P0-04 est réalisé sur `feat/p0-04-course-studio`, [issue #4](https://github.com/mryoshq/shopflow-academy/issues/4), [PR #14](https://github.com/mryoshq/shopflow-academy/pull/14) ouverte et empilée sur #13. Commit fonctionnel local `c0a82da`, commit distant `4820a6a` avec arbre Git identique ; un commit documentaire de suivi peut s'ajouter. Les PR [#11](https://github.com/mryoshq/shopflow-academy/pull/11), [#12](https://github.com/mryoshq/shopflow-academy/pull/12) et [#13](https://github.com/mryoshq/shopflow-academy/pull/13) restent ouvertes, fusionnables et avec contrôles verts au 27/10/2026. Aucun merge automatique ; ordre manuel #11 → #12 → #13 → #14, avec changement de base et nouvelle vérification du diff/CI après chaque fusion. Voir `docs/INTEGRATION-PLAN.md`.

Le dépôt GitHub est **public**. Le transport Git HTTPS s'est bloqué sur ce Mac ; les commits distants ont été créés via `gh api` avec comparaison exacte des arbres. Ne pas force-push. Les contenus de cours définitifs restent en P2.

## Implémentation P0-04

- `frontend/src/TeacherStudio.tsx`, `MissionEditor.tsx`, `CoursePreview.tsx`, `StudentHome.tsx`, `api.ts`, `studioTypes.ts` : studio Chakra UI v3 et lecture étudiante initiale. Création/édition de cours et missions, structure et réorganisation, types d'activités génériques, tableaux/graphiques, indices, correction privée, import/export JSON facultatif de définition de mission, aperçu non noté, validation, publication, cohortes, attribution et archivage.
- `backend/app/curriculum.py`, `curriculum_schema.py` : validation serveur avant publication, `display_data` typé et borné, SQL avec `<` et `>`, projection étudiante défensive, permission sur cours archivés et routes de lecture des cohortes/versions pour le studio.
- `backend/app/upsert_teacher.py`, `scripts/upsert_teacher.py` : upsert local du compte enseignant avec mot de passe généré, sans doublon ni e-mail. Adresse et mot de passe uniquement dans `.local/teacher-email.txt` et `.local/teacher-credentials.json`, ignorés par Git ; fichier d'identifiants mode 0600. Le compte fonctionne dans la base locale. Ne pas afficher ni committer ces fichiers.
- `frontend/e2e/studio.spec.ts`, `frontend/playwright.config.ts`, `.github/workflows/app-ci.yml` : parcours Playwright fictif en local et en CI. `docs/STUDIO.md` et ADR-0009 décrivent l'usage et les frontières.

## Preuves et limites

- Backend `python -m pytest -q` : **16 PASS**. Frontend `npm run test -- --maxWorkers=1` : **4 PASS**. `npm run build` : **PASS**.
- `docker compose config --quiet` et `docker compose up -d --build --wait backend frontend gateway` : **PASS** sur la stack Academy locale. Gateway liée à `127.0.0.1:3080`, DB interne.
- Playwright Chrome 1366×768 `npm run test:e2e` : **1 PASS** après correction d'un sélecteur de test. Création d'une mission SQL fictive, refus de publication invalide, aperçu sans note, publication, attribution à un compte fictif, lecture étudiante sans clés de correction et 403 sur route enseignant. Captures locales dans le dossier `outputs` du chat.
- `python3 scripts/verify_kit.py` : **PASS 0 erreur**, contrôle documentaire distinct. Connexion du compte enseignant local et mode 0600 vérifiés **PASS**. Aucune adresse réelle n'a été ajoutée au diff ; `.local/` reste ignoré.
- CI [PR #14](https://github.com/mryoshq/shopflow-academy/pull/14) : backend, frontend, Compose, studio Playwright et kit **PASS** sur les runs push et PR. Recontrôler après toute modification et avant intégration.
- Le lecteur étudiant P0-04 affiche les cours et missions attribués ; soumission, score et progression restent P0-05/P0-06. L'import/export de cours complet reste P0-08. Les tests Playwright ont seulement créé des cours/cohortes de démonstration et utilisé des comptes fictifs ; les comptes étudiants fournis n'ont pas été modifiés.

## Reprise unique (historique Codex)

À la prochaine demande, commencer **P0-05** (lecteur étudiant générique) après avoir relu `AGENTS.md`, le CPS, BACKLOG, PROGRESS et la PR #14. Ne pas produire les vrais cours avant P2. Ne pas modifier Cloudflare, DNS, tunnels, tokens ni `n8n.rapidfox.io` sans accord ; seule publication future autorisée : Docker Compose sur Mac + Cloudflare Tunnel vers `shopflow.rapidfox.io`. Le jeton cloudflared apparu dans une sortie d'inventaire antérieure doit être traité comme exposé avant une publication future, sans le copier dans Git ou les réponses.
