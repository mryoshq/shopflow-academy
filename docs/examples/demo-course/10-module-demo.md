# Module : Démonstration ShopFlow
Une journée courte pour découvrir chaque type d'activité, avec des données fictives.

Note pour l'enseignant : deux blocs d'environ 15 minutes, puis un défi bonus.

## Bloc : Le grain des tables

### Leçon : Qu'est-ce que le grain d'une table ?

```yaml
slug: demo-lecon-grain
kind: lesson
objectives: [DEMO-GRAIN, BLOC-GRAIN]
duration: 3
body: |
  Le grain d'une table, c'est ce que représente une ligne.

  Dans ShopFlow :
  - orders : une ligne par commande ;
  - order_items : une ligne par article commandé.

  Joindre ces deux tables fait passer au **grain article** : une valeur de commande est alors répétée sur chaque article.
data:
  kind: code
  language: sql
  title: La jointure qui change le grain
  code: |
    SELECT o.order_id, o.shipping_fee, i.item_id
    FROM orders o
    JOIN order_items i ON i.order_id = o.order_id;
```

### Leçon : La jointure pas à pas

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
  - term: CTE
    definition: Requête nommée avec `WITH`, réutilisée dans la requête principale.
example: |
  C-101 coûte 30 DH de livraison et contient **deux** articles.
  1. Avant la jointure : une ligne pour C-101, donc 30 DH.
  2. Après `JOIN order_items` : deux lignes pour C-101, donc 30 + 30 = 60 DH.
  3. Avec C-102 (40 DH, un article), le total passe de 70 DH à **100 DH**.
practice: |
  Lancez l'animation et arrêtez-vous à l'étape 3 : quelles cellules sont comptées deux fois ?
  Puis ouvrez la mission « Pourquoi 70 DH deviennent 100 DH ? ».
data:
  kind: animation
  title: "Jointure orders et order_items : 70 DH deviennent 100 DH"
  description: |
    Animation en quatre étapes. 1. La table orders contient deux commandes, C-101 à 30 DH et C-102 à 40 DH, total attendu 70 DH. 2. La table order_items contient trois articles : I-1 et I-2 pointent vers C-101, I-3 vers C-102. 3. Après la jointure, il y a une ligne par article : les 30 DH de C-101 apparaissent deux fois et la somme vaut 100 DH. 4. En calculant d'abord les frais par commande dans une CTE, puis en joignant, le total redevient 70 DH.
  steps:
    - caption: Deux commandes, une ligne chacune. Les frais attendus font 30 + 40 = 70 DH.
      scene:
        tables:
          - title: orders (grain commande)
            columns: [order_id, shipping_fee]
            rows: [[C-101, 30], [C-102, 40]]
        counter: {label: Total attendu, value: 70 DH}
    - caption: Chaque article pointe vers sa commande. C-101 a deux articles.
      scene:
        tables:
          - title: order_items (grain article)
            columns: [item_id, order_id]
            rows: [[I-1, C-101], [I-2, C-101], [I-3, C-102]]
            highlight: {rows: [0, 1]}
          - title: orders
            columns: [order_id, shipping_fee]
            rows: [[C-101, 30], [C-102, 40]]
            highlight: {rows: [0]}
        arrows:
          - {from: [0, 0], to: [1, 0]}
          - {from: [0, 1], to: [1, 0]}
          - {from: [0, 2], to: [1, 1]}
    - caption: Après la jointure, une ligne par article. Les 30 DH de C-101 apparaissent deux fois.
      scene:
        tables:
          - title: Résultat de la jointure
            columns: [order_id, item_id, shipping_fee]
            rows: [[C-101, I-1, 30], [C-101, I-2, 30], [C-102, I-3, 40]]
            highlight: {cells: [[0, 2], [1, 2]]}
        counter: {label: SUM(shipping_fee), value: 100 DH}
        badge: {kind: erreur, text: Les frais de C-101 sont comptés deux fois}
    - caption: On calcule les frais au grain commande, puis on joint. Le total redevient 70 DH.
      scene:
        tables:
          - title: Frais par commande (CTE)
            columns: [order_id, shipping_fee]
            rows: [[C-101, 30], [C-102, 40]]
        counter: {label: Total corrigé, value: 70 DH}
        badge: {kind: ok, text: Un seul comptage par commande}
```

### Mission : Pourquoi 70 DH deviennent 100 DH ?

```yaml
slug: demo-frais-livraison
kind: single_choice
objectives: [DEMO-GRAIN]
points: 5
duration: 6
scenario: |
  Lundi matin, Salma, responsable logistique de ShopFlow à Tanzar, compare deux rapports. La comptabilité annonce 70 DH de frais de livraison pour les commandes C-101 et C-102, mais le tableau de bord de l'équipe Data affiche 100 DH. La requête du tableau de bord joint les commandes et leurs articles.
