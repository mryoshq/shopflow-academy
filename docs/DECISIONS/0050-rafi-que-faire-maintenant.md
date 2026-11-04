# ADR-0050 — Rafi : « Que faire maintenant ? »

Statut : accepté. Aide manuelle livrée par la PR #89 (03/11/2026).

## Contexte
Les étudiants ne savent pas toujours quelle action faire ensuite (blocs ouverts, bonus, jalons du projet).

## Décision
- `GET /api/v1/student/rafi` renvoie aussi `next`, calculé côté serveur : première mission notée non terminée d'un bloc ouvert, sinon un bonus ouvert, sinon la prochaine échéance du projet non rendue, sinon `done`. Seuls les titres déjà visibles par l'étudiant sont renvoyés ; aucun corrigé, aucun indice.
- Le bouton « Que faire maintenant ? » affiche cette étape dans une bulle (`role=status`) avec un lien « Y aller ». L’avatar reste le point d’entrée de la file d’annonces.
- Une annonce n'ouvre la bulle d'elle-même qu'une fois toutes les 10 minutes au plus ; les autres attendent derrière la pastille.

## Suite du 4 novembre

Dans Réglages → Notifications, l’enseignant peut activer le mode silencieux d’une classe séparément des sons. Rafi laisse les annonces dans le centre et derrière sa pastille. Le bouton d’aide et l’ouverture manuelle de la file restent accessibles. Lorsqu’un étudiant appartient à plusieurs classes actives, le silence de l’une d’elles s’applique à son assistant commun. Le réglage concerne Rafi dans la page. Les abonnements Web Push du navigateur sont gérés séparément.

Toutes les annonces présentées par Rafi partagent un intervalle de dix minutes entre les ouvertures automatiques. Le navigateur mémorise par compte l’heure et les annonces déjà prises en compte. Les onglets se coordonnent avec Web Locks lorsque le navigateur le permet. Si le stockage est indisponible, la limite s’applique pendant le montage courant. La lecture manuelle demeure disponible pendant cet intervalle.

L’heure du récapitulatif est facultative et interprétée dans `Africa/Casablanca`. La boucle existante l’envoie au premier passage à partir de cette heure, au plus une fois par étudiant, affectation et date locale. Une journée de séance suppose une ouverture de bloc, une ouverture individuelle ou une tentative enregistrée dans la classe depuis minuit local. Le récapitulatif porte sur les missions principales non réussies des blocs ouverts pour l’élève. Il propose la première mission accessible, ou le tableau de bord si un prérequis bloque l’accès. Le serveur écarte les séances sans activité, les classes en pause, les cours archivés et les élèves sans mission principale restante.

Une félicitation accompagne la première transition réelle d’un bloc vers l’état terminé. Elle est enregistrée dans la transaction de la tentative, avec verrou par élève et clé unique. La règle habituelle s’applique aux missions principales, ou aux leçons dans un bloc qui ne contient que des leçons et des bonus. La lecture d’une page et une réussite déjà reportée après republication ne créent pas de félicitation. Les deux annonces sont rattachées à une affectation active, vérifiée à la lecture et pour le nombre de notifications non lues.

Les réglages réutilisent `notification_settings` et les annonces réutilisent la contrainte de déduplication de `notifications`. Ce lot ne nécessite aucune migration.
