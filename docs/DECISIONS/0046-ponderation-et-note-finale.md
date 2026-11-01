# ADR-0046 — Grille du projet, points des blocs, pondération et note finale

Date : 31 octobre 2026 · Statut : accepté (demande du propriétaire)

Numérotation : la demande citait « ADR-0043 », déjà pris par la vue étudiant ; ADR-0045 est pris par les rappels des jalons. Cette décision prend donc le numéro 0046.

## Contexte
La grille du projet (SQL 4, Python 4, MongoDB et Redis 3, Airflow 3, preuves 2, compréhension 4) ne suit pas les barèmes des deux sujets CampusEquip. Les blocs affichent « n / m missions », alors que la note se compte en points. Il n'existe pas de note finale réunissant cours, ateliers et projet.

**Règle absolue :** aucune note déjà obtenue ne change. Tout ce qui suit est un calcul ou un affichage au-dessus des données existantes.

## Décision

### 1. Grille du projet (Projet > Notes)
- **Partie 1 (axes 1 et 2), socle sur 10 :**
  - modèle relationnel et contraintes : 2 ;
  - trois analyses SQL, tableaux et graphique : 2 ;
  - contrôles Python, quarantaine et rapport : 2 ;
  - chargement transactionnel, rejeu et prise en charge automatique : 2 ;
  - preuves reproductibles et compréhension : 2, dont 1 commun et 1 individuel par étudiant.
- **Bonus de la partie 1, 5 au plus :** plan SQL avant et après index 1 ; analyse récursive ou précalcul 1 ; lecture par morceaux 1 ; IoT ou API 2.
- **Partie 2 (axes 3 et 4), socle sur 10, commun au groupe :** Airflow et reprise 3 ; événements MongoDB 2 ; Redis 2 ; tentatives et analyse temporelle 2 ; reproductibilité et explication du groupe 1.
- **Bonus de la partie 2, 5 au plus :** file avec acquittement 1 ; mesures et conservation 2 ; capteur local simulé 1 ; reprise approfondie 1.
- Projet sur 20 (socle) + 10 (bonus). Saisie par équipe ; le point individuel est saisi pour chaque étudiant. Une note hors barème est refusée par le serveur (422) et signalée dans le formulaire.
- **Stockage :** nouvelle colonne `project_grades.scores` (JSON : critères et points individuels).
- **Anciennes saisies :** les colonnes de l'ancienne grille ne sont ni modifiées ni supprimées. Elles s'affichent à part, dans un encadré « Ancienne grille, à reprendre », et ne comptent plus.
- **Export CSV du projet :** une colonne par critère, `partie1_10`, `partie2_10`, `socle_20`, `bonus_10` et `ancienne_grille_20`.

### 2. Compteur des blocs
- **Étudiant :** « 4 / 10 pts » pour les missions principales et « 0 / 6 pts bonus » pour les bonus, calculés avec le meilleur essai retenu. « Leçons » pour un bloc sans points. « leçons lues x/y » s'ajoute quand un bloc mêle leçons et missions.
- **Enseignant :** dans « Ma classe », le total du bloc (« 10 pts · 6 pts bonus »).
- **Observateur :** dans la fiche d'un étudiant, les points par module.

### 3. Note finale sur 20 (`backend/app/final_grade.py`)
- **Socle :** 30 % cours + 20 % ateliers + 50 % CampusEquip, chaque partie ramenée sur 20.
  - Cours : points principaux des modules qui ne sont pas des ateliers (les quatre axes), sur leur total.
  - Ateliers : tous les points notés des modules d'ateliers, même marqués bonus, sur leur total.
  - CampusEquip : socle du projet sur 20.
- **Bonus :**
  - au plus +1 pour le bonus du projet, proportionnel (bonus sur 10) ;
  - au plus +1 pour les bonus du cours hors ateliers, proportionnel à leur total.
- **Note finale :** socle + bonus, plafonnée (20 par défaut), arrondie au 0,25 le plus proche (moitié vers le haut : 12,125 → 12,25). Les valeurs affichées sont arrondies au centième ; le calcul garde les valeurs exactes.
- **Parties vides :**
  - un module compte dès qu'un de ses blocs est ouvert pour la classe, sur son total complet ;
  - une partie sans module ouvert, ou un projet non noté, est « en attente » : elle ne compte pas comme zéro, et les poids des autres parties sont ramenés à 100 % ;
  - l'aperçu est marqué « provisoire » tant qu'une partie est en attente, qu'un module n'est pas ouvert ou que la grille du projet n'est pas complète.
- **Réglages > Notes** (`grade_settings`, une ligne par classe, valeurs par défaut sans ligne) :
  - poids (total 100 %), plafond (0 à 20), bonus maximaux (0 à 5) ;
  - modules qui comptent comme ateliers (par défaut, ceux dont le titre commence par « Ateliers ») ;
  - « Afficher la note finale aux étudiants » (désactivé par défaut) ;
  - modification réservée à l'enseignant propriétaire, avec CSRF, et auditée.
- **Qui la voit :**
  - **Enseignant :** dans Résultats, un tableau avec chaque composante et un détail par étudiant ; export séparé `results/final.csv`. L'export historique des résultats garde exactement ses colonnes, déjà utilisées dans des tableurs.
  - **Observateur « Administration » :** une colonne triable dans Notes, le détail dans la fiche, une colonne dans le CSV et dans le rapport PDF.
  - **Invité :** jamais, comme les autres notes.
  - **Étudiant :** un panneau « Note finale » sur le tableau de bord, seulement quand l'enseignant l'active.

## Conséquences
- Migration `0019_final_grade`, après `0018_project_reminders` (une seule tête) : une colonne de plus et une table de plus ; rien n'est modifié dans les tables existantes.
- Tests :
  - `tests/test_final_grade.py` : calcul exact, plafond, réglages personnalisés, parties en attente, ateliers marqués bonus, arrondi, points stockés inchangés, ancienne grille conservée, droits par rôle ;
  - `test_project.py` et `test_ownership.py` mis à jour.
