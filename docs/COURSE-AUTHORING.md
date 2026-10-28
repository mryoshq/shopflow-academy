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
    media/                    vidéos .mp4 (≤ 50 Mo) et sous-titres .vtt facultatifs (§ 6, `data.kind: video`)
    datasets/
      shopflow-lab.sql        données fictives ShopFlow chargées dans la base de laboratoire (§ 7)
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
| `body` | `lesson` (ou structure) | § 5 |
| `objective`, `hook`, `key_terms`, `example`, `practice` | non (`lesson` seulement) | leçon structurée, § 5 bis |
| `starter_sql`, `expected_sql`, `compare` | `sql_challenge` | § 5 |

Notation : **toutes les tentatives sont permises, la meilleure est retenue.** Aucun champ de pénalité.

## 5. Types d'activité (`kind`)

Disponibles : `single_choice`, `multiple_choice`, `true_false` (choix `true` et `false`), `reorder` (`order`), `matching` (`targets` + `pairs`), `data_interpretation`, `scenario_choice`, `lesson`, `sql_challenge`.

- `lesson` (titre `### Leçon :`) : courte leçon non notée (l'équivalent d'une slide). Champs : `slug`, `kind: lesson`, `objectives`, `duration`, puis **`body`** (texte libre, ≤ 4000 caractères) **ou** une **structure** (§ 5 bis), ou les deux ; `data` et `run` facultatifs. Pas de `points`, `choices`, `scenario` ni `instructions`. L'étudiant clique « J'ai compris » : la leçon compte dans la progression (bloc terminé), jamais dans la note.
- `sql_challenge` (bonus de préférence) : l'étudiant **modifie ou écrit** une requête `SELECT` sur la base de laboratoire ; le serveur l'exécute en lecture seule et compare **le résultat** au résultat attendu (`expected_sql`, privé, exécuté côté serveur). Champs : `starter_sql`, `expected_sql`, `compare: rows | rows_unordered | scalar` (défaut `rows`), `points`, `scenario`, `instructions` ; pas de `choices`. Notation tout ou rien. Requêtes acceptées : **une seule** instruction `SELECT` (avec `WITH`, `UNION`, ou précédée d'`EXPLAIN [ANALYZE]`) sur les tables du laboratoire, fonctions usuelles (agrégats, fenêtres `ROW_NUMBER`, `RANK`, `NTILE`, `LAG`, `LEAD`, `PERCENT_RANK`…, dates et texte courants) ; jamais d'écriture. Le résultat doit être identique à celui d'`expected_sql` (avec `compare: rows`, l'ordre des lignes compte : mettez un `ORDER BY` dans `expected_sql`). Vérifiez que `starter_sql` ne donne **pas** déjà le bon résultat.

`guided_simulation` reste réservé aux actions serveur déjà approuvées ; le compilateur le refuse.

### 5 bis. Leçon structurée (ADR-0022)

Tous les champs sont facultatifs et réservés aux leçons ; une leçon a au moins un `body`, un `hook`, des `key_terms`, un `example` ou un `practice`. L'ancien format (`body` seul) reste valable.

| Champ | Règle | Affichage |
|---|---|---|
| `objective` | **une phrase**, une ligne, ≤ 200 caractères | bandeau discret en haut : « Objectif : … » |
| `hook` | accroche, ≤ 600 caractères | texte d'introduction un peu plus grand |
| `key_terms` | 1 à 8 `{term (≤ 60), definition (≤ 300)}`, termes distincts | petites cartes « Vocabulaire » |
| `body` | texte libre, ≤ 4000 caractères, sous-titres `### ` permis | après le vocabulaire |
| `example` | exemple résolu, ≤ 3000 caractères | encadré « Exemple résolu » |
| `data` / `run` | média | **entre** l'exemple et « À vous » |
| `practice` | appel à l'action, ≤ 1000 caractères | encadré « À vous » |

