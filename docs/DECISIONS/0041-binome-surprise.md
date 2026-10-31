# ADR-0041 — Binôme surprise : plus de travail individuel dans l'espace projet

Date : 31 octobre 2026 · Statut : accepté (demande du propriétaire) · Complète l'ADR-0034

## Contexte
Pour la seconde partie du projet CampusEquip, le travail individuel n'est plus permis. Un étudiant sans binôme doit pouvoir en trouver un sans démarche gênante, et l'enseignant doit pouvoir compléter les équipes en une fois, de façon équitable et traçable.

## Décision
- **Côté étudiant**, sans équipe, deux choix :
  - « Former mon binôme » : comme avant, il crée l'équipe et invite un camarade, qui accepte ;
  - « Je tente le binôme surprise » : il s'inscrit au tirage (`project_draw_entries`). Il voit son statut et le nombre d'inscrits. Il peut sortir du tirage tant que celui-ci n'a pas eu lieu.

  L'option « travailler seul » disparaît. Une équipe d'une seule personne attend son camarade et **ne peut plus déposer** (409, message explicite) ; ses dépôts antérieurs restent consultables.
- **Côté enseignant**, Projet > Binômes > « Binôme surprise » :
  - la liste des étudiants sans équipe, avec les inscrits mis en évidence ;
  - les équipes d'une seule personne, proposées au tirage seulement si l'enseignant coche la case (accord explicite, décoché par défaut) ;
  - « Lancer le tirage » affiche un **aperçu** (rien n'est écrit), « Autre tirage » refait l'aperçu, « Valider ce tirage » enregistre.
- **Tirage côté serveur** (`backend/app/project_draw.py`) :
  - il apparie au hasard tous les étudiants actifs sans équipe, inscrits ou non, et les équipes d'une personne retenues ;
  - un nombre impair forme **un trinôme** ; une personne seule n'est jamais tirée (« moins de deux personnes » : à apparier à la main) ;
  - déterministe pour une graine et un groupe de départ donnés (`random.Random(graine)` sur des listes triées). L'aperçu renvoie la graine et une empreinte du groupe de départ ; la validation les renvoie, et le serveur refait exactement le même tirage. Si la classe a changé entre-temps, l'empreinte ne correspond plus : 409, refaire l'aperçu ;
  - **idempotent** : valider deux fois la même graine rejoue le tirage enregistré, sans rien créer (contrainte unique `cohort_id, seed`) ;
  - **non relançable sans confirmation** : après un premier tirage, un nouveau demande `confirm_again`, et l'interface affiche une seconde confirmation ;
  - **enregistré et audité** : `project_draws` garde la graine, le groupe de départ, les équipes incluses, les groupes et les personnes laissées de côté, avec l'auteur et la date. `audit_events` reçoit `project.draw` (ainsi que `project.draw_join` et `project.draw_leave`).
- **Rien ne bouge de ce qui existe** : les équipes de deux ne sont jamais touchées. Une équipe d'une personne qui a déjà du travail (dépôt, fichier, commentaire, note ou créneau) devient l'équipe du groupe et garde tout. Deux équipes de ce type ne sont jamais réunies ; l'excédent est signalé « à apparier à la main ». Une équipe d'une personne sans travail est remplacée par l'équipe du groupe.
- **Effet ludique** :
  - chaque étudiant tiré au sort reçoit une notification « Binôme surprise : vous travaillerez avec … » (type `project_draw`, qui rafraîchit la page) ;
  - à la première ouverture de l'espace Projet après le tirage, des cartes « ? » se retournent sur le nom du camarade (800 ms par carte, décalées de 200 ms, soit environ 1,2 s pour un trinôme), avec « Votre binôme surprise : … » ;
  - la révélation est montrée **une seule fois**, notée côté serveur (`project_members.revealed_at`) ;
  - l'animation passe par l'API Web Animations, décorative (`aria-hidden`), et est coupée par « Réduire les animations » ou `prefers-reduced-motion` : le nom s'affiche alors directement ;
  - le titre est annoncé (`role="status"`).
- **Droits** : seul l'enseignant qui possède un cours de la classe voit le tirage, l'aperçu et la validation. Un étudiant ne s'inscrit que dans sa propre classe. La matrice d'autorisation et le test de propriété couvrent les nouvelles routes.
- Textes traduits en anglais (ADR-0040), y compris la notification.

## Conséquences
- Migration `0016_project_draw` : deux tables (`project_draws`, `project_draw_entries`) et deux colonnes nullables dans `project_members` (`draw_id`, `revealed_at`). Sauvegarde manuelle avant le déploiement.
- `draw_id` n'a pas de clé étrangère : c'est un repère d'audit, qui reste lisible même si un tirage est un jour purgé.
- L'enseignant garde la main : il peut toujours corriger une composition (y compris un trinôme) dans Projet > Binômes.
