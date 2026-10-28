# ADR-0017 — Exécution de code préconfiguré et défi SQL

**Date :** 2026-10-28
**Statut :** accepté (sprint 2, partie C)

## Contexte

Certaines missions doivent montrer le **vrai résultat** d'une requête SQL ou d'un extrait Python, et un défi bonus doit laisser l'étudiant écrire une requête. Contraintes : aucune base de la plateforme accessible au code des étudiants ; **jamais de Python dans FastAPI ni directement sur le Mac** ; production sur le Mac de l'enseignant.

## Décision

1. **Base de laboratoire** `labdb` (PostgreSQL 16) : réseau Compose interne dédié `lab` (seul le backend y est relié, en plus de son réseau privé), aucun port publié, volume `lab_data`, identifiants distincts (`LAB_POSTGRES_PASSWORD`, `LAB_OWNER_PASSWORD`, `LAB_READER_PASSWORD`). Service ponctuel `lab-init` (`python -m app.lab init`, idempotent) : rôle `lab_owner` (propriétaire du schéma `lab`, pas superutilisateur) et rôle `lab_reader` (SELECT sur `lab` seulement, `default_transaction_read_only`, `statement_timeout` 3 s, `work_mem` 4 Mo, `temp_file_limit` 16 Mo, 20 connexions, `pg_sleep` retiré à PUBLIC). Jeu fictif de démonstration chargé si le schéma est vide ; à l'import du cours, `datasets/shopflow-lab.sql` remplace le contenu du schéma (une transaction, rôle `lab_owner`). Le MySQL du profil `labs` reste **inutilisé**.
2. **`run` SQL** : `POST /student/missions/{id}/runs/{run_id}` exécute **uniquement** la requête stockée dans la mission publiée (recherchée par `id`, jamais un texte du navigateur), avec `lab_reader`, dans une transaction READ ONLY toujours annulée, 200 lignes au plus, cellules bornées ; 30 exécutions par minute et par étudiant. `EXPLAIN ANALYZE` permis. Le propriétaire du cours peut essayer une requête du brouillon (`POST /teacher/missions/{id}/runs/{run_id}`).
3. **`sql_challenge`** (bonus) : `POST /student/missions/{id}/sql`. Contrôle `sqlglot` (dialecte PostgreSQL) : une seule instruction ; SELECT, WITH … SELECT, opérations ensemblistes ou `EXPLAIN [ANALYZE]` d'un SELECT ; aucun nœud d'écriture ou de commande **n'importe où dans l'arbre** (un `WITH x AS (DELETE …) SELECT` est refusé) ; ni `INTO`, ni `FOR UPDATE` ; fonctions « anonymes » sur liste blanche, liste noire `pg_*`, `lo_*`, `dblink`, `set_config`, `current_setting`… ; tables du schéma `lab` (ou CTE) seulement. Puis exécution avec `lab_reader` ; correction déterministe en comparant le résultat à celui d'`expected_sql` (privé, exécuté côté serveur) selon `compare` (`rows`, `rows_unordered`, `scalar`) ; tentative en ajout seul, idempotente, notée tout ou rien, comptée en bonus. Une batterie de 38 contournements est testée ; les protections de la base (rôle) sont aussi testées **sans** le contrôle (écriture, `COMMIT; SET … READ WRITE`, catalogues, fichiers, sommeil, délai, fichiers temporaires). Interrupteur `SQL_CHALLENGE_ENABLED` (activé : la batterie passe).
4. **`run` Python** : exécuté **une seule fois, sur le Mac, à la compilation/import** par `scripts/course_md.py`, dans un conteneur jetable (`runner/python` : Python 3.12 + pandas 2.2.3) lancé avec `--network none --read-only --tmpfs /tmp --user 10001 --cap-drop ALL --security-opt no-new-privileges --memory 256m --cpus 0.5 --pids-limit 64`, 20 s au plus, `datasets/python/` monté en lecture seule comme répertoire de travail. La sortie (≤ 20 000 caractères) est stockée dans la définition ; l'étudiant voit le code et clique « Exécuter » pour la révéler. Aucune exécution Python à la demande. Le backend n'a jamais accès à Docker.
5. **Le compilateur vérifie les `run`** : sur le Mac, chaque requête SQL (et l'`expected_sql`/`starter_sql` des défis) est exécutée dans un PostgreSQL 16 jetable sans réseau chargé avec le jeu du cours ; chaque extrait Python dans le conteneur ci-dessus ; les échecs sont rapportés **avec fichier et ligne** dans `RETOURS-PLATEFORME.md`.

## Conséquences

- Indisponibilité de `labdb` : les boutons « Exécuter » affichent un message (503), le reste du cours fonctionne (le backend ne dépend pas de `lab-init`).
- Le jeu de laboratoire n'est pas sauvegardé (il est rechargé à chaque import).
- Les accès à `labdb` sont journalisés par PostgreSQL au minimum ; le contenu des requêtes des étudiants est conservé dans leurs tentatives (texte, 4000 caractères au plus).