instructions: Quelle correction donne le bon total des frais de livraison ?
data:
  kind: table
  title: Résultat de la jointure
  columns: [order_id, item_id, shipping_fee]
  rows:
    - [C-101, I-1, 30]
    - [C-101, I-2, 30]
    - [C-102, I-3, 40]
run:
  - id: requete-actuelle
    label: Exécuter la requête actuelle
    sql: |
      SELECT SUM(o.shipping_fee) AS total
      FROM orders o JOIN order_items i ON i.order_id = o.order_id
      WHERE o.order_id IN ('C-101', 'C-102');
  - id: requete-corrigee
    label: Exécuter la version au grain commande
    sql: |
      SELECT SUM(shipping_fee) AS total
      FROM orders
      WHERE order_id IN ('C-101', 'C-102');
choices:
  - id: a
    label: Agréger les frais au niveau commande avant la jointure.
    correct: true
    feedback: Exactement, le grain de orders est la commande.
  - id: b
    label: Utiliser SUM(DISTINCT shipping_fee).
    feedback: Le total semble juste ici, mais deux commandes de même montant seraient fusionnées.
  - id: c
    label: Supprimer les articles en double de order_items.
    feedback: Ces lignes sont légitimes, une commande peut contenir plusieurs articles.
hints:
  - Combien de fois la commande C-101 apparaît-elle après la jointure ?
  - Quel est le grain de orders ? Et celui de order_items ?
explanation: |
  Après la jointure, une ligne représente un article : 30 + 30 + 40 = 100 DH. On calcule les frais au grain commande, puis on joint : 30 + 40 = 70 DH.
```

### Mission : Vrai ou faux sur le grain

```yaml
slug: demo-vrai-faux-grain
kind: true_false
objectives: [DEMO-GRAIN]
points: 2
duration: 3
scenario: |
  Youssef, stagiaire chez ShopFlow à Oued Lmal, prépare un indicateur du nombre de commandes par jour. Il compte les lignes du résultat de la jointure entre orders et order_items, puis présente le chiffre à l'équipe. Son collègue lui demande si ce comptage correspond bien au nombre de commandes passées.
instructions: "Vrai ou faux : COUNT(*) après cette jointure donne le nombre de commandes."
choices:
  - id: true
    label: Vrai
  - id: false
    label: Faux
    correct: true
    feedback: Bien vu, on compte ici des articles, pas des commandes.
hints:
  - Que représente une ligne après la jointure ?
explanation: Il faut COUNT(DISTINCT order_id), ou compter directement dans orders.
```

### Mission : Associer chaque table à son grain

```yaml
slug: demo-associer-grain
kind: matching
objectives: [DEMO-GRAIN]
points: 3
duration: 3
scoring: partial
scenario: |
  Pour documenter l'entrepôt de ShopFlow, Nadia rédige une fiche par table. Elle veut indiquer pour chacune ce que représente une ligne, afin que les analystes de Tanzar et d'Oued Lmal évitent les doubles comptes dans leurs tableaux de bord. Aidez-la à compléter la fiche.
instructions: Associez chaque table à son grain.
choices:
  - id: orders
    label: orders
  - id: items
    label: order_items
  - id: customers
    label: customers
targets:
  - id: commande
    label: Une commande
  - id: article
    label: Un article commandé
  - id: client
    label: Un client
pairs:
  orders: commande
  items: article
  customers: client
explanation: Chaque table a son grain ; le connaître évite de répéter une valeur lors d'une jointure.
```

## Bloc : Qualité et ingestion

### Leçon : Carte des règles de qualité

```yaml
slug: demo-lecon-carte-qualite
kind: lesson
objectives: [DEMO-QUALITE, BLOC-QUALITE]
duration: 2
body: |
  Avant de charger un fichier, on vérifie quatre familles de règles. Dépliez chaque branche avec le clavier ou la souris.
data:
  kind: mindmap
  title: Qualité d'un fichier importé
  root:
    label: Qualité des données
    children:
      - label: Types
        children:
          - label: Montants numériques
          - label: Dates au format AAAA-MM-JJ
      - label: Doublons
        children:
          - label: Clé métier
            children:
              - label: identifiant client
              - label: numéro de commande
      - label: Valeurs manquantes
        children:
          - label: Rejet journalisé
          - label: Valeur par défaut documentée
      - label: Cohérence
        children:
          - label: Montants positifs
          - label: Totaux vérifiés après import
