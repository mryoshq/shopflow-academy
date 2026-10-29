# ADR-0032 — Laboratoire SQL multi-schémas et fichiers à télécharger

- Statut : accepté (29/10/2026)
- Contexte : sprint 3, partie S. Le kit de l'axe 1 utilise plusieurs schémas (`shopflow`, `support`, `perf`), des tables indexées ou partitionnées pour comparer des plans, et des documents à remettre aux étudiants.

## Décision

### Laboratoire
- L'en-tête du cours déclare ses schémas : `lab_schemas: [shopflow, support, perf]` (8 au plus, identifiants minuscules, ni `public`, ni `lab`, ni `pg_…`). Le cours fournit un ou plusieurs `datasets/*.sql`, exécutés **dans l'ordre des noms**, en une seule transaction, avec le rôle `lab_owner` (non superutilisateur) :
  - avant le chargement, tous les schémas possédés par `lab_owner` sont supprimés, puis `lab` est recréé ;
  - un schéma créé mais non déclaré refuse tout le jeu de données (rien n'est changé) ;
  - `lab_reader` reçoit `USAGE` et `SELECT` sur `lab` et les schémas déclarés **seulement** ;
  - le chemin de recherche (`lab`, puis les schémas déclarés ; révisé le 29 octobre : une table du kit de même nom masquait la table du cours dans `lab`) est enregistré en commentaire du schéma `lab`.
- **Liste blanche sans migration** : le serveur lit, avec `lab_reader`, les tables qu'il peut lire (`information_schema.tables`) et ce chemin. Les deux sont mis en cache 30 s. `run` et `sql_challenge` ont les mêmes protections qu'avant :
  - une seule requête `SELECT` / `WITH` / `EXPLAIN`, analysée par sqlglot, avec une liste de fonctions permises ;
  - chaque table doit être lisible : qualifiée (`support.tickets`) ou résolue par le chemin ;
  - transaction READ ONLY toujours annulée, 3 s, 200 lignes.
- `EXPLAIN` accepte les options `ANALYZE`, `BUFFERS`, `COSTS`, `VERBOSE`, `TIMING`, `SUMMARY`, `SETTINGS`, `WAL` (pas `FORMAT`). Le plan s'affiche en texte indenté.
- Index et partitions : seuls les fichiers du cours peuvent en créer. Les étudiants ne le peuvent pas : refus par l'analyseur, et le rôle n'a ni CREATE ni propriété.
- Vérification sur le Mac (`scripts/course_md.py`) : les fichiers sont chargés dans le même ordre dans la base jetable, et les requêtes y sont vérifiées avec le même chemin de recherche.

### Fichiers à télécharger
- Nouveau `data.kind: download` : 1 à 10 fichiers `{file: downloads/<nom>, title}`.
  - Formats acceptés : pdf, docx, zip, csv, sql, py, md, 20 Mo au plus. La signature (PDF, ZIP/DOCX) ou l'encodage UTF-8 est vérifié.
  - Le compilateur remplace chaque fichier par `{id: <sha256 16>.<ext>, name, title, size}`.
- Copie à l'import dans `/srv/media/downloads/` : même volume que les médias, sous-dossier jamais servi par la passerelle (seuls `/media/<sha>.<ext>` de premier niveau le sont).
- Route `GET /api/v1/downloads/{id}` : utilisateur connecté requis.
  - Un étudiant reçoit le fichier si une version attribuée à l'une de ses classes le contient ; l'enseignant, si l'un de ses cours (brouillon ou version) le contient. Sinon 404, et 403 pour un observateur.
  - Le fichier est toujours envoyé en pièce jointe, avec `Cache-Control: private, no-store`, `nosniff` et `CSP sandbox`.

## Conséquences
- Pas de migration de la base plateforme.
- Au premier import d'un cours qui déclare des schémas, le laboratoire est entièrement remplacé par ses données (comme avant pour `lab`).
- Le kit de l'axe 1 se dépose tel quel dans `cours/datasets/`, en préfixant les noms de fichiers pour fixer l'ordre.
