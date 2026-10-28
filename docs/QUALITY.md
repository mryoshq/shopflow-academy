# Qualité et preuves — ShopFlow Academy (P0-09)

Toutes les commandes s'exécutent depuis `~/Developer/shopflow-academy`, stack lancée (`docker compose up -d --build --wait`), comptes **fictifs** `demo.*` uniquement (`.local/demo-credentials.json`, jamais affiché) et cours de démonstration installé (`docker compose exec -T backend python -m app.demo_course`).

| Niveau | Commande | Couverture | Résultat (28/10/2026) |
|---|---|---|---|
| API | `cd backend && ../.venv/bin/python -m pytest -q` | auth, CSRF, rôles, IDOR, projection sans corrigé (parcours récursif), chaque type d'activité, idempotence, verrouillage, indices, barème, meilleur score, bonus, rejeu, pause/déblocage/export, import/export, **matrice d'autorisation générée depuis toutes les routes** (anonyme 401, mauvais rôle 403, CSRF sur toute écriture) | 56 PASS |
| Composants | `cd frontend && npm run test -- --maxWorkers=1` | activités clavier, états du lecteur, tableau de bord, suivi de classe, import | 25 PASS |
| Navigateur | `cd frontend && npm run test:e2e` | studio ; 3 démos **au clavier seul** 1366×768 ; isolation, coupure réseau, concurrence ; état vide ; meilleur score/historique ; suivi de classe (latence) ; import/export ; **parcours complet enseignant→étudiant→note persistante→autre compte isolé** ; axe-core WCAG A/AA sans violation sérieuse | 9 PASS |
| Charge | `python3 scripts/load_test.py` | 10 étudiants simultanés + enseignant qui actualise : 270 requêtes, double envoi même clé | 0 erreur, 0 doublon, p95 max 255-292 ms (connexion Argon2) |
| Persistance | `python3 scripts/persistence_check.py` | état de 3 étudiants avant/après `restart` puis `up --force-recreate` (volume conservé) | identique PASS |
| Exploitation | `python3 scripts/smoke_public.py [URL]` | page, CSP, santé, OpenAPI masqué, cookies `__Host-` Secure/HttpOnly, 403 étudiant, origine refusée, n8n inchangé (URL publique) | 13/13 local |
| Kit | `python3 scripts/verify_kit.py` | documentation et liens de skills | PASS |

La CI GitHub (`.github/workflows/app-ci.yml`) exécute pytest, Vitest, build, Compose, Playwright (un worker : base partagée), le test de charge et la vérification de persistance sur une base neuve.

**Latence du suivi enseignant** mesurée en E2E (essai étudiant → cellule mise à jour chez l'enseignant, sans rechargement) : 4,39 à 4,41 s sur 6 mesures, cible ≤ 10 s.

**Limites connues** : tests de charge sur le Mac local (pas à travers Cloudflare) ; la limitation de 20 essais/min/étudiant peut faire échouer des exécutions E2E enchaînées en moins d'une minute (comportement voulu) ; aucun test sur Safari/Edge réels (Chromium seulement).