```

### Mission : Lire l'évolution des rejets

```yaml
slug: demo-courbe-rejets
kind: data_interpretation
objectives: [DEMO-QUALITE]
points: 4
duration: 4
scenario: |
  Chaque nuit, le pipeline d'ingestion de ShopFlow importe le fichier clients et rejette les lignes invalides. Le graphique montre les lignes rejetées sur une semaine, avant et après l'ajout d'un contrôle de format des dates. Le jeudi, l'import n'a pas tourné à cause d'une coupure de courant à Tanzar.
instructions: Quelle lecture du graphique est correcte ?
data:
  kind: line_chart
  title: Lignes rejetées par nuit
  labels: [Lun, Mar, Mer, Jeu, Ven, Sam, Dim]
  unit: lignes
  series:
    - name: Avant le contrôle des dates
      values: [42, 38, 45, null, 40, 39, 41]
    - name: Après le contrôle des dates
      values: [12, 9, 11, null, 10, 8, 9]
choices:
  - id: a
    label: Le contrôle des dates a fait baisser les rejets d'environ trois quarts.
    correct: true
  - id: b
    label: Jeudi, aucune ligne n'a été rejetée.
    feedback: Jeudi, l'import n'a pas tourné, la donnée est absente, ce n'est pas un zéro.
  - id: c
    label: Les rejets augmentent pendant la semaine.
hints:
  - Comparez les deux séries le même jour.
explanation: Les rejets passent d'environ 40 à environ 10 par nuit. Le point absent du jeudi n'est pas une valeur nulle.
```

### Mission : Les règles de qualité utiles

```yaml
slug: demo-regles-qualite
kind: multiple_choice
objectives: [DEMO-QUALITE]
points: 4
duration: 4
scoring: partial
scenario: |
  Le service client de ShopFlow envoie chaque soir un fichier clients.csv. Avant le chargement dans l'entrepôt, l'équipe Data doit décider quelles règles de qualité appliquer. L'extrait du jour montre des montants écrits en lettres, deux formats de date et un client présent deux fois avec le même identifiant.
instructions: Quelles règles appliquez-vous avant le chargement ? Plusieurs réponses sont possibles.
run:
  - id: apercu-pandas
    label: Exécuter l'aperçu pandas du fichier
    python: |
      import pandas as pd

      clients = pd.read_csv("clients.csv", dtype=str)
      print(clients.to_string(index=False))
      print()
      print("Doublons sur id :", int(clients.duplicated(subset=["id"]).sum()))
      print("Villes manquantes :", int(clients["ville"].isna().sum()))
      montants = pd.to_numeric(clients["montant_dh"], errors="coerce")
      print("Montants non numériques :", int(montants.isna().sum()))
data:
  kind: flow
  title: Import du fichier clients.csv de la nuit
  input: 1000
  unit: lignes
  steps:
    - {id: lire, label: Lire le fichier}
    - {id: valider, label: Valider les types, rejects: 12, note: Montants écrits en lettres}
    - {id: normaliser, label: Normaliser les dates, rejects: 5, note: Dates impossibles}
    - {id: dedupliquer, label: Dédupliquer, rejects: 8, note: Même identifiant client}
    - {id: charger, label: Charger}
choices:
  - id: types
    label: Rejeter et journaliser les montants non numériques.
    correct: true
  - id: dates
    label: Normaliser les dates au format AAAA-MM-JJ.
    correct: true
  - id: doublons
    label: Dédupliquer sur l'identifiant client.
    correct: true
  - id: texte
    label: Tout convertir en texte pour éviter les erreurs.
    feedback: Tout passer en texte masque les erreurs au lieu de les traiter.
explanation: Chaque problème a sa règle, et chaque rejet est journalisé pour corriger la source.
```

### Mission : Ordonner le pipeline

```yaml
slug: demo-ordre-pipeline
kind: reorder
objectives: [DEMO-PIPELINE]
points: 4
duration: 4
scenario: |
  ShopFlow automatise l'import quotidien des commandes de ses boutiques de Tanzar et d'Oued Lmal. Le pipeline doit pouvoir être relancé après une panne sans créer de doublons dans l'entrepôt. L'équipe Data a listé les étapes, mais dans le désordre, sur le tableau blanc de la salle de réunion.
instructions: Remettez les étapes dans l'ordre d'exécution.
choices:
  - id: lire
    label: Lire le fichier source
  - id: valider
    label: Valider le schéma et les types
  - id: nettoyer
    label: Nettoyer les valeurs
  - id: charger
    label: Charger avec un upsert idempotent
