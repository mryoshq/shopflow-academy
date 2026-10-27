# ADR-0009 — Studio de cours no-code

**Date :** 2026-10-27
**Statut :** accepté pour P0-04

## Contexte

P0-03 fournit les brouillons, la validation des définitions, les versions de cours et la projection étudiante. Le professeur doit utiliser ce modèle depuis le navigateur avant l'intégration des véritables cours. Le dépôt est public et les corrigés doivent rester privés.

## Décision

- L'interface React/Chakra UI v3 édite le référentiel générique via les API enseignant. Les types de missions sont choisis par formulaire ; les choix, indices, tableaux et graphiques sont des données validées côté serveur.
- L'aperçu appelle une projection sans clés de correction. Une simulation locale de l'enseignant peut comparer une réponse à la définition privée déjà autorisée, sans requête de soumission ni score.
- La publication vérifie les missions et crée une version figée. L'attribution vise cette version, pas le brouillon. Le lecteur étudiant ne reçoit que la projection expurgée ; un filtre de compatibilité protège aussi les versions plus anciennes.
- L'archivage est irréversible dans ce lot, bloque toute édition/attribution et retire les versions des routes étudiantes. L'enseignant garde un accès en lecture.
- L'import/export JSON de définition d'une mission reste facultatif dans l'éditeur ; l'import/export de cours complets et son roundtrip relèvent de P0-08.
- Les tests navigateur utilisent uniquement des comptes fictifs et la stack Compose locale. La publication sur Cloudflare reste soumise à accord séparé.

## Conséquences

Le professeur peut construire et publier des démonstrations sans modifier React. La correction déterministe, la progression et les dashboards restent dans les lots suivants. Les fichiers locaux d'identifiants sont ignorés par Git ; aucun e-mail n'est envoyé par le studio.
