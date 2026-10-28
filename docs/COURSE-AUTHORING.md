# Format d'écriture du cours ShopFlow — `shopflow-course-md` v1

> Spécification partagée entre l'agent plateforme (Claude Code, qui écrit le compilateur) et l'agent contenu (le LLM qui rédige le cours). À committer dans le dépôt plateforme sous `docs/COURSE-AUTHORING.md`. Ce fichier ne contient aucune réponse : il peut être public.

## 1. Organisation retenue (simple)

- **Une seule classe** (les 10 étudiants `@ynov.com`), **un seul enseignant**, **un seul cours** : « Python Data Engineering & SQL Avancé ».
- Le cours est découpé en **modules**, eux-mêmes découpés en **blocs** d'environ 15 minutes que l'enseignant **ouvre un par un** pour toute la classe (module SQL = 6 blocs, module Python = 18 blocs). Aujourd'hui : module SQL analytique, puis module(s) Python ingestion et qualité ; les axes 3 (Airflow) et 4 (NoSQL, séries temporelles) s'ajouteront plus tard comme nouveaux modules du même cours.
- **Ton amusant, jamais pénalisant** : les étudiants peuvent réessayer autant qu'ils veulent ; la note retient leur meilleure tentative. Le feedback, les indices et l'explication sont là pour apprendre, pas pour sanctionner.
- **Bonus** : chaque module peut proposer des missions bonus (défis plus difficiles, souvent avec du code à exécuter), comptées à part de la note principale.

## 2. Fichiers et chaîne de traitement

