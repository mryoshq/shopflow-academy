# ADR-0030 — Report des réussites quand seul le texte change

- Statut : accepté (28/10/2026)
- Contexte : sprint 3, partie P. Une mission notée dont seul le paragraphe d'explication avait été découpé changeait de version, et ses réussites disparaissaient de l'affichage. Une simulation en production a donné 4 missions, 23 réussites et jusqu'à 13 points pour 7 étudiants. Les tentatives restaient intactes en base.

## Décision

- Le report entre deux versions de la **même mission** ne demande plus une définition privée identique. Il demande une **signature de notation** identique (`app/carryover.py`, `grading_signature`). La signature contient :
  - `kind` ;
  - les identifiants des choix et des cibles (ensembles triés) ;
  - `correct_ids` (dans l'ordre, ce qui couvre l'ordre attendu d'un `reorder`), `correct_pairs`, `action_id` ;
  - `expected_sql`, `compare` ;
  - `max_points`, `scoring`, `bonus`.

  Une clé absente vaut sa valeur par défaut.
- Les changements de texte seuls ne cassent pas le report : `scenario`, `instructions`, `explanation`, `feedback`, `hints`, `resources`, médias (`display_data`), libellés des choix (à identifiant égal), objectifs et durée.
- Si un élément de notation change, il n'y a pas de report (comportement inchangé).
- Garanties conservées :
  - « même mission » reste défini comme avant : même ligne de mission, ou même slug à la même place du cours ;
  - une tentative ne compte que pour une mission (#44) ;
  - une leçon ou une révision ne garde « lu » qu'avec le même type, et ne rapporte jamais de points ;
  - une mission devenue leçon vaut 0 point ;
  - les points stockés (règles L, ADR-0027) ne sont jamais recalculés : le report est fait à la lecture et le rejeu des notes reste identique.
- **Vérification avant publication**, en lecture seule. Elle simule la publication du brouillon actuel et liste, par classe et par mission, les réussites et les points qui ne seraient plus affichés. Raison donnée : « notation modifiée », « devenue leçon ou révision » ou « supprimée du brouillon ». Deux accès :
  - commande `python -m app.carryover --course <slug>` (dans le conteneur backend) : code de sortie 0 si rien n'est perdu, 1 sinon, 2 si le cours est introuvable ;
  - route `GET /api/v1/teacher/courses/{id}/carryover-check` (enseignant propriétaire, aucune écriture).

## Conséquences

- Pas de migration ni de recalcul : après déploiement, les réussites reportables réapparaissent d'elles-mêmes.
- Un auteur peut reformuler une mission publiée sans pénaliser la classe. Changer la bonne réponse, les points ou le barème remet la mission à zéro, comme avant ; la commande le signale avant la publication.
