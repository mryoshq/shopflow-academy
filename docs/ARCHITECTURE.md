# Architecture cible ShopFlow Academy — plateforme indépendante des cours

## Déploiement retenu

```text
10 étudiants Windows + enseignant Mac (navigateur)
  └─ HTTPS shopflow.rapidfox.io
     └─ Cloudflare Tunnel [existant partagé seulement si même hôte, sinon tunnel Academy dédié]
        └─ Mac Academy, cloudflared → 127.0.0.1:3080
           └─ Docker Compose gateway [bind local uniquement]
              ├── /             React / TypeScript SPA
              └── /api/v1       FastAPI / Pydantic / SQLAlchemy / Alembic
                                  ├── PostgreSQL [utilisateurs, contenu, notes, audit]
                                  ├── MySQL [labs SQL en profil Compose facultatif]
                                  ├── TutorProvider [none par défaut]
                                  └── Adaptateurs de simulations futures
```

La route `n8n.rapidfox.io` est hors périmètre technique : ne pas la modifier. Le tunnel HTTP ne dispense pas d'une auth applicative. Nulle exposition directe de Postgres/MySQL. Un seul hostname web/API, pas de CORS multi-origine sans nécessité.

## Modules backend

`identity`, `authorization`, `cohorts`, `curriculum`, `course_studio`, `publication`, `assignments`, `mission_player`, `grading`, `progress`, `teacher_dashboard`, `analytics`, `audit`, `resource_catalog`, `tutor`, `labs`, `health`. Favoriser un monolithe modulaire et des migrations testées, non des microservices avant besoin.

Séparer les **DTO admin** complets des **DTO étudiant** expurgés de corrigés. Écrire schémas Pydantic et APIs publiques cohérents avant les écrans. Aucune règle de scoring déterminante côté React ; l'IA n'attribue pas de score.

## Cycle de contenu et édition

```text
Enseignant crée un brouillon → modifie cours/modules/missions
  → prévisualisation NON NOTÉE → validation schéma/objectifs/barème
  → publication version figée → assignation à une cohorte
  → lecteur étudiant → soumission idempotente → correction serveur
  → événement de score/progression → dashboard enseignant
  → nouvelle révision éventuelle = NOUVELLE VERSION, ancien score conservé
```

Ne pas implémenter chaque exercice comme composant React spécifique. Utiliser un registre de **types d'activité** (`single_choice`, `multiple_choice`, `reorder`, `matching`, `data_interpretation`, `scenario_choice`, `guided_simulation`). Le frontend décide uniquement comment afficher une définition étudiante. Le backend valide l'édition et applique la règle de correction privée. Import/export JSON versionné avec validation stricte, refus HTML/script dangereux et de fonctions fournies par auteur.

## Données proposées

`users(id, username, password_hash, role, locale, enabled, created_at)`
`cohorts(id, label)`, `enrollments(cohort_id, user_id)`
`courses(id, slug, title, status)`, `course_releases(id, course_id, version, status, published_at, snapshot_hash)`
`modules(id, course_id, title, sort_order)`, `chapters(id, module_id, title, sort_order)`
`objectives(id, axis, statement)`, `missions(id, chapter_id, slug)`
`mission_versions(id, mission_id, version, definition_private_json, student_projection_json, points, state)`
`assignments(id, cohort_id, course_release_id)`, `class_sessions(id, cohort_id, state, current_mission_id)`
`attempts(id, user_id, mission_version_id, idempotency_key, answer_json, points, feedback_code, created_at)`
`progress(user_id, mission_version_id, best_points, state, updated_at)`, `score_events(id, attempt_id, delta, recorded_at)`
`audit_events(actor_id, action, resource_id, payload_redacted, created_at)`, `teacher_actions(...)`, `ai_interactions(...)`.

Ne pas dupliquer inutilement les données publication `release` et `version` : choisir une représentation concrète, documenter invariants, clés et transitions. Enregistrer les tentatives contre **une version immuable**, éviter tout cumul double malgré retry/requête parallèle. Ne pas confondre espace logique par élève et conteneur individuel.

## API minimales (propositions à formaliser en OpenAPI)

- `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
- Étudiant : `GET /api/v1/student/dashboard`, `/courses`, `/missions/{id}` ; `POST /missions/{id}/attempts`, `POST /missions/{id}/hint`.
- Enseignant : CRUD `/api/v1/teacher/courses`, `/modules`, `/chapters`, `/missions` ; `POST /missions/{id}/preview`, `/publish`, `/archive` ; import/export de cours JSON et assignation aux cohortes.
- Classe : `GET /api/v1/teacher/overview`, `/students/{id}`, `/export/scores.csv` ; `POST /api/v1/teacher/sessions/{id}/open|pause|resume|unlock`.
- Santé : `GET /health/live`, `/health/ready` (exposer via gateway de façon contrôlée).

La méthode HTTP, version de schéma, erreurs et statut auth doivent être définis et testés. Polling ~5-10s ou SSE pour classe (mesurer charge/latence sur 10 clients).

## Frontières de confiance

| Source | Acceptée ? | Protection |
|---|---|---|
| Navigateur étudiant | Non fiable | Auth serveur + RBAC + authorization objet, contrôle taille/type/rate-limit |
| Définition éditée par enseignant | À valider | Schéma typé, sanitation, publication immuable, audit |
| JSON importé | Non fiable | Parse borné, validation/version/schema, pas de code exécuté |
| Textes ressources et IA | Non fiable | Sanitizer HTML, prompt injection, aucun corrigé ni PII côté LLM |
| SQL libre bonus | Haut risque | Service séparé, DB lecture seule, AST, timeout, limites et tests |
| Python libre bonus | Très haut risque | Pas de `exec` dans FastAPI ni sur Mac ; runner isolé dédié ultérieur |
| Cloudflare Tunnel | Transport seulement | Auth applicative, cookies, CSRF, origine proxy de confiance, pas de DB publique |

## Contrat d'assistant IA (optionnel)

`TutorRequest { user_id, mission_version_id, locale, help_mode, student_question, safe_context }`
`TutorResponse { answer, provider, model_alias, tokens_in?, tokens_out?, blocked_reason? }`

`AI_PROVIDER=none` par défaut, `OpenRouter` facultatif sans contact du navigateur direct. Indices statiques disponibles à toute heure. Ne jamais transmettre les réponses privées au modèle, conserver coûts et traces sans PII.

## Stratégie de livraison

**P0 = produit d'administration et d'apprentissage générique** fonctionnel, validé avec trois missions de démonstration. **P1 = extras/IA/labs préprogrammés. P2 = insertion du contenu réel** du cours et intégrations des axes. GitHub Actions passe des tests documentaires initiaux à `pytest`, `Vitest`, `Playwright`, migration et charge; la CI initiale ne prouve pas que l'app existe.

Cloudflare est le **seul** mode public cible, Docker Compose sur Mac le seul mode d'exécution hôte initial. Voir `docs/DEPLOY-RAPIDFOX.md` pour le routage conditionné à l'emplacement réel de n8n et cloudflared.
