# HANDOFF — reprise ShopFlow Academy

## État vérifié le 27/10/2026 — P0-04

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

## Reprise unique

À la prochaine demande, commencer **P0-05** (lecteur étudiant générique) après avoir relu `AGENTS.md`, le CPS, BACKLOG, PROGRESS et la PR #14. Ne pas produire les vrais cours avant P2. Ne pas modifier Cloudflare, DNS, tunnels, tokens ni `n8n.rapidfox.io` sans accord ; seule publication future autorisée : Docker Compose sur Mac + Cloudflare Tunnel vers `shopflow.rapidfox.io`. Le jeton cloudflared apparu dans une sortie d'inventaire antérieure doit être traité comme exposé avant une publication future, sans le copier dans Git ou les réponses.
