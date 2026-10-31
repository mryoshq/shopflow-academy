# ADR-0039 — Séries, badges, niveaux, objectif de classe et retours vivants

Date : 31 octobre 2026 · Statut : accepté (demande du propriétaire)

## Contexte
Le propriétaire veut plus de plaisir dans le parcours, sans jamais pénaliser : la note principale ne change pas, la notation reste déterministe côté serveur et rien n'est donné par une IA.

## Décision
- **Tout est dérivé du journal des tentatives** (`mission_attempts`, ajout seul), par `backend/app/rewards.py`. Le travail fait avant une republication compte, comme pour les scores (`progress.attempts_for`).
- **Série** : nombre de missions notées réussies **du premier coup**, à la suite, dans l'ordre des tentatives.
  - Un essai raté remet la série à zéro, sans aucun message.
  - Les leçons et révisions ne comptent pas.
  - Un essai sur une mission déjà réussie (entraînement) ne compte pas et ne casse rien.
  - Calculée à chaque lecture, jamais stockée. Effet visuel discret à 3, 5 et 10 (pastille « Série : N » qui grossit brièvement, 420 ms).
- **Points d'expérience (XP)**, distincts de la note :
  - mission principale réussie : 10 XP ;
  - bonus réussi : 15 XP ;
  - leçon ou révision lue : 3 XP.

  Calculés à chaque lecture.
- **Niveaux** (seuils en XP) : Stagiaire Data (0), Analyste Junior (30), Analyste Data (80), Data Engineer Junior (150), Data Engineer (250), Data Engineer Confirmé (400), Senior Data Engineer (600), Lead Data Engineer (850). Barre de progression vers le niveau suivant sur le tableau de bord.
- **Badges** (règles version 1, `RULES_VERSION`) :
  - « Première mission réussie » ;
  - « Premier bloc terminé » ;
  - « Série de 5 » et « Série de 10 » (meilleure série) ;
  - un badge par objectif dont toutes les missions principales sont réussies : « Objectif atteint : <première phrase de l'énoncé> ». Sa clé est une empreinte du code (`objective:<sha256 tronqué>`) : l'étudiant ne voit jamais un code d'objectif (ADR-0022) ;
  - « Tous les bonus : <module> », pour chaque module qui a des bonus (clé `bonus:<titre>`).
- **Collection** : les badges gagnés d'abord, puis ceux « à découvrir » avec la manière de les obtenir. Un badge lié à des missions (objectif, bonus) n'est annoncé qu'une fois l'un de ses blocs ouvert : un bloc fermé n'expose rien.
- **Stockage des badges** : table `student_badges`, unique par élève, cours et clé, avec la version des règles et la date.
  - Un badge gagné est gardé, même si le cours change ensuite.
  - L'attribution est idempotente (contrainte unique, point de sauvegarde) : rejouer une tentative (même clé d'idempotence) n'attribue rien.
  - Notification « Nouveau badge : … » au gain (dédupliquée).
  - Recalcul : `python -m app.rewards recompute`, silencieux (sans notification) ; il tourne aussi sans bruit à l'ouverture du tableau de bord, ce qui couvre les tentatives antérieures au déploiement.
- **Objectif de classe** :
  - Une barre commune, sans aucun nom : « La classe a réussi 120 missions sur 200 » (missions principales réussies par toute la classe) ou « La classe a terminé N blocs sur M ».
  - L'enseignant choisit la mesure et la cible dans Réglages > Objectif de classe (table `class_goals`). Sans réglage, la cible par défaut est « tout le monde, tout le cours ».
  - Paliers 25, 50, 75 et 100 % : une notification à toute la classe, pour le plus haut palier franchi, dédupliquée par cible.
  - Visible sur le tableau de bord étudiant et en tête de « Ma classe ».
- **Retours vivants** (`frontend/src/rewards/celebrate.ts`) :
  - à la fin d'un bloc, une trentaine de petits confettis tombent pendant 0,9 s (transform et opacity, répartition fixe, décoratifs, `aria-hidden`, sans clic possible) ;
  - son court facultatif (deux notes générées dans le navigateur, sans fichier), **coupé par défaut**, réglage dans Paramètres > Apparence (`shopflow:sound`) ;
  - confettis, son et animation de série sont coupés avec « Réduire les animations » ou `prefers-reduced-motion`.
- **Ce qui ne change pas** : scores, note, verrouillages, export CSV des notes et des résultats, classement facultatif. Les XP, niveaux et badges n'apparaissent jamais dans un export.

## Conséquences
- Migration `0015_rewards` (deux tables, une seule tête). Aucun calcul de note n'est touché.
- L'enseignant voit le niveau, les séries et les badges dans le panneau d'un élève, à part de la note.
- Changer une règle de badge = incrémenter `RULES_VERSION` ; les badges déjà gagnés restent.
