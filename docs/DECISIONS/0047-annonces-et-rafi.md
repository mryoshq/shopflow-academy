# ADR-0047 — Annonces automatiques et Rafi

Date : 1er novembre 2026 · Statut : accepté (demande du propriétaire)

## Contexte
Les rappels des jalons (ADR-0045) arrivaient en toasts, au milieu des autres notifications. Le propriétaire veut :
- des annonces plus visibles, présentées par un personnage, Rafi ;
- un rappel le jour même ;
- un compte à rebours vers la prochaine échéance ;
- une relance douce pour les blocs ouverts et pas encore terminés.

L'image de Rafi est celle du propriétaire (`docs/design/rafi.jpg`, déclinée en WebP 512, 216 et 144 px) : elle ne doit être ni redessinée, ni retouchée, ni détourée.

## Décision

### Annonces (serveur)
Toutes les annonces sont des notifications ordinaires (`app.live.notify`) :
- idempotentes grâce à leur clé de déduplication ;
- journalisées (`academy.reminders`, `academy.announcements`) ;
- traduites en anglais dans le navigateur (`serverText`) ;
- envoyées par la boucle de fond existante du backend (`autoplan.tick`). Rien n'est à planifier sur le Mac.

Elles sont de trois sortes :
- **Rappels des jalons** : 3 jours avant, 1 jour avant et **le jour même**, à 9 h heure du Maroc, désactivables par jalon (ADR-0045). Le rappel du jour même dit « C'est aujourd'hui : « … » est attendu à HH:MM. Vous y êtes presque ! ». Une échéance avant 9 h n'a pas de rappel le jour même. Lien vers l'espace projet.
- **Bloc ouvert pas encore terminé** :
  - une fois par étudiant et par bloc (clé `open-block:<classe>:<bloc>`), à partir de 9 h (heure du Maroc) le lendemain de l'ouverture du bloc pour la classe ;
  - seulement si l'étudiant n'a pas réussi toutes les missions notées du bloc, et jamais pour une classe en pause ;
  - lien vers la première mission à terminer ;
  - le calcul complet tourne une fois par jour et par processus.
- **Messages de l'enseignant** : même canal (type `message`).

**Compte à rebours :** le tableau de bord de l'étudiant reçoit la prochaine échéance du projet (`next_deadline`) : titre, date, heure du Maroc calculée par le serveur, « Déposé » si le binôme a déjà déposé une version.

**Sons pour toute la classe :** l'enseignant peut les couper (Réglages > Notifications), choix stocké dans ses propres réglages (`notification_settings`, clé `rafi_muted_assignments`, sans nouvelle table). L'étudiant le lit par `GET /student/rafi`.

### Rafi (interface étudiant)
- **Image :** affichée telle quelle, à 72 px, avec `srcset` (144, 216, 512).
- **Yeux :**
  - un SVG transparent de même repère (512 × 520) se pose sur l'image ;
  - dans l'ouverture de chaque œil (`clipPath`), une petite pupille et son reflet couvrent exactement les siens ;
  - elles suivent le curseur et le doigt de 2 px au plus, avec un lissage ;
  - une paupière (`#lids-l`, `#lids-r`) se ferme toutes les 3,5 à 7 s.
  - Au repos, l'image est identique à l'original.
- **Réactions au toucher**, variées, jamais la même deux fois de suite : clin d'œil, petit saut, légère bascule, regard vers l'élève. Rien d'autre n'est animé (ni sourcils ni oreilles).
- **Annonces :** une bulle (`role="status"`) avec le type, l'expéditeur, la position dans la file (« 1 sur 3 »), le texte, le lien, « J'ai lu » (accusé de lecture) et « Fermer l'annonce ». Quand Rafi est replié, les annonces redeviennent des toasts.
- **Repli :** bouton « Replier Rafi », état mémorisé dans le navigateur ; le bouton replié montre le nombre d'annonces en attente.
- **Sons :**
  - Web Audio, sans fichier : deux notes à l'arrivée d'une annonce (au plus une fois toutes les 30 s), une note sur un toucher sur trois ;
  - rien avant la première interaction avec la page ;
  - coupables sur Rafi, dans Paramètres > Apparence (« Sons de Rafi ») et par l'enseignant pour la classe.
- **« Réduire les animations »** (réglage de l'Academy ou du système) fige tout : pupilles immobiles, pas de clignement ni de réaction.
- **Où il apparaît :** jamais côté enseignant ni observateur, sauf dans la « Vue étudiant ». Dans la vue étudiant, il n'y a pas d'annonce et les sons sont coupés.

## Conséquences
- Pas de migration.
- Tests :
  - pytest : `test_project_reminders.py` (rappel du jour même), `test_announcements.py` (bloc à terminer : jour, heure, unicité, élève qui a fini ; compte à rebours ; sons de la classe ; droits) ;
  - Vitest : `rafi.test.tsx` ;
  - e2e : `e2e/rafi.spec.ts`, avec axe en clair et en sombre, à 1366 et 390 px.
- Captures : `docs/captures/rafi/`, dont `zoom-repos.png` et `zoom-regard.png` (échelle 4).