order: [lire, valider, nettoyer, charger]
explanation: On lit, on rejette tôt ce qui ne respecte pas le schéma, on nettoie, puis on charge avec une clé d'unicité.
```

### Mission : Deux scripts, un seul bon

```yaml
slug: demo-comparer-scripts
kind: scenario_choice
objectives: [DEMO-PIPELINE]
points: 3
duration: 3
scenario: |
  Deux stagiaires de ShopFlow proposent chacun un script de chargement des commandes. Le pipeline tourne toutes les nuits et il arrive qu'on le relance le matin après un incident réseau. Hamza et Inès comparent leurs propositions avec vous avant la mise en production prévue vendredi.
instructions: Quel script garantit qu'une relance ne crée pas de doublons ?
data:
  kind: comparison
  items:
    - kind: code
      language: sql
      title: Script de Hamza
      code: |
        INSERT INTO orders (order_id, total)
        VALUES (%s, %s);
    - kind: code
      language: sql
      title: Script d'Inès
      code: |
        INSERT INTO orders (order_id, total)
        VALUES (%s, %s)
        ON CONFLICT (order_id) DO UPDATE SET total = EXCLUDED.total;
choices:
  - id: hamza
    label: Le script de Hamza.
    feedback: Une relance insère une seconde fois les mêmes commandes.
  - id: ines
    label: Le script d'Inès.
    correct: true
explanation: |
  ON CONFLICT rend le chargement idempotent : relancer le pipeline met à jour au lieu de dupliquer.
```

### Mission : Défi bonus, le top des villes

```yaml
slug: demo-defi-sql
kind: sql_challenge
objectives: [DEMO-GRAIN]
points: 5
duration: 10
bonus: true
scenario: |
  Défi facultatif pour aller plus loin. La direction de ShopFlow veut connaître le chiffre d'affaires par ville, calculé au bon grain, pour décider où ouvrir un nouveau point relais. Les villes sont fictives et les montants sont en dirhams. Modifiez la requête de départ jusqu'à obtenir le bon résultat.
instructions: Corrigez la requête pour obtenir, pour chaque ville, la somme des totaux de commande, de la plus grande à la plus petite.
starter_sql: |
  SELECT c.city, SUM(o.shipping_fee) AS ca
  FROM orders o
  JOIN customers c ON c.customer_id = o.customer_id
  GROUP BY c.city;
expected_sql: |
  SELECT c.city, SUM(o.total) AS ca
  FROM orders o
  JOIN customers c ON c.customer_id = o.customer_id
  GROUP BY c.city
  ORDER BY ca DESC;
compare: rows
hints:
  - Le chiffre d'affaires se calcule sur total, pas sur les frais de livraison.
  - Le résultat attendu est trié, du plus grand au plus petit.
explanation: La requête de départ additionnait les frais de livraison ; il fallait additionner total et trier par chiffre d'affaires décroissant.
```

### Leçon : Vidéo facultative, le pipeline en quatre secondes

```yaml
slug: demo-lecon-video
kind: lesson
objectives: [DEMO-PIPELINE]
duration: 1
body: |
  Une courte vidéo facultative, avec sous-titres. Elle ne compte jamais dans la note.
data:
  kind: video
  title: Un lot de lignes traverse le pipeline
  file: media/pipeline-demo.mp4
  captions: media/pipeline-demo.vtt
```

### Leçon : Le vocabulaire de la qualité en cartes

```yaml
slug: demo-lecon-cartes
kind: lesson
objectives: [DEMO-QUALITE]
duration: 2
body: |
  Retournez chaque carte : le recto donne le mot, le verso sa définition. « Je savais / À revoir » est facultatif et ne compte jamais dans la note.
data:
  kind: flashcards
  title: Mots de la qualité des données
  description: Quatre cartes, un mot au recto et sa définition au verso.
  cards:
    - front: Doublon
      back: Deux lignes qui décrivent **la même chose**, par exemple la même commande importée deux fois.
    - front: Valeur manquante
      back: Une cellule vide là où une valeur est attendue, comme une ville absente pour un client de Tanzar.
    - front: Rejet
      back: Une ligne écartée par une règle de qualité, gardée à part pour être corrigée.
    - front: "`NOT NULL`"
      back: Une contrainte qui refuse les valeurs manquantes dans une colonne.
```

### Révision : Le grain et la qualité

```yaml
slug: demo-revision-bloc
objectives: [DEMO-GRAIN, DEMO-QUALITE]
duration: 3
body: Une révision rapide avant de quitter la journée. Elle compte dans la progression comme une leçon, jamais dans la note.
data:
  kind: flashcards
  title: Révision de la journée
  cards:
    - front: Grain de `orders`
      back: Une ligne par commande.
    - front: Grain de `order_items`
      back: Une ligne par article commandé.
    - front: Jointure
      back: Assemble deux tables à l'aide d'une **clé commune**.
    - front: Pipeline d'ingestion
      back: Les étapes qui amènent les données de leur source jusqu'à la table finale.
```
