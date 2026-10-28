# HANDOFF — reprise ShopFlow Academy

## Reprise unique — sprint 2 (28/10/2026, session cloud Claude Code)

**Prochaine tâche unique : faire les sections « À faire en local » des PR déjà fusionnées (A, D, F, C, B) si ce n'est pas fait, puis relire et fusionner #31 (E) — accord et action du propriétaire — en faisant après chacune sa section « À faire en local ».** L'agent rebase la PR suivante sur `main` après chaque fusion.

**État réel (vérifié dans Git le 28/10/2026)** :
- Toute la phase P0 (P0-01 à P0-10) est **fusionnée dans `main`** (pile #11 → #24 fusionnée), CI verte. La [PR #25](https://github.com/mryoshq/shopflow-academy/pull/25) (format du cours `docs/COURSE-AUTHORING.md`) est fusionnée aussi.
- **Production** : `https://shopflow.rapidfox.io`, sur le Mac de l'enseignant (Docker Compose + Cloudflare Tunnel), déployée depuis `main`. Ce setup est définitif.
- **Cours** : en cours de rédaction par un autre agent dans un **dossier local du Mac** (jamais sur GitHub : il contient les corrigés). Sauvegarde dans le dépôt privé `mryoshq/shopflow-courses` (ne pas y toucher depuis une session cloud).
- **Sprint 2 terminé** (session cloud, sans accès au Mac) : parties A, D, F, C, B, E, une PR par partie ; A, D, F, C, B fusionnées.

### PR du sprint 2, dans l'ordre de fusion

| Ordre | Partie | Branche | PR | État |
|---|---|---|---|---|
| 1 | A — blocs de 15 min, « Ma classe », aide, interface simplifiée, ménage, `APP_SECRET` | `claude/lucid-brahmagupta-htwgun` | [#26](https://github.com/mryoshq/shopflow-academy/pull/26) | **fusionnée** |
| 2 | D — chaîne d'import du cours Markdown | `claude/lucid-brahmagupta-htwgun-d` | [#27](https://github.com/mryoshq/shopflow-academy/pull/27) | **fusionnée** |
| 3 | F — médias et animations codés | `claude/lucid-brahmagupta-htwgun-f` | [#28](https://github.com/mryoshq/shopflow-academy/pull/28) | **fusionnée** |
| 4 | C — exécution de code préconfiguré | `claude/lucid-brahmagupta-htwgun-c` | [#29](https://github.com/mryoshq/shopflow-academy/pull/29) | **fusionnée** |
| 5 | B — expérience simple et mode sombre | `claude/lucid-brahmagupta-htwgun-b` | [#30](https://github.com/mryoshq/shopflow-academy/pull/30) | **fusionnée** |
| 6 | E — `docs/SUGGESTIONS.md` | `claude/lucid-brahmagupta-htwgun-e` | [#31](https://github.com/mryoshq/shopflow-academy/pull/31) (base : `main`, rebasée) | ouverte |

Chaque PR part de la précédente : fusionner dans l'ordre (merge commit). **Consigne du propriétaire (28/10)** : dès qu'une PR est fusionnée, l'agent rebase la suivante sur `main`, change sa base vers `main` et pousse avec `--force-with-lease` (sur ses propres branches seulement, accord écrit donné dans la conversation), puis attend la CI verte.

### À faire en local après la PR A (Mac, clone `~/Developer/shopflow-academy`)
1. **Sauvegarde manuelle** (migration 0007) : commande « Manuelle » de `docs/RUNBOOK.md`, suffixe `avant-sprint2-a`.
2. **`APP_SECRET`** : la production refuse désormais de démarrer sans lui. Vérifier sans afficher : `grep -c '^APP_SECRET=.\{32,\}' .env` doit afficher `1`. Sinon : `python3 -c "import secrets; print('APP_SECRET=' + secrets.token_urlsafe(48))" >> .env` (les tentatives déjà enregistrées restent valides ; les brouillons de réponse ouverts dans un navigateur sont à refaire).
3. Redéployer : `git switch main && git pull && docker compose up -d --build --wait && python3 scripts/smoke_public.py http://127.0.0.1:3080`, puis `python3 scripts/smoke_public.py`.
4. Se connecter : « Mon cours » crée ou retrouve le cours unique (`python-data-engineering-sql`) et la classe « Classe B3 IA/Data » (les étudiants actifs, donc les 10 `@ynov.com`). Aucun cours n'est attribué tant que vous ne publiez pas.
5. **Ménage** (simulation, puis exécution) : `docker compose exec -T backend python -m app.course_cleanup < .local/teacher-email.txt`, relire la liste, puis la même commande avec `--apply`. Rien n'est supprimé (archivage, audité). Également possible depuis « Mon cours » → Options avancées.

### À faire en local après la PR D
1. Sauvegarde manuelle (migration 0008), suffixe `avant-sprint2-d` ; redéployer comme pour A (`docker compose up -d --build --wait`, l'image backend installe PyYAML).
2. Compiler le cours réel : `python3 scripts/course_md.py compile "<dossier du cours>/cours"` ; relire `<dossier du cours>/RETOURS-PLATEFORME.md` (erreurs avec fichier et ligne).
3. À 0 erreur, importer en brouillon : `python3 scripts/course_md.py import "<dossier du cours>/cours" < .local/teacher-email.txt`, puis vérifier « Mon cours » → Aperçu.
4. Sauvegarder le dossier (skill `course-import`). Publication (`--publish`) : seulement sur votre accord.

### À faire en local après la PR F
1. Redéployer (`docker compose up -d --build --wait`) : nouveau volume `media_data` (créé automatiquement, vide), gateway et backend reconstruits. Pas de migration.
2. `python3 scripts/smoke_public.py` puis, dans un navigateur, vérifier qu'une page s'affiche sans erreur de CSP (console).
3. Vidéos du cours : les placer dans `cours/media/` (≤ 50 Mo, sous-titres `.vtt` conseillés) ; elles sont copiées à l'import. Les sauvegardes automatiques ne couvrent que PostgreSQL : le dossier du cours reste la source des vidéos.

### À faire en local après la PR C
1. Secrets du laboratoire, sans affichage : `python3 scripts/init_lab_env.py` (ajoute `LAB_POSTGRES_PASSWORD`, `LAB_OWNER_PASSWORD`, `LAB_READER_PASSWORD` dans `.env` s'ils manquent). Sans eux, `docker compose` refuse de démarrer.
2. `docker compose up -d --build --wait` (nouveaux services `labdb`, `lab-init`, réseau `lab`), puis `docker compose logs lab-init` : une ligne `{"lab": "ready", …}` ; puis `python3 scripts/smoke_public.py`.
3. Sur le Mac, une fois : `docker pull postgres:16-alpine` et `docker build -t shopflow-python-runner:1 runner/python` (sinon `scripts/course_md.py` le construit au premier usage).
4. Recompiler le cours : les requêtes `run` et les extraits Python sont maintenant exécutés ; corriger les erreurs signalées dans `RETOURS-PLATEFORME.md`. L'import charge `datasets/shopflow-lab.sql` dans la base de laboratoire.

### À faire en local après la PR B
1. Redéployer (`docker compose up -d --build --wait`, puis `python3 scripts/smoke_public.py`). Pas de migration.
2. Fiches de connexion : `python3 scripts/login_sheets.py` (lit `.local/student-emails.txt`, un identifiant par ligne ; le créer s'il manque) ; ouvrir puis imprimer le fichier écrit dans `~/Developer/shopflow-notes/`. Mots de passe initiaux seulement sur demande : `--with-passwords` (lit `.local/student-credentials.json`).
3. Mot de passe oublié en séance : « Ma classe » → « Détail » de l'étudiant → « Réinitialiser le mot de passe » (affiché une seule fois, à transmettre en personne).

### À faire en local après la PR E
Rien à exécuter. Lire `docs/SUGGESTIONS.md` et indiquer les suggestions retenues.

### Attend l'accord du propriétaire
- Fusion de #31.
- Publication du cours réel pour la classe (`course_md.py import … --publish` ou « Publier pour la classe ») et ouverture des blocs en séance : jamais faites par un agent.
- Choix parmi `docs/SUGGESTIONS.md`.

### NOT RUN pendant le sprint 2 (raison)
- Redéploiement, `smoke_public.py` sur la production, sauvegardes avant migration : pas d'accès au Mac.
- `docker compose up` de la stack complète dans la session : images non construites (limite de téléchargement Docker Hub) ; remplacée par une stack locale équivalente (PostgreSQL, base de laboratoire, uvicorn, nginx avec la configuration du gateway) ; la stack Compose complète est testée par la CI (`studio-e2e`).
- Compilation et import du cours réel, fiches de connexion sur les vraies adresses : dossier du cours et `.local/` uniquement sur le Mac.
- Image `runner/python` construite seulement via une variante locale (proxy de la session) ; l'image versionnée est construite en CI et sur le Mac.

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

### P0-07 — tableau de bord enseignant : livré
Branche `feat/p0-07-teacher-dashboard` (empilée sur P0-06 #19). ADR-0013. Le « Suivi de classe » ne montre que les cours dont le compte est propriétaire : la classe de démonstration se consulte avec `demo.enseignant` (identifiants dans `.local/demo-credentials.json`).

### P0-08 — administration de contenu : livré
Branche `feat/p0-08-content-admin` (empilée sur P0-07 #20). ADR-0014. Les exports contiennent les corrigés : ne pas les déposer dans le dépôt public.

### P0-09 — qualité : livré
Branche `feat/p0-09-quality` (empilée sur P0-08 #21). Toutes les preuves et commandes : `docs/QUALITY.md`.

### P0-10 — exploitation : partiel
Branche `feat/p0-10-operations` (empilée sur P0-09 #22). ADR-0015, `docs/RUNBOOK.md`. Sauvegarde automatique active (service `backup`), restauration testée PASS, contrôle `ops_status.py`. **Reste** : route Cloudflare et test distant.

### Décisions prises par prudence en l'absence du propriétaire
- Route Cloudflare non créée (pas d'accès au tableau de bord) ; aucune commande `cloudflared` lancée ; jeton conservé, jamais affiché.
- `APP_EXTRA_ORIGINS=http://127.0.0.1:3080` ajouté pour garder l'accès local enseignant en production (Chrome).
- Réglages anti-veille proposés dans `OPERATIONS.md`, non appliqués.
- Empilement : chaque lot part de la branche précédente (#15 publication → #17 correctifs → P0-05 → …) pour que la stack publiée contienne tout ; la base de #15 reste #14.
- Option A d'ADR-0011 retenue (recommandée) ; vouvoiement ; `@axe-core/playwright` ajouté en dépendance de développement.
- Accès propriétaire strict pour le suivi de classe (404 pour un autre enseignant) ; studio laissé partagé (à trancher, revue I3).
- Playwright limité à un worker : les tests partagent la base (pause de classe).
- Sauvegarde automatique dans Compose (pas de tâche launchd : aucune configuration système modifiée). `BACKUP_DIR` ajouté à `.env` (chemin seulement).
- Fiabilité E2E : 1 échec isolé sur 4 exécutions juste après un redéploiement, non reproduit ensuite (3 passages consécutifs) ; cause non identifiée, à surveiller en CI.
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
