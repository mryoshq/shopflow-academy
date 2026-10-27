# Référentiel de contenu FUTUR — parcours guidé du 28 octobre 2026

> **Ce fichier sert de cahier pédagogique et de jeux de tests futurs.** Ne pas créer toutes ces missions avant la construction de l'Academy et de son studio de cours (lots P0). Le contenu réel ne sera saisi/publié qu'en P2 après validation par le professeur. Les activités de démonstration P0 doivent être signalées comme telles, distinctes de ce corpus.


Six heures de contenu: SQL analytique ≤90 min (six fenêtres de ~15 min) et Axe 2 Python/ingestion/qualité ≥270 min (18 fenêtres de ~15 min). Le rythme est indicatif, aucun blocage automatique sur le temps. Le jeu de données est **fictif**; les montants sont en DH et les villes marocaines de démonstration.

## Six séquences SQL (25 points au total)
| ID | Scénario visible | Compétence | Format sans code | Points |
|---|---|---|---|---:|
| SQL-01 | Total livraison incorrect (70 attendu vs 100 calculé) | Grain, JOIN, SUM | choisir la correction et voir le recalcul | 5 |
| SQL-02 | Classements avec ex aequo | ROW_NUMBER, RANK, CTE | choisir la fonction selon affichage | 4 |
| SQL-03 | Ventes du jour vs dernière date observée | LAG, LEAD et dates absentes | sélectionner la bonne interprétation | 4 |
| SQL-04 | Segmentation clientèle | NTILE(4), tri, égalités | choisir un ordre et visualiser les groupes | 4 |
| SQL-05 | Requête à étapes complexes | CTE non récursive | placer les blocs dans le bon ordre | 4 |
| SQL-06 | Requête lente | EXPLAIN ANALYZE, index / optim | comparer deux plans visuels | 4 |

Bonus facultatifs: PERCENT_RANK, CTE récursives, index partiels PostgreSQL vs absence du prédicat `WHERE` dans les index MySQL, partitionnement et dénormalisation. Inclure des exemples sans en faire des prérequis.

## Dix-huit séquences Python / ingestion / qualité (75 points)
| ID | Groupe | Décision / situation | Points |
|---|---|---|---:|
| PY-01 | Comprendre les sources | identifier CSV et JSON | 4 |
| PY-02 | Comprendre les sources | associer colonnes aux types | 4 |
| PY-03 | Comprendre les sources | choisir un schéma de commandes | 4 |
| PY-04 | Comprendre les sources | ordonner source→ingestion→qualité→destination | 4 |
| PY-05 | Transformer | repérer la lecture CSV Python dans un extrait guidé | 4 |
| PY-06 | Transformer | associer un champ à son format de date | 4 |
| PY-07 | Transformer | choisir conversion prix texte→décimal | 4 |
| PY-08 | Transformer | prévisualiser l'effet d'une normalisation | 4 |
| PY-09 | Nettoyer | détecter des doublons par clé métier | 5 |
| PY-10 | Nettoyer | traiter une valeur manquante selon règle | 5 |
| PY-11 | Nettoyer | repérer montants négatifs/incohérents | 5 |
| PY-12 | Nettoyer | séparer lignes rejetées et acceptées | 5 |
| PY-13 | Charger | définir un chargement idempotent | 4 |
| PY-14 | Charger | choisir une stratégie de transaction | 4 |
| PY-15 | Charger | lire un rapport d'anomalies | 4 |
| PY-16 | Charger | vérifier un total post-import | 4 |
| PY-17 | Incident final | sélectionner des étapes de réparation | 4 |
| PY-18 | Bilan | vérifier le pipeline et expliquer une décision | 3 |
| | | **Total Axe 2** | **75** |

> Instruction pour `mission-author` : cette table est un squelette à transformer en 24 définitions versionnées, avec leurs fixtures, distracteurs justifiés, hints en 3 niveaux, actions deterministic grading et tests. Vérifier somme points=100, chaque notion couvert une fois au minimum, et aucune donnée personnelle.

## Contenu minimum de chaque séquence
- Une situation métier (40 à 90 mots), une figure/donnée à lire, une action à choisir, résultat prédéfini recalculé côté serveur, feedback court (juste et faux), un indice disponible, une transition à la mission suivante.
- Option IA disponible si activée, avec mode 'expliquer', 'indice', 'erreur'.
- Une ressource courte pour les rapides, sans se substituer au tronc commun.
- Critère de correction déterministe, jamais local au navigateur.

## Slides enseignant (4 à 6 maximum)
1. « Vous êtes l'équipe Data de ShopFlow » + dashboard.
2. « Pourquoi 70 DH deviennent-ils 100 DH ? » + schéma grain commande/article.
3. « Classements et tendances » + deux mini-graphiques.
4. « Un CSV arrive : que peut-on lui faire confiance ? » + flux Python.
5. « Une donnée sale contamine les indicateurs » + exemple avant/après.
6. « De CSV au dashboard » + pipeline final.

## Interactivité sans stress
L'enseignant annonce 15 minutes comme repère collectif ; aucun verrou au bout de 15 minutes. Les rapides accèdent à un bonus, une ressource ou au tutorat d'un pair. Distanciel: même URL, mêmes données, même validation, aucun outil supplémentaire.
