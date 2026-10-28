# ADR-0034 — Espace projet CampusEquip

- Statut : accepté (29/10/2026)
- Contexte : sprint 3, partie R. Le projet de fin de module se fait en binôme : conception le 29 octobre, rendu final, soutenance le 23 novembre.

## Décision

- **Rattachement à la classe** (`cohort_id`), stable d'une version publiée du cours à l'autre. Migration `0014_project` : tables nouvelles, plus `observers.project_access` (faux par défaut).
- **Binômes** :
  - un étudiant crée son binôme et invite un camarade de la classe, qui accepte ou refuse ; un binôme peut rester seul ;
  - une personne n'appartient qu'à un binôme par classe (contrainte unique `cohort_id, user_id`) ;
  - on ne peut plus quitter un binôme qui a déjà déposé ;
  - l'enseignant crée, corrige ou supprime la composition (suppression refusée après un dépôt).
- **Jalons** de l'enseignant : titre, consignes, date limite facultative, livrables attendus (liste), ordre. Exemples : conception du 29 octobre, rendu final, soutenance.
- **Dépôts** par binôme et par jalon :
  - chaque envoi crée une **version horodatée** (v1, v2…) ; un dépôt après la date limite est accepté et marqué « en retard » ;
  - contenu : un texte (éditeur simple, tableaux Markdown `| a | b |`, aperçu, jamais de HTML), un lien `https://`, des fichiers ;
  - fichiers : pdf, png, jpg, md, zip, 20 Mo au plus, signature vérifiée. Ils sont envoyés en corps brut (pas de dépendance multipart), stockés **hors base** dans `/srv/media/project/` (volume du Mac, jamais servi par la passerelle) et servis par l'API, en pièce jointe, au seul binôme et à l'enseignant. La passerelle accepte 21 Mo sur cette seule route.
- **Côté enseignant** :
  - liste des dépôts par jalon, lecture de toutes les versions dans un panneau latéral ;
  - commentaire visible du binôme ;
  - grille sur 20, séparée de la note du cours : SQL 4, Python 4, MongoDB et Redis 3, Airflow 3, reproductibilité et preuves 2 (points communs), compréhension individuelle 4 par étudiant ;
  - export CSV des notes du projet (`etudiant;binome;…;commun_16;individuel_4;total_20`).
- **Soutenances** : créneaux (début, fin, salle), attribués à un binôme (un créneau par binôme), visibles de tous les étudiants de la classe ; le créneau du binôme est mis en évidence.
- **Droits** :
  - un binôme ne voit que ses propres dépôts, fichiers et commentaires (404 sinon) ;
  - l'enseignant doit posséder un cours donné à la classe ;
  - l'observateur ne voit rien du projet sauf si l'enseignant coche « Espace projet visible » : vue en lecture seule, anonymisée selon son réglage, consultation auditée ;
  - chaque écriture est inscrite dans `audit_events` (`project.*`). La matrice d'autorisation et le test de propriété couvrent les nouvelles routes.

## Conséquences
- Migration : sauvegarder la base avant le déploiement.
- Le volume `media_data` reçoit `project/`. La sauvegarde de ce volume (runbook) couvre les fichiers des binômes.
