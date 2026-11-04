# ADR-0050 — Rafi : « Que faire maintenant ? »

Statut : proposé (03/11/2026)

## Contexte
Les étudiants ne savent pas toujours quelle action faire ensuite (blocs ouverts, bonus, jalons du projet).

## Décision
- `GET /api/v1/student/rafi` renvoie aussi `next`, calculé côté serveur : première mission notée non terminée d'un bloc ouvert, sinon un bonus ouvert, sinon la prochaine échéance du projet non rendue, sinon `done`. Seuls les titres déjà visibles par l'étudiant sont renvoyés ; aucun corrigé, aucun indice.
- Un clic sur Rafi affiche cette étape dans une bulle (`role=status`) avec un lien « Y aller ».
- Une annonce n'ouvre la bulle d'elle-même qu'une fois toutes les 10 minutes au plus ; les autres attendent derrière la pastille.

## Conséquences
Aucune migration. Pas de mode silence enseignant ni de récapitulatif de fin de séance dans ce lot (suite possible).