Ordre d'affichage : objectif, accroche, vocabulaire, texte libre, exemple résolu, média, « À vous ». Visez des paragraphes courts : le compilateur avertit au-delà de **80 mots** par paragraphe (découpez en liste, sous-titre ou exemple) et si `objective` contient plus d'une phrase.

Exemple complet (extrait de `docs/examples/demo-course/10-module-demo.md`, étapes de l'animation abrégées) :

```yaml
slug: demo-lecon-jointure-animee
kind: lesson
objectives: [DEMO-GRAIN]
duration: 4
objective: Expliquer pourquoi une jointure peut gonfler un total, et le corriger.
hook: |
  La comptabilité attend **70 DH** de frais de livraison. Votre requête affiche **100 DH**. Aucune donnée n'est fausse : c'est la jointure qui a changé ce que compte une ligne.
key_terms:
  - term: Grain
    definition: Ce que représente une ligne d'une table (une commande, un article…).
  - term: Jointure
    definition: Associe les lignes de deux tables qui partagent une clé, ici `order_id`.
example: |
  C-101 coûte 30 DH de livraison et contient **deux** articles.
  1. Avant la jointure : une ligne pour C-101, donc 30 DH.
  2. Après `JOIN order_items` : deux lignes pour C-101, donc 30 + 30 = 60 DH.
  3. Avec C-102 (40 DH, un article), le total passe de 70 DH à **100 DH**.
practice: |
  Lancez l'animation et arrêtez-vous à l'étape 3 : quelles cellules sont comptées deux fois ?
data:
  kind: animation
  title: "Jointure orders et order_items : 70 DH deviennent 100 DH"
  description: |
    Animation en quatre étapes. 1. La table orders contient deux commandes… 4. Le total redevient 70 DH.
  steps:
    - caption: Deux commandes, une ligne chacune. Les frais attendus font 30 + 40 = 70 DH.
      scene: …
```

### 5 ter. Mise en forme légère des textes

Dans `body`, `scenario`, `instructions`, `explanation`, `hook`, `example`, `practice` (et la `description` d'un média) :

| Écrire | Résultat |
|---|---|
| `**mot**` | **gras** |
| `` `SUM(total)` `` | code en ligne |
| lignes commençant par `- ` | liste à puces |
| lignes commençant par `1. `, `2. `… | liste numérotée (commence au premier numéro) |
| `### Sous-titre` | sous-titre (**`body` seulement**) |
| ligne vide | nouveau paragraphe |

Rien d'autre n'est interprété : le HTML est refusé par le compilateur, et le texte est toujours affiché comme du texte (jamais comme du HTML).

## 6. Données affichées (`data`)

- `table` : `columns` (≤ 12), `rows` (≤ 100), `title` facultatif.
- `bar_chart` : `title`, `labels` (≤ 20), `values`, `unit`.
- `line_chart` : `title`, `labels` (2 à 40), `series` : 1 ou 2 `{name, values}` (une valeur par libellé, `null` = point absent, affiché comme une interruption et jamais comme zéro), `unit`.
- `code` : `language` `sql` | `python` | `text`, `code` (≤ 60 lignes), `title` facultatif. À lire : jamais exécuté dans le navigateur.
- `comparison` : `items`, exactement deux blocs côte à côte, chacun `kind: code` (comme ci-dessus) ou `kind: table`, **chacun avec `title`**.
- **`description`** (tous les `data.kind`, facultatif, ≤ 3000 caractères, texte brut avec mise en forme légère) : description du média pour qui ne le voit pas. Elle n'apparaît **jamais** dans le corps de la leçon : les lecteurs d'écran la lisent (`aria-describedby`) et l'étudiant peut l'ouvrir avec le lien repliable « Description du média ». Recommandée pour `animation`, `mindmap`, `flow`, `video` et les graphiques.

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

### Médias codés (ADR-0018), utilisables dans les leçons et les missions

- `animation` : animation pas à pas **dessinée par la plateforme** (aucun fichier vidéo). `title`, `steps` (2 à 20) : `{caption, scene}`. Une `scene` contient `tables` (1 à 3 : `title`, `columns` ≤ 8, `rows` ≤ 12, `highlight: {rows: [i], cells: [[ligne, colonne]]}`), `arrows` facultatives (`{from: [table, ligne], to: [table, ligne], label?}`, indices **à partir de 0**, entre deux tables différentes), `counter` facultatif (`{label, value}`), `badge` facultatif (`{kind: ok | erreur | attention, text}`). L'étudiant a Lecture/Pause, étape par étape, Recommencer et une description textuelle complète.
- `mindmap` : `title`, `root: {label, children: [...]}` ; au plus **3 niveaux sous la racine** et **40 nœuds** ; libellés ≤ 80 caractères.
- `flow` : `title`, `input` (lignes en entrée), `unit` (défaut `lignes`), `steps` (2 à 8) : `{id, label, rejects?, note?}`. Un jeton parcourt le pipeline ; les compteurs acceptées / rejetées se mettent à jour. La somme des `rejects` ne dépasse pas `input`.
- `video` (toujours facultative, jamais requise pour la note) : soit `url` = lien **https d'intégration** `https://www.youtube-nocookie.com/embed/<id>` ou `https://player.vimeo.com/video/<id>` ; soit `file: media/<nom>.mp4` (≤ 50 Mo, dans le dossier `cours/media/`) avec `captions: media/<nom>.vtt` facultatif (sous-titres WebVTT, recommandés). Noms : lettres, chiffres, `-` et `_`.

Exemple (extrait de `docs/examples/demo-course/10-module-demo.md`) :

```yaml
data:
  kind: animation
  title: "Jointure orders et order_items : 70 DH deviennent 100 DH"
  steps:
    - caption: Deux commandes, une ligne chacune. Les frais attendus font 30 + 40 = 70 DH.
      scene:
        tables:
          - title: orders (grain commande)
            columns: [order_id, shipping_fee]
            rows: [[C-101, 30], [C-102, 40]]
        counter: {label: Total attendu, value: 70 DH}
    - caption: Après la jointure, une ligne par article. Les 30 DH de C-101 apparaissent deux fois.
      scene:
        tables:
          - title: Résultat de la jointure
            columns: [order_id, item_id, shipping_fee]
            rows: [[C-101, I-1, 30], [C-101, I-2, 30], [C-102, I-3, 40]]
            highlight: {cells: [[0, 2], [1, 2]]}
        counter: {label: SUM(shipping_fee), value: 100 DH}
        badge: {kind: erreur, text: Les frais de C-101 sont comptés deux fois}
```

## 7. Exécution de code préconfiguré (`run`)

Dans certaines missions, l'étudiant clique « Exécuter » et voit le **vrai résultat**, sans rien installer. La réponse notée reste un choix ; le code sert à observer et comprendre. `run` : 1 à 4 entrées, `id` unique dans la mission (`a-z0-9-`), `label` ≤ 120 caractères, code ≤ 60 lignes.

- **SQL** (`{id, label, sql}`) : exécutée **à la demande** sur la **base de laboratoire** (PostgreSQL 16, données de `datasets/shopflow-lab.sql`, lecture seule, 3 secondes, 200 lignes affichées au plus). Seules les requêtes écrites dans le cours sont exécutables ; l'écriture libre est réservée à `sql_challenge`. `EXPLAIN ANALYZE` est permis.
- **`datasets/shopflow-lab.sql`** : instructions `CREATE TABLE` / `INSERT` **sans préfixe de schéma** (le fichier est chargé dans le schéma `lab`, qui est vidé avant chaque import) ; pas de commande d'administration (`COPY … PROGRAM`, `ALTER ROLE`… sont refusés). Données **fictives** uniquement. Sans ce fichier, la base garde son contenu (au départ : un petit jeu de démonstration `orders`, `order_items`, `customers`).
- **Python** (`{id, label, python}`) : exécuté **une fois, lors de la compilation sur le Mac**, dans un conteneur jetable sans réseau (Python 3.12, pandas 2.2.3 ; mémoire 256 Mo, 20 secondes) dont le répertoire de travail est `datasets/python/` (en lecture seule : lisez `"clients.csv"`, n'écrivez que dans `/tmp`). Seule la **sortie standard** (`print`) est conservée (20 000 caractères au plus) ; l'étudiant la révèle en cliquant « Exécuter ». Pas de Python libre écrit par les étudiants : proposez des variantes sous forme de plusieurs extraits.
- Le compilateur exécute chaque requête et chaque extrait ; un échec est une **erreur avec fichier et ligne** (par exemple `relation "ordres" does not exist`).

## 8. Bonus

- Les missions `bonus: true` peuvent se placer dans n'importe quel bloc (disponibles dès que le bloc est ouvert) ou dans un dernier bloc `## Bloc : Bonus` du module.
- Les bonus ne pénalisent jamais la note principale ; ils rapportent des points bonus affichés à part.
- Pistes : `sql_challenge`, PERCENT_RANK, CTE récursives, index partiels PostgreSQL contre MySQL, partitionnement, variantes Python plus avancées.

## 9. Contrôles du compilateur

Erreurs avec **fichier et numéro de ligne** si : champ obligatoire manquant ; leçon sans `body` ni structure ; champ de leçon structurée sur une mission ; `objective` sur plusieurs lignes ; `key_terms` en double ; `kind` ou `data.kind` inconnu ou pas encore livré ; objectif non déclaré ; prérequis vers une mission suivante ; slug dupliqué ; clé de réponse incohérente ; HTML ou lien non HTTPS ; texte trop long ; requête `run` qui échoue sur la base de laboratoire ; extrait Python qui échoue ou dépasse le temps ; objectif déclaré mais couvert par aucune mission.

Résumé produit : modules, blocs, leçons, missions, bonus, points par module et par bloc (principal et bonus), durée estimée (missions principales et leçons), objectifs couverts.

Avertissements (non bloquants) : scénario hors de 40 à 90 mots, mission sans `explanation`, paragraphe de plus de 80 mots (`body`, `hook`, `example`, `practice`, `explanation`), `objective` de plus d'une phrase, bloc dont les missions principales ne font pas 10 à 20 minutes.

## 10. Journal des changements de syntaxe

| Date | Changement |
|---|---|
| 28/10/2026 (sprint 2, G) | Leçon structurée : `objective`, `hook`, `key_terms`, `example`, `practice` (facultatifs, leçons seulement ; `body` seul reste valable). `data.description` pour tous les médias. Mise en forme légère (`**gras**`, `` `code` ``, listes `- ` et `1. `, `### ` dans `body`). ADR-0022. |
| 28/10/2026 (sprint 2, A) | `## Bloc : <titre>` accepté comme synonyme de `## Chapitre :`. Les blocs nouvellement importés arrivent fermés. |
| 28/10/2026 (sprint 2, C) | Exécution livrée : `run` SQL (base de laboratoire, à la demande), `run` Python (exécuté à la compilation sur le Mac, sortie stockée), `sql_challenge` (corrigé par comparaison de résultats). `datasets/shopflow-lab.sql` chargé à l'import ; `datasets/python/` = répertoire de travail des extraits. Les échecs d'exécution sont des erreurs avec fichier et ligne. |
| 28/10/2026 (sprint 2, F) | Livrés : `data.kind` `animation`, `mindmap`, `flow`, `video` (`url` youtube-nocookie.com / player.vimeo.com, ou `file` + `captions` dans `cours/media/`). |
| 28/10/2026 (sprint 2, D) | Livrés : `lesson` (`body`, « J'ai compris »), `data.kind` `line_chart`, `code`, `comparison` (avec `title` de chaque côté), `title` facultatif d'un `table`. `run` et `sql_challenge` acceptés et stockés (exécution en partie C). Introduction de module = première ligne sous `# Module :`. Fichiers réservés ignorés. |
