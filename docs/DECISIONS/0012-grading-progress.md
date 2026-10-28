# ADR-0012 — Notation déterministe et progression dérivée du journal des tentatives

**Date :** 2026-10-28
**Statut :** accepté pour P0-06

## Décision

- **Points par tentative** calculés à l'insertion par `app.grading.score(definition, answer)`, fonction pure de la définition publiée immuable et de la réponse stockée (identifiants auteurs). Colonne `mission_attempts.points` (migration 0005) ; les tentatives antérieures (P0-05) valent `max_points` si justes, 0 sinon.
- **Barème par mission** (`scoring`) : `all_or_nothing` par défaut ; `partial` autorisé pour choix multiple (bonnes − mauvaises sélections, plancher 0), ordre (positions justes), association (paires justes). Réglable dans le studio sans code.
- **Meilleur score conservé** : `max(points)` des tentatives de l'étudiant sur la version ; « réussie » = au moins une tentative entièrement juste.
- **Aucun cache** : scores, progression et totaux de cours sont recalculés à chaque lecture depuis le journal en ajout seul. Un double clic, une relance ou des requêtes concurrentes (même clé d'idempotence) ne créent qu'une tentative, donc aucun double comptage ; tout survit au redémarrage.
- **Bonus séparés** : `core_points/core_possible` et `bonus_points/bonus_possible` distincts ; un bonus ne pénalise jamais.
- **Rejouable** : `app.progress.replay(db)` re-note toutes les tentatives et liste les écarts (vide attendu, testé).
- **Visibilité** : l'étudiant voit les points possibles d'une mission (barème publié) et ses propres points ; jamais les réponses attendues, le mode de barème ni la clé de correction.
- **Historique** : `GET /api/v1/student/missions/{id}/attempts`, ses propres essais uniquement (date, réussite, points), sans écho de réponse.
- **Limitation** : 20 tentatives par minute et par étudiant (429), observée en conditions réelles lors d'exécutions E2E enchaînées.
- L'aperçu enseignant n'attribue aucun point : l'enseignant ne peut pas créer de tentative (403).

## Conséquences

Le dashboard enseignant (P0-07) lit les mêmes fonctions (`mission_scores`, `course_score`). Une correction manuelle motivée par l'enseignant devra s'ajouter comme événement distinct, jamais en modifiant une tentative.
