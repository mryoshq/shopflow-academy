# ADR-0026 — Classement facultatif de la classe (partie K)

Date : 2026-10-28. Statut : proposé, en revue sur `codex/k-classement`.

## Besoin et critères d’acceptation

L’enseignant peut proposer une émulation collective sans imposer un classement.
Le classement démarre désactivé. Seuls les étudiants inscrits et le propriétaire
du cours y accèdent. Il affiche un pseudonyme, les totaux principaux et bonus
séparés, et le nombre de blocs terminés. Il ne publie aucune note par mission,
réponse, adresse de connexion ou identité technique d’un autre étudiant.

## Décisions

- Deux tables propres à K (migration `0011_leaderboard`) : réglages par
  couple classe/cours, conservés entre publications ; pseudonyme par utilisateur.
  Aucun changement aux tentatives, à la notation, au barème ou à l’export CSV.
  La migration suit `0010_attempt_rules` de L, intégré par merge de `main` ;
  elle n’ajoute pas de tête Alembic parallèle.
- Le classement lit `mission_scores` et `course_score`, comme le suivi existant.
  Il conserve les points stockés et le meilleur résultat par version, sans
  réévaluer une réponse. Les comptes désactivés sont exclus.
- Classement général : points principaux décroissants, puis bonus décroissants.
  Rang de compétition (`1, 1, 3`). L’ordre alphabétique ne départage que
  l’affichage des ex æquo, jamais leur rang.
- Option « top 3 et sa propre position » : tous les rangs inférieurs ou égaux à
  trois, avec tous leurs ex æquo, puis la ligne de l’étudiant connecté si elle
  est au-delà. Au démarrage, des scores tous identiques peuvent donc afficher
  toute la classe. Même limite pour l’enseignant, sans ligne personnelle.
  Le serveur filtre les lignes avant de les retourner.
- Option « masquer pendant un bloc ouvert » : dès qu’un bloc de cette
  publication est ouvert pour la classe, les deux tableaux sont vides dans
  l’API et masqués dans l’interface, y compris pour l’enseignant. Les réglages
  restent accessibles pour qu’il puisse désactiver cette option.
- Un bloc est terminé lorsque toutes ses activités principales, leçons
  comprises, ont une tentative réussie. Les bonus et chapitres exclusivement
  bonus ne sont pas requis. Fermer un bloc ne retire pas sa réalisation.
- « Progression du jour » trie uniquement par blocs terminés aujourd’hui,
  avec les mêmes règles d’ex æquo et de visibilité. La date est celle du fuseau
  IANA `Africa/Casablanca`. La fin d’un bloc est la plus tardive des premières
  réussites de ses activités principales ; rejouer une activité terminée ne
  déplace pas cette date. Les versions sont celles de la publication attribuée.
  Sa réponse API contient seulement rang, pseudonyme, repère personnel et compteur
  du jour : aucun total de points d’une ligne masquée au classement général.
- Noms : toujours le nom réel déduit de l’identifiant (`prenom.nom@ynov.com` →
  « Prénom Nom » : partie avant `@`, découpée sur `.`, `-`, `_`, majuscule
  initiale), décision du propriétaire du 28/10/2026. La saisie d’un pseudonyme
  est retirée (route supprimée) ; les pseudonymes déjà saisis sont ignorés.
  L’adresse et le domaine ne sortent jamais de l’API ; « Élève N » seulement si
  rien d’exploitable ne reste. Le repère « Vous » identifie la ligne personnelle.
- API sous les préfixes étudiants/enseignant existants, contrôles de rôle,
  d’inscription ou de propriété à chaque requête, CSRF sur les écritures.
  Désactivé : `404` pour l’étudiant, y compris par lien direct. Réponses sans
  cache. La liste de navigation étudiante exclut les classements désactivés.
- Nouvelle page `#/classement/<assignment_id>`, isolée des écrans H/L.
  Actualisation toutes les 5 secondes ; en cas d’erreur, les anciennes lignes
  disparaissent jusqu’au retour du réseau. Retour et navigation par historique
  du navigateur pris en charge, avec arrêt du rafraîchissement au démontage.
- Chakra UI v3, jetons sémantiques du thème, tableau défilable au clavier sur
  petit écran, marque textuelle et visuelle de la ligne personnelle. Podium SVG
  original et décoratif, sans personnage ni marque. Les symboles de récompense
  sont limités à cette page et accompagnés de libellés accessibles. Animation
  d’entrée brève, désactivée avec `prefers-reduced-motion`.

## Vérifications et limites

Tests ciblés : pytest (base SQLite migrée, matrice d’autorisation comprise),
Vitest (page et intégration App), TypeScript, une spec Playwright du classement
(enseignant et étudiant, clavier, rafraîchissement, mobile, clair/sombre,
réduction des mouvements et axe WCAG A/AA). Les données navigateur sont
entièrement fictives et les réponses API simulées ; les droits et les scores
sont testés sur la véritable API dans pytest. La stack complète et PostgreSQL
relèvent de la CI ; aucun test local ne touche la production.

Le polling vise une actualisation inférieure à 10 secondes lorsque l’API répond.
Une coupure réseau ne permet pas de garantir un délai, et masque les tableaux.
Les statistiques de classement ne sont ni persistées comme notes ni exportées.
La partie K n’introduit pas de changement pédagogique ni d’import de contenu.

## Mise en service et retour arrière

Avant déploiement autorisé : sauvegarder la base puis appliquer les migrations
avec la procédure habituelle. Confirmer la tête Alembic unique si H/L a ajouté
une migration pendant la revue. Laisser le classement désactivé tant que
l’enseignant ne l’a pas explicitement activé dans cette page.

Pour retirer l’affichage, désactiver le classement. Le code de notation et les
notes restent identiques. Un retour arrière du code conserve les deux tables
sans effet sur les parcours ; un downgrade éventuel ne supprime que les
préférences et pseudonymes de K, après sauvegarde et autorisation.
