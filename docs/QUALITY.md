# Qualité et preuves — ShopFlow Academy (P0-09)

Toutes les commandes s'exécutent depuis `~/Developer/shopflow-academy`. Depuis le 28/10/2026, E2E, charge et persistance tournent **uniquement sur la stack de test** (`python3 scripts/test_stack.py up` : projet `shopflow-academy-test`, `127.0.0.1:3180`, base jetable, comptes fictifs dans `.local/test-stack-credentials.json`, jamais affichés) ; les scripts et Playwright refusent une adresse de production. Voir `docs/RUNBOOK.md` § Tests et ADR-0016.

| Niveau | Commande | Couverture | Résultat (28/10/2026) |
|---|---|---|---|
| API | `cd backend && ../.venv/bin/python -m pytest -q` | auth, CSRF, rôles, IDOR, projection sans corrigé (parcours récursif), chaque type d'activité, idempotence, verrouillage, indices, barème, meilleur score, bonus, rejeu, pause/déblocage/export, import/export, **matrice d'autorisation générée depuis toutes les routes** (anonyme 401, mauvais rôle 403, CSRF sur toute écriture) | 62 PASS (dont propriété des cours : chaque route visant un objet de cours répond 404 à un autre enseignant, et politique de comptes) |
| Composants | `cd frontend && npm run test -- --maxWorkers=1` | activités clavier, états du lecteur, tableau de bord, suivi de classe, import | 25 PASS |
| Navigateur | `cd frontend && npm run test:e2e` | studio ; 3 démos **au clavier seul** 1366×768 ; isolation, coupure réseau, concurrence ; état vide ; meilleur score/historique ; suivi de classe (latence) ; import/export ; **parcours complet enseignant→étudiant→note persistante→autre compte isolé** ; axe-core WCAG A/AA sans violation sérieuse | 9 PASS |
| Charge | `python3 scripts/load_test.py` | 10 étudiants simultanés + enseignant qui actualise : 270 requêtes, double envoi même clé | 0 erreur, 0 doublon ; p95 de chaque requête ≤ 1,5 s, connexion ≤ 3 s (Argon2, 11 connexions simultanées, une fois par session de 30 jours) |
| Persistance | `python3 scripts/persistence_check.py` | état de 3 étudiants avant/après `restart` puis `up --force-recreate` (volume conservé) | identique PASS |
| Exploitation | `python3 scripts/smoke_public.py [URL]` | page, CSP, santé, OpenAPI masqué, connexion du propriétaire, compte de démo refusé, cookies `__Host-` Secure/HttpOnly, 403 sur l'API de l'autre rôle, origine refusée, n8n inchangé (URL publique) | **16/16 URL publique**, 14/14 gateway de production, 11/11 stack de test |
| Kit | `python3 scripts/verify_kit.py` | documentation et liens de skills | PASS |

La CI GitHub (`.github/workflows/app-ci.yml`) démarre la stack de test avec la même commande que sur le Mac (`scripts/test_stack.py up`) puis exécute Playwright (un worker : base partagée), le test de charge, la persistance et la restauration (`--test-stack`), en plus de pytest, Vitest, build et Compose.

**Matrice d'autorisation par rôle (ADR-0025, ADR-0042)**, générée depuis toutes les routes par `backend/tests/test_security_matrix.py` :

| Routes | Anonyme | Étudiant | Enseignant | Observateur |
|---|---|---|---|---|
| `POST /auth/login`, `GET /status` | oui | oui | oui | oui |
| `GET /invitations/{jeton}`, `POST /invitations/{jeton}/accept` (ADR-0042) | oui (jeton valide, une fois, 7 jours) | oui | oui | oui |
| `GET /auth/me`, `POST /auth/logout` | 401 | oui | oui | oui (seule écriture) |
| présence, notifications, Web Push, radio | 401 | oui (les siennes) | oui (les siennes) | 403 |
| `/student/...` | 401 | oui (ses données) | 403 | 403 |
| `/teacher/...` | 401 | 403 | oui (ses cours, sinon 404) | 403 |
| `GET /observer/...` | 401 | 403 | 403 | oui (classes de son enseignant, sinon 404) ; notes, fiche, CSV, PDF et projet réservés au type « Administration » (403 pour « Invité ») |
| toute écriture sans jeton CSRF | 401 | 403 | 403 | 403 |

**Latence du suivi enseignant** mesurée en E2E (essai étudiant → cellule mise à jour chez l'enseignant, sans rechargement) : 4,39 à 4,41 s sur 6 mesures, cible ≤ 10 s.

**Fiabilité E2E (28/10/2026)** : l'échec intermittent observé la nuit venait du contrôle axe-core, qui mesurait un bouton pendant sa transition de désactivé à actif ; le contrôle attend maintenant la fin des animations.

**Limites connues** : tests de charge sur le Mac local (pas à travers Cloudflare) ; la limitation de 20 essais/min/étudiant peut faire échouer des exécutions E2E enchaînées en moins d'une minute (comportement voulu) ; aucun test sur Safari/Edge réels (Chromium seulement).
