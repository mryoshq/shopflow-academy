# Intégration des PR empilées

## État au 28/10/2026 : pile P0 intégrée

Fusion autorisée par le propriétaire (sprint 2, étape 0), faite le 28/10/2026 en **merge commit** (`gh pr merge N --merge`), sans squash, rebase, force-push ni suppression de branche.

| Ordre | PR | Branche | Lot |
|---:|---|---|---|
| 1 | [#11](https://github.com/mryoshq/shopflow-academy/pull/11) | `feat/p0-01-foundation` | P0-01, ferme #1 |
| 2 | [#12](https://github.com/mryoshq/shopflow-academy/pull/12) | `feat/p0-02-auth-rbac` | P0-02, ferme #2 |
| 3 | [#13](https://github.com/mryoshq/shopflow-academy/pull/13) | `feat/p0-03-curriculum-model` | P0-03, ferme #3 |
| 4 | [#14](https://github.com/mryoshq/shopflow-academy/pull/14) | `feat/p0-04-course-studio` | P0-04, ferme #4 |
| 5 | [#15](https://github.com/mryoshq/shopflow-academy/pull/15) | `ops/publication-shopflow` | préparation de la publication |
| 6 | [#17](https://github.com/mryoshq/shopflow-academy/pull/17) | `fix/revue-p0-01-04` | correctifs de revue P0-01 à P0-04 |
| 7 | [#18](https://github.com/mryoshq/shopflow-academy/pull/18) | `feat/p0-05-student-player` | P0-05, ferme #5 |
| 8 | [#19](https://github.com/mryoshq/shopflow-academy/pull/19) | `feat/p0-06-grading-progress` | P0-06, ferme #6 |
| 9 | [#20](https://github.com/mryoshq/shopflow-academy/pull/20) | `feat/p0-07-teacher-dashboard` | P0-07, ferme #7 |
| 10 | [#21](https://github.com/mryoshq/shopflow-academy/pull/21) | `feat/p0-08-content-admin` | P0-08, ferme #8 |
| 11 | [#22](https://github.com/mryoshq/shopflow-academy/pull/22) | `feat/p0-09-quality` | P0-09, ferme #9 |
| 12 | [#23](https://github.com/mryoshq/shopflow-academy/pull/23) | `feat/p0-10-operations` | P0-10 (partie exploitation) |
| 13 | [#24](https://github.com/mryoshq/shopflow-academy/pull/24) | `feat/p0-10-owner-decisions` | P0-10 terminé, ferme #10 |
| 14 | [#16](https://github.com/mryoshq/shopflow-academy/pull/16) | `chore/claude-code-setup` | configuration Claude Code (mise à jour par `git merge main`, conflit `.gitignore` résolu en gardant les deux côtés) |

Contrôles :

- Avant chaque fusion : base changée vers `main`, `gh pr checks N --watch` vert, `gh pr diff N --name-only` relu.
- Après : CI de `main` verte sur `2416601` (Academy foundation et Kit integrity), issues #1 à #10 fermées.
- Production redéployée depuis `main` (aucune migration nouvelle, donc pas de sauvegarde manuelle requise) : `python3 scripts/smoke_public.py http://127.0.0.1:3080` 14/14 PASS, `python3 scripts/smoke_public.py` 16/16 PASS, n8n inchangé.

Tag proposé, **non créé** : `v1.0.0` sur le commit de fusion de #16 (`2416601`), à créer par le propriétaire ou sur son accord :

```bash
git tag -a v1.0.0 2416601 -m "ShopFlow Academy P0 complet" && git push origin v1.0.0
```

## Règle pour la suite (sprint 2)

Tout part de `main`, une PR par partie (A à E), fusionnée **après CI verte** en merge commit (autorisé par le propriétaire pour ce sprint). Après chaque fusion : sauvegarde manuelle si migration, redéploiement de la production depuis `main`, `python3 scripts/smoke_public.py`.

Le dépôt étant public, contrôler à chaque PR les fichiers suivis : aucune adresse personnelle, aucun mot de passe, jeton, `.env` ou contenu définitif de cours (le cours et ses corrigés vivent dans le dépôt **privé** `mryoshq/shopflow-courses`).
