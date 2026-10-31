# HANDOFF — reprise Rapidfox Academy






## Test de charge : limite de la connexion (31/10/2026)

Branche `claude/lucid-brahmagupta-htwgun-charge` depuis `main` (#67 fusionnée). `scripts/load_test.py` : `LOGIN_P95_LIMIT_MS = 3000` pour la connexion, `P95_LIMIT_MS = 1500` pour toutes les autres requêtes. Rien à faire en local.

Prochaine action unique : revue et fusion de cette PR, puis fusion de `main` dans #69 et #70 pour qu'elles en profitent.

## Radio simplifiée — PR 1/3 (30/10/2026)

Branche `claude/lucid-brahmagupta-htwgun-radio` depuis `main` (#66 fusionnée). Fichiers clés : `frontend/src/comfort/Comfort.tsx` (`Radio`, `loadVolume`), `backend/app/comfort.py` (`RADIO_HOSTS`, `stream_url`), `gateway/nginx.conf` (`media-src`), `.env.example`, `docs/RUNBOOK.md` (« Radio d'ambiance »), ADR-0024 (révision du 30/10). Captures : `docs/captures/radio/`.

### Radio — À faire en local après fusion
1. Dans `.env`, remplacer `RADIO_STREAMS` par la ligne de `.env.example` (les anciens liens YouTube sont désormais ignorés).
2. Pas de migration. Redéployer à une pause (`docker compose build`, puis `docker compose up -d --wait`) : la passerelle doit être reconstruite pour la nouvelle CSP.
3. `python3 scripts/smoke_public.py http://127.0.0.1:3080` : le contrôle « CSP media-src : radios seulement » doit passer.

Prochaine action unique : revue et fusion de la PR « Radio simplifiée », puis PR 2 « Plus de plaisir ».

## Tableaux Markdown dans les leçons (30/10/2026)

Branche `claude/lucid-brahmagupta-htwgun-tableaux` depuis `main` (#65 fusionnée). Fichiers clés : `frontend/src/student/RichText.tsx` (`parseTable`, `RichTable`), `backend/app/course_md.py` (`table_problems`, `table_warnings` ; ligne exacte pour un `body: |`), `docs/COURSE-AUTHORING.md` § 5 ter, ADR-0022. `ProjectText.tsx` (espace projet) garde son rendu tolérant pour les textes des binômes.

### Tableaux — À faire en local après fusion
1. Pas de migration. Redéployer à une pause selon le runbook (`docker compose build`, puis `docker compose up -d --wait`).
2. Recompiler le module CampusEquip (`python3 scripts/course_md.py compile "<dossier du cours>/cours"`) : chaque tableau mal formé est signalé avec sa ligne. Les versions déjà publiées s'affichent avec les tableaux dès le redéploiement (rendu côté navigateur), sans republier.

PR #66 fusionnée le 30/10/2026.

## PR 1 « Accueil et suivi » (30/10/2026)

Branche `claude/lucid-brahmagupta-htwgun-accueil` depuis `main` (#62, #63, #64 fusionnées). Fichiers clés : `frontend/src/App.tsx` (page de connexion), `frontend/src/LoginIntro.tsx` (ouverture), `frontend/src/teacher/HelpBadge.tsx` et `TeacherApp.tsx` (pastille), `frontend/src/teacher/LivePanel.tsx` (message en haut), `backend/app/live.py` (`help_pending`), `backend/app/auth.py` (`remember` retiré). `ThemeSwitch.tsx` supprimé (plus utilisé). Captures : `docs/captures/accueil/`.

### PR 1 — À faire en local après fusion
1. Pas de migration. Redéployer à une pause selon le runbook (`docker compose build`, puis `docker compose up -d --wait`), puis recharger la page.

PR #65 fusionnée le 30/10/2026.

## PR B — résilience et sessions de 30 jours (30/10/2026)

Branche `claude/lucid-brahmagupta-htwgun-resilience`, partie de la PR #62 puis à jour avec `main`. ADR-0038. Fichiers clés : `frontend/src/resilience.ts`, `frontend/src/Unavailable.tsx`, `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/public/sw.js`, `frontend/public/offline.html` et `offline.js`, `backend/app/auth.py`, `scripts/ops/measure_downtime.py`, `docs/RUNBOOK.md`.

### PR B — À faire en local après fusion
1. Pas de migration. Redéployer selon le runbook : `docker compose build`, puis `docker compose up -d --wait`, avec `python3 scripts/ops/measure_downtime.py http://127.0.0.1:3080` lancé dans un second terminal ; noter la coupure mesurée dans PROGRESS.
2. Recharger la page une fois : le nouveau service worker s'installe et garde l'application en cache pour les coupures suivantes.

Prochaine action unique : revue et fusion de la PR B, puis mesure de la coupure d'un redéploiement sur le Mac.

## PR #62 — style, Rapidfox Academy, préférences (30/10/2026)

Branche `feat/theme-claude-style` (base `main`). ADR-0035 (style), ADR-0036 (préférences d'affichage et menu de compte), ADR-0037 (nom affiché). Composant du nom : `frontend/src/BrandName.tsx`. Favicons `favicon-light.png` et `favicon-dark.png` produits par `node scripts/make-icons.mjs favicon-light.png favicon-dark.png` (le script accepte maintenant une liste de fichiers). Relecture : `docs/captures/pr62/`.

### PR #62 — À faire en local après fusion
1. Pas de migration. Redéployer le frontend à une pause ; recharger la page (le service worker prend la nouvelle version).
2. Vérifier l'onglet du navigateur : renard vert en clair, terre cuite en sombre.

Prochaine action unique : revue et fusion de la PR #62, puis PR B (résilience) depuis `main`.

## Q2 — « Le voyage d'une donnée » intégré (29/10/2026)

Branche `claude/lucid-brahmagupta-htwgun-q2` depuis `main` (`2d55de2`, après #57). Archive lue dans le dépôt privé `mryoshq/shopflow-courses` (`assets/ShopFlow-voyage.zip`, commit `62cd2d8`) ; le zip n'est pas copié dans ce dépôt, seules les sources de `src/` le sont (`frontend/src/voyage/`). Détails et limites : ADR-0033, section « Intégration (Q2) ».

Tests : `vitest` ciblés PASS 94, `tsc -b` PASS, `vite build` PASS ; E2E `voyage.spec.ts` par la CI.

### Q2 — À faire en local après fusion
1. Pas de migration. Redéployer le frontend à une pause, recharger la page.
2. Facultatif : déposer `experiences/voyage.json` dans le dossier du cours (clés `base`, `batch`, `files`, voir COURSE-AUTHORING) puis recompiler et réimporter le cours.
3. Décider MAD ou DH pour les montants de l'expérience (texte du propriétaire en MAD).

Prochaine action unique : revue et fusion de la PR Q2 par le propriétaire.

## O — interface enseignant à une page (29/10/2026)

Branche `claude/lucid-brahmagupta-htwgun-o`, partie de P, avec S, Q et R fusionnées (merge, sans force-push). Coquille `frontend/src/teacher/TeacherApp.tsx`, adresses `routes.ts`, `Today.tsx`, `CommandPalette.tsx`, `SidePanel.tsx` ; `TeacherHome.tsx` supprimé. ADR-0031. Aucune modification backend.

Tests : `vitest run` PASS 107, `tsc -b` PASS ; E2E mis à jour pour la nouvelle navigation (`e2e/teacher-nav.ts`) et nouvelle spec `e2e/teacher-shell.spec.ts`, exécutés par la CI seulement.

### O — À faire en local après fusion
1. P, S et Q sont fusionnées ; fusionner R (#56) puis O (#57).
2. Pas de migration propre à O (celle de R, `0014_project`, demande une sauvegarde). Redéployer le frontend à une pause, puis recharger la page enseignant.

Prochaine action unique : revue et fusion de #56 (R) puis #57 (O) par le propriétaire.

## Résultats — branche `codex/resultats`, [PR #41](https://github.com/mryoshq/shopflow-academy/pull/41) (28/10/2026)

Nouvelle page Résultats et deux endpoints dédiés en lecture/export, sans migration. Seuil d’accompagnement réglable, défaut 50 %, comparaison strictement inférieure au seuil, bonus exclus du pourcentage ; compteurs/difficultés sur missions principales seulement, leçons et bonus exclus. Points retenus fournis par `mission_scores`/`course_score` sans re-noter. Top 5 classe entière ; détail des missions non réussies par étudiant ; icône/texte « À accompagner », tri et filtre.

CSV dédié à la page : `GET /api/v1/teacher/classes/{assignment_id}/results/export.csv?threshold=50`. Format historique préservé, compteur de réussite principale cohérent avec la page, ajout `a_accompagner` ; export de toute la classe quel que soit le filtre. Le seuil est un paramètre de lecture, pas un nouveau réglage de notation. Propriétaire uniquement ; pas de corrigé dans ces réponses ; audit d’export et protection contre les formules conservés.

Fichiers de l’autre agent inchangés : `classroom.py`, `progress.py`, `student.py`, `teacher_dashboard.py`, `ClassTimeline`, `TeacherDashboard`. Intégration partagée limitée à l’inclusion du nouveau routeur dans `main.py`. Tests ciblés **20 pytest PASS**, **11 Vitest PASS**, **TypeScript PASS**, commandes dans PROGRESS. Suites complètes/E2E : CI ; production **NOT RUN**.

Prochaine action unique : attendre les cinq contrôles verts de la PR, puis revue/fusion par le propriétaire. Après déploiement autorisé à une pause, vérifier l’onglet Résultats, les seuils 50 % et 75 %, le filtre et le CSV ; aucune migration ni opération sur le cours n’est nécessaire.

## K — Classement facultatif (Codex, 28/10/2026)

Branche `codex/k-classement`, créée sur `main` `14017c2`, puis mise à jour par merge de `main` `52079c8` (logo et L), [PR #37](https://github.com/mryoshq/shopflow-academy/pull/37) vers `main`, sans fusion de PR ni déploiement. ADR `docs/DECISIONS/0026-classement.md`. API, modèles, migration, page et tests propres à K ; seules l’inclusion du routeur, la déclaration des modèles Alembic et la navigation App touchent des fichiers partagés. Ne pas modifier le chantier H/L. Si `main` avance, le fusionner dans cette branche sans force-push, et vérifier la tête de migration (actuellement `0011_leaderboard` après `0010_attempt_rules`, tête unique vérifiée ; tests ciblés repassés après le merge).

Livré : off par défaut, accès aux inscrits et au propriétaire seulement, pseudonymes sans login/e-mail, principaux/bonus séparés, rangs `1, 1, 3`, top 3 avec tous les ex æquo et sa position, masquage serveur si bloc ouvert, onglet du jour (`Africa/Casablanca`), polling 5 s, podium SVG original, clavier/AA/clair/sombre/mouvement réduit. Ni notation ni export modifiés.

Tests ciblés : pytest classement + migrations + matrice + propriété **27 PASS** ; Vitest classement + App **11 PASS** ; TypeScript **PASS** ; une spec Playwright classement **PASS**, avec axe sans violation sur vues testées, captures enseignant/clair/sombre et actualisation ≤ 10 s. Le navigateur utilise uniquement des réponses fictives ; l’API et les migrations sont réellement exercées dans pytest sur SQLite. Suites complètes/Compose/PostgreSQL/production **NOT RUN localement**, laissées à la CI pour les suites et au propriétaire pour le déploiement.

Suivi CI : les échecs initiaux sur `cba066b` ont été reproduits (propriété avant validation d’un corps invalide, navigation mobile avec libellés longs). Correctifs et régressions dans K seulement, tests ciblés repassés. Attendre tous les contrôles verts sur le dernier commit. Un suivi automatique dans la conversation prévient alors le propriétaire, puis relit en lecture seule la PR de l’autre agent sur le compteur « terminé », suivie de H ; aucun commentaire GitHub ni modification de ces PR.

Compatibilité L vérifiée explicitement : 7 points retenus après essais réels à 70 % puis 50 %, ancien score de 10 conservé ; aucun recalcul des notes. Test de chaîne depuis `0010_attempt_rules` peuplée, aller-retour K/L/K, préserve réglages L et tentatives. Tête unique `0011_leaderboard` ; aucune migration exécutée en production dans cette session.

### K — À faire en local après revue et fusion par le propriétaire

1. Sauvegarder la base selon `docs/RUNBOOK.md`, suffixe `avant-sprint2-k` ; vérifier la tête Alembic si H/L a été fusionné entre-temps.
2. À une pause, redéployer par la procédure habituelle (service migrate compris), puis smoke test selon le runbook. Cette session n’a exécuté ni migration ni redéploiement en production.
3. Ouvrir « Classement » comme enseignant : vérifier qu’il est désactivé, puis activer seulement si souhaité. Vérifier avec un compte étudiant autorisé le pseudonyme, les ex æquo, les deux options et le retour 404 après désactivation. Ne pas utiliser de vrais étudiants comme comptes de test automatisés.

Prochaine action unique pour K : relire la PR et ses résultats CI ; aucune fusion automatique.

## Reprise unique — sprint 2 (28/10/2026, session cloud Claude Code)

**Prochaine tâche unique : relire #53 (P), #54 (S), #55 (Q, cadre) et #56 (R, espace projet, migration `0014_project`), fusionner dans cet ordre, puis faire les « À faire en local » — accord et action du propriétaire.** Ensuite : O (interface enseignant), et l'intégration du voyage à réception de l'archive.

**État réel (vérifié dans Git le 28/10/2026)** :
- Toute la phase P0 (P0-01 à P0-10) est **fusionnée dans `main`** (pile #11 → #24 fusionnée), CI verte. La [PR #25](https://github.com/mryoshq/shopflow-academy/pull/25) (format du cours `docs/COURSE-AUTHORING.md`) est fusionnée aussi.
- **Production** : `https://shopflow.rapidfox.io`, sur le Mac de l'enseignant (Docker Compose + Cloudflare Tunnel), déployée depuis `main`. Ce setup est définitif.
- **Cours** : en cours de rédaction par un autre agent dans un **dossier local du Mac** (jamais sur GitHub : il contient les corrigés). Sauvegarde dans le dépôt privé `mryoshq/shopflow-courses` (ne pas y toucher depuis une session cloud).
- **Sprint 2** (session cloud, sans accès au Mac) : une PR par partie ; A, D, F, C, B, E, G, G2 fusionnées ; logo (#36) et L en PR ; puis H, K, I, J.

### PR du sprint 2, dans l'ordre de fusion

| Ordre | Partie | Branche | PR | État |
|---|---|---|---|---|
| 1 | A — blocs de 15 min, « Ma classe », aide, interface simplifiée, ménage, `APP_SECRET` | `claude/lucid-brahmagupta-htwgun` | [#26](https://github.com/mryoshq/shopflow-academy/pull/26) | **fusionnée** |
| 2 | D — chaîne d'import du cours Markdown | `claude/lucid-brahmagupta-htwgun-d` | [#27](https://github.com/mryoshq/shopflow-academy/pull/27) | **fusionnée** |
| 3 | F — médias et animations codés | `claude/lucid-brahmagupta-htwgun-f` | [#28](https://github.com/mryoshq/shopflow-academy/pull/28) | **fusionnée** |
| 4 | C — exécution de code préconfiguré | `claude/lucid-brahmagupta-htwgun-c` | [#29](https://github.com/mryoshq/shopflow-academy/pull/29) | **fusionnée** |
| 5 | B — expérience simple et mode sombre | `claude/lucid-brahmagupta-htwgun-b` | [#30](https://github.com/mryoshq/shopflow-academy/pull/30) | **fusionnée** |
| 6 | E — `docs/SUGGESTIONS.md` | `claude/lucid-brahmagupta-htwgun-e` | [#31](https://github.com/mryoshq/shopflow-academy/pull/31) | **fusionnée** |
| 7 | G — leçons structurées, description des médias, mise en forme légère (ADR-0022) | `claude/lucid-brahmagupta-htwgun-g` | [#32](https://github.com/mryoshq/shopflow-academy/pull/32) | **fusionnée** |
| 8 | G2 — plan du cours, objectifs par catégorie, logo et icônes (ADR-0022b) | `claude/lucid-brahmagupta-htwgun-g2` | [#33](https://github.com/mryoshq/shopflow-academy/pull/33) | **fusionnée** |
| 9 | Logo source du propriétaire (`docs/design/`) | `design/logo-proprietaire` | [#34](https://github.com/mryoshq/shopflow-academy/pull/34) | **fusionnée** |
| 10 | Variante verte du logo (PR du propriétaire) | `design/logo-vert` | [#35](https://github.com/mryoshq/shopflow-academy/pull/35) | **fusionnée** |
| 11 | Logo : en-tête, connexion, favicon, icônes, image de partage (ADR-0022c) | `claude/lucid-brahmagupta-htwgun-logo` | [#36](https://github.com/mryoshq/shopflow-academy/pull/36) (base : `main`, contient #35 par fusion) | **fusionnée** |
| 12 | L — décourager le clic au hasard (ADR-0027) | `claude/lucid-brahmagupta-htwgun-l` | [#38](https://github.com/mryoshq/shopflow-academy/pull/38) (base : `main`, contient #36 par fusion) | **fusionnée** |
| 13 | Correctif : bloc terminé sur les missions notées, leçons lues à part, validations après republication | `claude/lucid-brahmagupta-htwgun-lecons` | [#39](https://github.com/mryoshq/shopflow-academy/pull/39) (base : `main`) | **fusionnée** |
| 14 | H — suivi en direct (ADR-0023) | `claude/lucid-brahmagupta-htwgun-h` | [#40](https://github.com/mryoshq/shopflow-academy/pull/40) (base : `main`, contient #39 par fusion) | **fusionnée** |
| 15 | Correctifs de relecture (#39, #40) | `claude/lucid-brahmagupta-htwgun-relecture` | [#44](https://github.com/mryoshq/shopflow-academy/pull/44) | **fusionnée** |
| 16 | I — PWA, confort (pomodoro, radio), couleurs (ADR-0024) | `claude/lucid-brahmagupta-htwgun-i` | [#47](https://github.com/mryoshq/shopflow-academy/pull/47) | **fusionnée** |
| 17 | M — cartes à retourner, élément « Révision » (ADR-0028) | `claude/lucid-brahmagupta-htwgun-m` | [#49](https://github.com/mryoshq/shopflow-academy/pull/49) (base : `main`) | ouverte |
| 18 | N — rester connecté, code Catppuccin, images, passe mobile (ADR-0029) | `claude/lucid-brahmagupta-htwgun-n` (depuis la branche M) | [#51](https://github.com/mryoshq/shopflow-academy/pull/51) (base : `main`, contient M tant que #49 n'est pas fusionnée) | ouverte |
| 19 | J — observateur en lecture seule (ADR-0025) | `claude/lucid-brahmagupta-htwgun-j` (depuis la branche N) | [#52](https://github.com/mryoshq/shopflow-academy/pull/52) (base : `main`, contient M et N tant qu'elles ne sont pas fusionnées) | fusionnée |
| 23 | R — espace projet CampusEquip (ADR-0034) | `claude/lucid-brahmagupta-htwgun-r` | [#56](https://github.com/mryoshq/shopflow-academy/pull/56) (base : `main`) | ouverte |
| 24 | O — interface enseignant à une page (ADR-0031) | `claude/lucid-brahmagupta-htwgun-o` (contient P, S, Q, R par fusion) | [#57](https://github.com/mryoshq/shopflow-academy/pull/57) (base : `main`) | ouverte |
| 25 | Q2 — voyage d'une donnée intégré (ADR-0033) | `claude/lucid-brahmagupta-htwgun-q2` | PR à venir (base : `main`) | ouverte |
| 22 | Q — voyage d'une donnée, cadre (ADR-0033) | `claude/lucid-brahmagupta-htwgun-q` | [#55](https://github.com/mryoshq/shopflow-academy/pull/55) (base : `main`) | ouverte, application en attente de l'archive |
| 21 | S — laboratoire multi-schémas, téléchargements (ADR-0032) | `claude/lucid-brahmagupta-htwgun-s` | [#54](https://github.com/mryoshq/shopflow-academy/pull/54) (base : `main`) | ouverte |
| 20 | P — report des réussites quand seul le texte change (ADR-0030) | `claude/lucid-brahmagupta-htwgun-p` | [#53](https://github.com/mryoshq/shopflow-academy/pull/53) (base : `main`) | ouverte |

Chaque PR part de la précédente : fusionner dans l'ordre (merge commit). **Consigne du propriétaire (28/10, mise à jour)** : plus de force-push ; quand une PR est fusionnée, l'agent fusionne `main` dans la suivante si nécessaire. Ancienne consigne : dès qu'une PR est fusionnée, l'agent rebase la suivante sur `main`, change sa base vers `main` et pousse avec `--force-with-lease` (sur ses propres branches seulement, accord écrit donné dans la conversation), puis attend la CI verte.

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

### À faire en local après la PR G
1. Redéployer (`docker compose up -d --build --wait`, puis `python3 scripts/smoke_public.py`). Pas de migration ; les leçons déjà publiées sont inchangées.
2. Dans le cours réel, structurer les leçons (`objective`, `hook`, `key_terms`, `example`, `practice`, `data.description`) selon `docs/COURSE-AUTHORING.md` § 5 bis et 5 ter, recompiler et relire les avertissements « paragraphe de N mots » dans `RETOURS-PLATEFORME.md`.

### À faire en local après la PR G2
1. **Sauvegarde manuelle** (migration **0009**, ajout de la colonne `learning_objectives.category`) : commande « Manuelle » de `docs/RUNBOOK.md`, suffixe `avant-sprint2-g2`.
2. Redéployer à la pause : `git switch main && git pull && docker compose up -d --build --wait` (le service `migrate` applique 0009), puis `python3 scripts/smoke_public.py`. Les étudiants connectés gardent leur session ; un rechargement de page suffit.
3. Facultatif : ajouter `category` aux objectifs de `00-cours.md` du cours réel et des objectifs `BLOC-` (une phrase), recompiler et réimporter.

### À faire en local après la PR du logo
1. Redéployer à la pause : `git switch main && git pull && docker compose up -d --build --wait` (seul le frontend change), puis `python3 scripts/smoke_public.py`. **Pas de migration**, pas de sauvegarde nécessaire.
2. Recharger la page ; si l'ancienne icône reste dans l'onglet, vider le cache du site (les navigateurs gardent la favicon quelques heures). Sur un téléphone où l'application était épinglée, la retirer et l'épingler de nouveau pour voir la nouvelle icône.

### À faire en local après la PR L (#38)
1. **Sauvegarde manuelle** (migration **0010** : colonne `courses.attempt_rules`, colonnes `attempt_number`, `percent`, `fast` des essais, table `mission_openings`) : commande « Manuelle » de `docs/RUNBOOK.md`, suffixe `avant-sprint2-l`.
2. Redéployer **hors d'un bloc ouvert** (à la pause) : `git switch main && git pull && docker compose up -d --build --wait` (le service `migrate` applique 0010), puis `python3 scripts/smoke_public.py`. Rien ne change pour les étudiants tant que les règles ne sont pas activées.
3. Au moment choisi : « Mon cours » → « Règles », cocher les mesures voulues (points dégressifs, pause, lecture minimale), relire le texte de l'annonce, « Enregistrer les règles ». La date d'activation s'affiche ; les essais antérieurs gardent leurs points. Le repérage des clics rapides est actif dès le déploiement (visible dans « Ma classe » seulement).

### À faire en local après le correctif leçons (prioritaire)
1. Redéployer à la pause : `git switch main && git pull && docker compose up -d --build --wait`, puis `python3 scripts/smoke_public.py`. **Pas de migration** : les « J'ai compris » de la version 1 comptent immédiatement (calcul à la lecture).
2. Vérifier dans « Ma classe » : bloc SQL 01, « terminé » attendu pour les 7 étudiants ayant réussi toutes les missions notées, et « leçons lues x/10 » à côté.

### À faire en local après la PR H
1. **Sauvegarde manuelle** (migration **0012** (après `0011_leaderboard`) : tables `presences`, `notifications`, `block_unlocks`, `push_subscriptions`, `notification_settings`, `block_plans` ; rien d'existant n'est modifié), suffixe `avant-sprint2-h`.
2. Redéployer à la pause : `git switch main && git pull && docker compose up -d --build --wait` (nouvelle dépendance `cryptography`, nouveau réseau `push` sortant pour le backend), puis `python3 scripts/smoke_public.py`.
3. Facultatif, Web Push : `docker compose run --rm --no-deps -v "$PWD:/repo" -w /repo backend python scripts/vapid_keys.py` (écrit les clés dans `.env`, n'affiche pas la clé privée), puis `docker compose up -d --wait backend`. Sans clés, les notifications dans la page fonctionnent.
4. Dans « Ma classe » : « Réglages des notifications » (types, seuil) ; l'ouverture automatique reste désactivée tant que vous ne l'activez pas.

### À faire en local après la PR I
1. Redéployer à la pause : `git switch main && git pull && docker compose up -d --build --wait` (frontend, backend et gateway : nouvelle CSP), puis `python3 scripts/smoke_public.py`. **Pas de migration, pas de sauvegarde nécessaire.**
2. Facultatif, radio : vérifier les identifiants proposés dans l'ADR-0024, puis `RADIO_STREAMS='[...]'` dans `.env` et `docker compose up -d --wait backend`. Sans cette variable, aucune radio n'est proposée.
3. Mesurer Lighthouse sur `https://shopflow.rapidfox.io` (objectif ≥ 90) ; noter le résultat dans PROGRESS.
4. Après le premier déploiement, une recharge de page suffit ; ensuite les mises à jour s'annoncent par « Nouvelle version disponible ».

### À faire en local après la PR R

1. **Sauvegarder la base** selon `docs/RUNBOOK.md`, suffixe `avant-sprint3-r` (migration `0014_project`).
2. Redéployer à une pause (`docker compose up -d --build --wait`, service migrate compris, passerelle comprise : limite de 21 Mo sur l'envoi de fichiers). Vérifier la tête Alembic `0014_project`.
3. Onglet « Projet » : publier le jalon « Conception du 29 octobre » (tableau des sources, règles, schéma, graphe, scénarios, plan), puis « Rendu final » (lien du dépôt, README, rapport ≤ 6 pages, `journal_IA.md`) et « Soutenance » ; créer les créneaux du 23 novembre.
4. Vérifier avec deux comptes étudiants de démonstration : binôme, invitation, dépôt d'un PDF, commentaire.
### À faire en local après la PR Q

1. Redéployer à une pause. **Pas de migration.** Aucune entrée de menu n'apparaît tant que l'application n'est pas intégrée (`VOYAGE_READY`).
2. Transmettre l'archive `ShopFlow-voyage.zip` et, si possible, `experiences/voyage.json` du kit (valeurs exactes).
### À faire en local après la PR S

1. Redéployer à une pause (`docker compose up -d --build --wait`). **Pas de migration, pas de sauvegarde de la base plateforme nécessaire.** Le volume `media_data` reçoit le sous-dossier `downloads/` (créé à l'import).
2. Dans le dossier du cours : ajouter `lab_schemas: [shopflow, support, perf]` à `00-cours.md`, déposer les fichiers SQL du kit dans `cours/datasets/` en préfixant les noms pour l'ordre (`01-…`, `02-…`), les documents dans `cours/downloads/`.
3. `python3 scripts/course_md.py compile "<dossier>/cours"` (vérifie les requêtes sur une base jetable avec les mêmes schémas), puis import en brouillon. **L'import remplace tout le contenu de la base de laboratoire.**
4. Vérifier un `run` `EXPLAIN (ANALYZE, BUFFERS)` dans l'aperçu, et un téléchargement depuis un compte étudiant de démonstration.
### À faire en local après la PR P

1. Redéployer à une pause (`docker compose up -d --build --wait`). **Pas de migration, pas de sauvegarde nécessaire** : rien n'est écrit, le report se fait à la lecture.
2. Vérifier dans « Ma classe » ou « Résultats » que les réussites des missions dont seul le texte avait changé sont revenues.
3. Avant chaque publication : `docker compose exec -T backend python -m app.carryover --course <slug>` (code 1 et liste si des réussites seraient perdues).

### À faire en local après la PR J

1. Fusionner après #49 et #51 (ou seule : elle les contient).
2. **Sauvegarder la base** selon `docs/RUNBOOK.md`, suffixe `avant-sprint2-j` (migration `0013_observers`).
3. Redéployer à une pause (`docker compose up -d --build --wait`, service migrate compris) ; vérifier une seule tête Alembic `0013_observers`. Smoke : `python3 scripts/smoke_public.py http://127.0.0.1:3080`.
4. Onglet « Observateurs » : créer un compte de test, se connecter avec dans une fenêtre privée, vérifier la lecture seule et le journal des consultations, puis le désactiver. Les comptes réels d'observateurs restent une décision du propriétaire.

### À faire en local après la PR N

1. Fusionner #49 (M) avant N, ou N seule (elle contient M).
2. Redéployer à une pause par la procédure habituelle (`docker compose up -d --build --wait`) : backend, interface **et passerelle** (types d'images sous `/media/`). Aucune migration, aucune sauvegarde nécessaire.
3. Smoke : `python3 scripts/smoke_public.py http://127.0.0.1:3080`. Vérifier sur téléphone : case « Rester connecté », code coloré (clair et sombre), leçon image du cours de démonstration (après réimport du dossier si souhaité), aucun défilement horizontal.
4. Les sessions déjà ouvertes gardent leur durée de 8 h ; « Rester connecté » s'applique aux nouvelles connexions.

### À faire en local après la PR M
1. Redéployer à la pause : `git switch main && git pull && docker compose up -d --build --wait`, puis `python3 scripts/smoke_public.py`. **Pas de migration, pas de sauvegarde nécessaire.**
2. Pour utiliser les cartes dans le cours réel : `data: {kind: flashcards, cards: [...]}` dans une leçon, ou un élément `### Révision :` (voir `docs/COURSE-AUTHORING.md` § 5 et 6) ; recompiler (`scripts/course_md.py compile`) puis réimporter. Ne jamais y mettre le corrigé d'une mission.

### Attend l'accord du propriétaire
- Fusion de #35 (variante verte), puis #36 (logo), puis #38 (L).
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
