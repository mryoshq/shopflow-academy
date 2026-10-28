# ADR-0011 — Lecteur étudiant et frontière P0-05 / P0-06

**Date :** 2026-10-28
**Statut :** accepté (option A, choisie en l'absence du propriétaire comme l'option recommandée par le prompt de reprise)

## Contexte

« Tester ma décision » doit renvoyer un feedback calculé côté serveur (CPS D2/D3), alors que score, best score et progression notée relèvent de P0-06. Deux options : (A) contrat définitif de tentatives persistées dès P0-05 ; (B) vérification sans persistance, tentatives en P0-06.

## Décision — option A

- `POST /api/v1/student/missions/{mission_version_id}/attempts` : session + CSRF + rôle étudiant ; la version doit appartenir à une version de cours publiée, attribuée à une cohorte de l'étudiant, d'un cours non archivé ; mission non verrouillée.
- Corps : `{idempotency_key, answer: {choice_ids | pairs}}`. Contrainte unique `(user_id, idempotency_key)` : un double clic, une relance réseau ou des requêtes concurrentes renvoient la même tentative (`replayed: true`). Une clé réutilisée pour une autre mission → 409.
- Évaluation déterministe (`app/grading.py`) sur la définition privée de la **version exacte** ; table `mission_attempts` en ajout seul (aucune route de modification ni de suppression).
- Réponse : `correct`, feedback des seuls choix sélectionnés, explication révélée si la réponse est juste ou après 3 essais, nombre d'essais. **Jamais** `correct_ids`, `correct_pairs`, barème ni action privée.
- Identifiants de choix opaques par version (HMAC) et ordre mélangé (`app/projection.py`), pour que l'ordre ou les identifiants ne trahissent pas la réponse ; la correspondance est recalculée à la notation.
- Indices progressifs : retirés de la projection (`hint_count` seulement), révélés un par un par `POST …/hints`, mémorisés dans `hint_reveals` (état « indice déjà consulté »), sans impact de note en P0-05.
- Verrouillage : une mission dont un prérequis n'a pas de tentative réussie est « verrouillée » (contenu non envoyé, tentatives et indices refusés en 409).
- Limitation : 20 tentatives par minute et par étudiant (429).
- P0-06 ajoutera score, best score, bonus et historique **en lisant ces tentatives**, sans changer le contrat.

## Conséquences

Le contrat est stable et chaque essai est tracé dès maintenant. Le tableau de bord affiche « Missions réussies » (donnée réelle) et un emplacement « Score et progression détaillée : bientôt disponibles ». Les mêmes règles s'appliquent aux anciennes versions publiées grâce au filtrage à la lecture.
