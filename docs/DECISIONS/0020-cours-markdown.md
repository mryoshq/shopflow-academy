# ADR-0020 — Chaîne d'import du cours écrit en Markdown

**Date :** 2026-10-28
**Statut :** accepté (sprint 2, partie D)

## Contexte

Le cours réel est rédigé par un autre agent dans un dossier local du Mac (format `shopflow-course-md`, `docs/COURSE-AUTHORING.md`), jamais sur GitHub : il contient les corrigés. La plateforme doit le valider, renvoyer des erreurs exploitables par l'auteur, l'importer en brouillon, puis publier de nouvelles versions sans faire perdre aux étudiants leur progression.

## Décision

- **Compilateur** `backend/app/course_md.py` (PyYAML `safe_load`, aucune exécution de contenu) : lit les `.md` dans l'ordre des noms, numérote chaque champ YAML pour signaler les erreurs **en français, avec fichier et ligne**, produit un résumé par module et par bloc et la couverture des objectifs, et convertit le tout au format portable `shopflow-course` v1 (ADR-0014), revalidé avant import.
- **Le dossier reste sur le Mac** : `scripts/course_md.py` lit les fichiers et les transmet au conteneur backend par l'entrée standard (`docker compose exec -T backend`), avec l'identité de l'enseignant lue sur l'entrée standard (`< .local/teacher-email.txt`) ; il écrit `RETOURS-PLATEFORME.md` à côté de `cours/`. Aucun montage du dossier dans un conteneur.
- **Import = mise à jour du brouillon** du cours désigné par le slug de `00-cours.md` (création s'il n'existe pas). Correspondance : modules par titre, blocs par (module, titre), missions par slug. Une mission déjà publiée ne peut pas disparaître du source (refus). Rien n'est publié, aucun bloc n'est ouvert.
- **Publication conservant la progression** : `publish_course` réutilise la dernière version d'une mission dont la définition (normalisée) est identique. Les tentatives, meilleurs scores et états « réussie » de ces missions restent donc valables dans la nouvelle version ; une mission modifiée reçoit une nouvelle version. Avec `--publish`, le cours principal est donné à la classe (attribution déplacée, ADR-0019) et les nouveaux blocs arrivent fermés.
- **Nouveaux contenus** : `lesson` (non notée, « J'ai compris » = tentative idempotente à 0 point, compte dans la progression), affichages `line_chart`, `code`, `comparison`, `table.title`, champ `run` (SQL ou Python préconfiguré) et type `sql_challenge` : schéma et stockage maintenant, exécution en partie C. La projection étudiante exclut `correct_ids`, `correct_pairs`, `feedback`, `explanation`, `expected_sql`, `compare`, les sorties Python ; test récursif sur les réponses JSON.
- **Introduction de module** : colonne `course_modules.description` (migration 0008).
- **Studio** : les activités qui utilisent ces éléments se modifient dans le source Markdown (le formulaire du studio reste pour les activités à choix).

## Conséquences

- L'agent qui rédige dispose d'une boucle courte : compiler, lire `RETOURS-PLATEFORME.md`, corriger.
- Le cours de démonstration Markdown (`docs/examples/demo-course/`) est compilé par pytest et importé sur la stack de test en CI ; un E2E le fait jouer.
- Sauvegarde du dossier : copie datée et dépôt privé, voir le skill `course-import`.