La **source** du cours est un **dossier local** sur le Mac de l'enseignant, écrit par l'agent contenu (qui n'utilise pas GitHub) :

```
<dossier du cours>/
  cours/
    00-cours.md               en-tête du cours (titre, objectifs)
    10-module-sql.md          module SQL analytique
    20-module-python.md       module Python ingestion et qualité (peut être découpé en 20-, 21-, 22-…)
    datasets/
      shopflow-lab.sql        données fictives ShopFlow chargées dans la base de laboratoire (§ 6)
      python/                 petits fichiers CSV/JSON fictifs utilisés par les extraits Python
  COVERAGE.md                 objectif → missions → points → durée
  QUESTIONS.md                points à trancher par l'enseignant
  RETOURS-PLATEFORME.md       écrit par l'agent plateforme après chaque compilation (à lire, ne pas éditer)
```

- Les fichiers contiennent les corrigés : **jamais** dans le dépôt public de la plateforme, une issue publique, un gist ou un lien partagé.
- Le compilateur lit les fichiers `.md` de `cours/` **dans l'ordre de leur nom** et les assemble en un seul cours. Il ignore `RETOURS-PLATEFORME.md`, `COVERAGE.md`, `QUESTIONS.md` et `README.md`.
- Commandes (agent plateforme, sur le Mac) : `python3 scripts/course_md.py compile "<dossier du cours>/cours"` puis `python3 scripts/course_md.py import "<dossier du cours>/cours" < .local/teacher-email.txt` (brouillon). Le rapport `RETOURS-PLATEFORME.md` est écrit dans `<dossier du cours>/` (le parent de `cours/`). Exemple complet et testé en CI : `docs/examples/demo-course/` du dépôt plateforme.
- Chaîne, quand l'enseignant annonce « le cours est prêt » : l'agent plateforme lance `scripts/course_md.py compile "<dossier du cours>/cours"` (validation, erreurs avec fichier et ligne), écrit ses retours dans `<dossier du cours>/RETOURS-PLATEFORME.md`, puis, à 0 erreur, importe **en brouillon** (`import`) → aperçu par l'enseignant → publication **sur son accord écrit seulement** → les modules s'ouvrent ensuite un par un depuis le suivi de classe.
- **Sauvegarde versionnée** : après chaque étape validée, l'agent plateforme copie `cours/` et les fichiers `.md` du dossier dans le dépôt GitHub **privé** `mryoshq/shopflow-courses`, après avoir vérifié qu'il est privé. Personne d'autre n'y pousse ; le dossier local reste la source.
- Ajouter un module plus tard = ajouter un fichier, recompiler, republier : la progression et les notes déjà obtenues sur les missions inchangées sont conservées.

## 3. Syntaxe

En-tête du cours (`00-cours.md`) :

~~~~markdown
---
format: shopflow-course-md
version: 1
slug: python-data-engineering-sql
title: Python Data Engineering & SQL Avancé
description: Vous êtes l'équipe Data de ShopFlow. Chaque module est une journée de travail.
objectives:
  - code: SQL-GRAIN
    statement: Identifier le grain d'une table avant une jointure et éviter la duplication des indicateurs.
  - code: PY-DEDUP
    statement: Détecter et traiter les doublons par clé métier.
---
~~~~

Dans les fichiers de module (un fichier peut contenir un ou plusieurs modules) :
- `# Module : <titre>` (la **première ligne** non vide en dessous est l'introduction facultative, montrée aux étudiants dès qu'un bloc du module est ouvert ; les lignes suivantes sont des notes pour l'enseignant) ;
- `## Bloc : <titre>` (ou `## Chapitre : <titre>`, synonyme) : un **bloc** d'environ 15 minutes. L'enseignant ouvre les blocs un par un pour toute la classe ; un bloc nouvellement importé arrive **fermé** et les étudiants n'en voient que le titre (« Bientôt disponible ») ;
- `### Mission : <titre>` ou `### Leçon : <titre>` suivi d'**un seul** bloc ```` ```yaml ```` (fermé par une ligne ```` ``` ````) ;
- tout autre texte = note pour l'enseignant, jamais montrée aux étudiants.

Exemple de mission :

~~~~markdown
### Mission : Pourquoi 70 DH deviennent 100 DH ?

```yaml
slug: sql-01-frais-livraison
kind: single_choice
objectives: [SQL-GRAIN]
points: 5
duration: 15
scenario: |
  Lundi matin, Salma, responsable logistique de ShopFlow à Tanzar, compare deux rapports...
instructions: Quelle correction donne le bon total des frais de livraison ?
data:
  kind: code
  language: sql
  code: |
    SELECT SUM(o.shipping_fee)
    FROM orders o JOIN order_items i ON i.order_id = o.order_id;
run:
  - id: requete-actuelle
    label: Exécuter la requête actuelle
    sql: |
      SELECT SUM(o.shipping_fee) AS total FROM orders o JOIN order_items i ON i.order_id = o.order_id;
  - id: requete-corrigee
    label: Exécuter la version agrégée par commande
    sql: |
      SELECT SUM(shipping_fee) AS total FROM orders;
choices:
  - id: a
    label: Agréger les frais au niveau commande avant la jointure.
    correct: true
    feedback: Exactement, le grain de orders est la commande.
  - id: b
    label: Utiliser SUM(DISTINCT shipping_fee).
    feedback: Le total semble juste ici, mais deux commandes de même montant seraient fusionnées.
hints:
  - Combien de lignes produit la commande 1001 après la jointure ?
  - Quel est le grain de la table orders ? Et de order_items ?
explanation: |
  La jointure duplique chaque commande autant de fois qu'elle a d'articles...
```
~~~~

**Piège YAML fréquent** : une valeur qui contient « deux-points suivi d'un espace » (`Vrai ou faux : …`, `idempotent : relancer…`) doit être **entre guillemets** ou écrite sous `|` sur les lignes suivantes. Le compilateur le signale avec le numéro de ligne.

**Correspondance à l'import** : les modules sont reconnus par leur titre, les blocs par (module, titre), les missions par `slug`. Renommer un bloc crée un **nouveau bloc fermé**. Une mission déjà publiée ne peut pas disparaître du source (l'import est refusé) ; une mission modifiée reçoit une nouvelle version (sa progression repart de zéro) ; une mission inchangée garde progression et notes.

Règles générales : UTF-8, français, vouvoiement, contexte marocain **fictif** (DH, villes fictives comme Tanzar ou Oued Lmal, prénoms variés), sans caricature, aucune donnée personnelle réelle, aucun HTML (les `<` et `>` du SQL sont permis), retours à la ligne conservés à l'affichage.

## 4. Champs d'une mission

| Champ | Obligatoire | Règle |
|---|---|---|
| `slug` | oui | unique dans tout le cours, `a-z0-9-` |
| `kind` | oui | § 5 |
| `objectives` | oui | 1 à 20 codes déclarés dans `00-cours.md` |
| `prerequisites` | non | slugs de missions **précédentes** ; à utiliser rarement (le déblocage se fait surtout par module) |
| `points` | oui (sauf `lesson`) | 1 à 100 |
| `scoring` | non | `all_or_nothing` (défaut) ou `partial` (seulement `multiple_choice`, `reorder`, `matching`) |
| `duration` | oui | minutes indicatives (≈ 15), jamais un chronomètre |
| `bonus` | non | `true` = mission bonus, comptée à part |
| `scenario` | oui (sauf `lesson`) | 40 à 90 mots conseillés, ≤ 5000 caractères |
| `instructions` | oui (sauf `lesson`) | la question, ≤ 2000 caractères |
| `data` | non | § 6 |
| `run` | non | exécutions de code préconfigurées, § 7 |
| `choices` | oui (sauf `lesson` et `sql_challenge`) | 2 à 16 ; `id` court, `label` ≤ 500 caractères, `correct: true` sur la ou les bonnes réponses, `feedback` facultatif |
| `order` | `reorder` | ids dans l'ordre attendu |
| `targets` + `pairs` | `matching` | `targets` : `{id, label}` ; `pairs` : `{id_choix: id_cible}` |
| `hints` | non | 0 à 5, du plus vague au plus précis |
| `explanation` | conseillé | ≤ 3000 caractères ; montrée après une bonne réponse ou quelques essais |
| `resources` | non | 0 à 10 liens HTTPS |
| `body` | `lesson` | § 5 |
| `starter_sql`, `expected_sql`, `compare` | `sql_challenge` | § 5 |

Notation : **toutes les tentatives sont permises, la meilleure est retenue.** Aucun champ de pénalité.

## 5. Types d'activité (`kind`)

Disponibles : `single_choice`, `multiple_choice`, `true_false` (choix `true` et `false`), `reorder` (`order`), `matching` (`targets` + `pairs`), `data_interpretation`, `scenario_choice`, `lesson`, `sql_challenge`.

- `lesson` (titre `### Leçon :`) : courte leçon non notée (l'équivalent d'une slide). Champs : `slug`, `kind: lesson`, `objectives`, `duration`, `body` (≤ 4000 caractères, paragraphes séparés par une ligne vide, listes `- `), `data` et `run` facultatifs. Pas de `points`, `choices`, `scenario` ni `instructions`. L'étudiant clique « J'ai compris » : la leçon compte dans la progression (bloc terminé), jamais dans la note.
- `sql_challenge` (bonus de préférence) : l'étudiant **modifie ou écrit** une requête `SELECT` sur la base de laboratoire ; le serveur l'exécute en lecture seule et compare **le résultat** au résultat attendu (`expected_sql`, privé, exécuté côté serveur). Champs : `starter_sql`, `expected_sql`, `compare: rows | rows_unordered | scalar` (défaut `rows`), `points`, `scenario`, `instructions` ; pas de `choices`. Notation tout ou rien. *État : accepté par le compilateur et stocké ; l'exécution arrive avec la base de laboratoire (partie C du sprint 2) ; d'ici là l'étudiant voit la requête de départ.*

`guided_simulation` reste réservé aux actions serveur déjà approuvées ; le compilateur le refuse.

## 6. Données affichées (`data`)

- `table` : `columns` (≤ 12), `rows` (≤ 100), `title` facultatif.
- `bar_chart` : `title`, `labels` (≤ 20), `values`, `unit`.
- `line_chart` : `title`, `labels` (2 à 40), `series` : 1 ou 2 `{name, values}` (une valeur par libellé, `null` = point absent, affiché comme une interruption et jamais comme zéro), `unit`.
- `code` : `language` `sql` | `python` | `text`, `code` (≤ 60 lignes), `title` facultatif. À lire : jamais exécuté dans le navigateur.
- `comparison` : `items`, exactement deux blocs côte à côte, chacun `kind: code` (comme ci-dessus) ou `kind: table`, **chacun avec `title`**.

Exemple :

```yaml
data:
  kind: comparison
  items:
    - kind: code
      language: sql
      title: Script de Hamza
      code: |
        INSERT INTO orders (order_id, total) VALUES (%s, %s);
    - kind: code
      language: sql
      title: Script d'Inès
      code: |
        INSERT INTO orders (order_id, total) VALUES (%s, %s)
        ON CONFLICT (order_id) DO UPDATE SET total = EXCLUDED.total;
```

## 7. Exécution de code préconfiguré (`run`)

Dans certaines missions, l'étudiant clique « Exécuter » et voit le **vrai résultat**, sans rien installer. La réponse notée reste un choix ; le code sert à observer et comprendre.

- **SQL** : `run` est une liste de 1 à 4 requêtes `{id, label, sql}` exécutées **à la demande** sur une **base de laboratoire séparée** (PostgreSQL, données de `datasets/shopflow-lab.sql`, lecture seule, temps et nombre de lignes limités). Seules les requêtes écrites dans le cours sont exécutables ici ; l'écriture libre est réservée à `sql_challenge`. `EXPLAIN ANALYZE` est permis.
- **Python** : `run` contient `{id, label, python}` ; le code est exécuté **une fois, à l'import du cours**, dans un conteneur jetable sans réseau, avec les fichiers de `datasets/python/` ; l'étudiant voit le code et le résultat réel quand il clique « Exécuter ». Pas d'exécution de Python libre écrit par les étudiants (sécurité du Mac) : les variantes se proposent sous forme de plusieurs extraits préconfigurés.
- Résultats affichés en tableau (SQL) ou en sortie texte (Python), limités en taille.
- Règles : 1 à 4 entrées, `id` unique dans la mission (`a-z0-9-`), `label` ≤ 120 caractères, code ≤ 60 lignes.
- *État : accepté par le compilateur, stocké et affiché (code visible) ; le bouton « Exécuter » s'active avec la base de laboratoire (partie C du sprint 2).*

## 8. Bonus

- Les missions `bonus: true` peuvent se placer dans n'importe quel bloc (disponibles dès que le bloc est ouvert) ou dans un dernier bloc `## Bloc : Bonus` du module.
- Les bonus ne pénalisent jamais la note principale ; ils rapportent des points bonus affichés à part.
- Pistes : `sql_challenge`, PERCENT_RANK, CTE récursives, index partiels PostgreSQL contre MySQL, partitionnement, variantes Python plus avancées.

## 9. Contrôles du compilateur

Erreurs avec **fichier et numéro de ligne** si : champ obligatoire manquant ; `kind` ou `data.kind` inconnu ou pas encore livré ; objectif non déclaré ; prérequis vers une mission suivante ; slug dupliqué ; clé de réponse incohérente ; HTML ou lien non HTTPS ; texte trop long ; requête `run` qui échoue sur la base de laboratoire ; extrait Python qui échoue ou dépasse le temps ; objectif déclaré mais couvert par aucune mission.

Résumé produit : modules, blocs, leçons, missions, bonus, points par module et par bloc (principal et bonus), durée estimée (missions principales et leçons), objectifs couverts.

Avertissements (non bloquants) : scénario hors de 40 à 90 mots, mission sans `explanation`, bloc dont les missions principales ne font pas 10 à 20 minutes.

## 10. Journal des changements de syntaxe

| Date | Changement |
|---|---|
| 28/10/2026 (sprint 2, A) | `## Bloc : <titre>` accepté comme synonyme de `## Chapitre :`. Les blocs nouvellement importés arrivent fermés. |
| 28/10/2026 (sprint 2, D) | Livrés : `lesson` (`body`, « J'ai compris »), `data.kind` `line_chart`, `code`, `comparison` (avec `title` de chaque côté), `title` facultatif d'un `table`. `run` et `sql_challenge` acceptés et stockés (exécution en partie C). Introduction de module = première ligne sous `# Module :`. Fichiers réservés ignorés. |
