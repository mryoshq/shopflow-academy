# ADR-0027 — Décourager le clic au hasard

- Statut : accepté (28/10/2026)
- Contexte : sprint 2, partie L (prioritaire, avant H, K, I, J)

## Contexte

Certains étudiants cliquent sans lire jusqu'à trouver la bonne réponse : le meilleur essai comptant, rien ne les en dissuade. Le propriétaire veut des mesures réglables par cours, sans sanction automatique et sans régression pour les étudiants qui utilisent déjà la plateforme.

## Décision

Réglages par cours (`courses.attempt_rules`, JSON validé), dans « Mon cours » → onglet « Règles ». Chaque mesure s'active séparément. Chaque enregistrement est audité (`course.attempt_rules`). Valeurs par défaut :

| Mesure | Par défaut | Règle |
|---|---|---|
| Points dégressifs (missions principales) | désactivée | 100 / 70 / 50 % puis 30 % (plancher) selon le rang de l'essai ; jamais pour les bonus. |
| Pause après une erreur | désactivée | 10, 20 puis 30 s (30 s au plus). Le serveur répond 429 avec `retry_after` et l'en-tête `Retry-After`. Pas de pause après une bonne réponse. |
| Lecture minimale des leçons | désactivée | mots ÷ 200 par minute, bornée entre 10 et 60 s. Barre de progression côté étudiant ; « J'ai compris » refusé avant ce délai par le serveur (429). |
| Repérer les clics rapides | activée (visible par l'enseignant seulement) | essai moins de 5 s après l'ouverture de la mission, ou 3 essais en moins de 30 s. Badge « Clics rapides » dans « Ma classe » ; aucune sanction. |
| Annonce aux étudiants | activée, texte modifiable (280 caractères) | bandeau sur le tableau de bord dès qu'une des trois premières mesures est active. |

- **Pourcentage enregistré par essai** (`mission_attempts.percent`, `attempt_number`, `fast`) ; points = points bruts × pourcentage. Le meilleur essai reste retenu.
- **Non rétroactif** : l'activation est datée (`decay_since`, `pause_since`) ; seuls les essais postérieurs sont concernés et leur rang est compté depuis cette date. Les essais antérieurs gardent `percent = NULL` et leurs points.
- **Déterministe et rejouable** : `progress.replay` applique le pourcentage enregistré ; même réponse, même rang, même résultat.
- **Idempotence d'abord** : un double-clic (même clé d'idempotence) renvoie l'essai déjà enregistré avant tout contrôle de pause.
- **Ouverture des missions** : table `mission_openings` (première ouverture par étudiant et version de mission).
- Avant de valider, l'étudiant voit « Essai N : jusqu'à P % des points ».

## Conséquences

- Migration **0010** (colonne `courses.attempt_rules`, colonnes d'essai, table `mission_openings`), sans perte : toutes les valeurs existantes restent valables.
- Rien ne change pour les étudiants tant que l'enseignant n'active pas les règles ; à faire hors d'un bloc ouvert.
- Les exports gardent les points enregistrés ; le badge « clics rapides » n'entre jamais dans la note.
