# ADR-0022b — Plan du cours, catégories d'objectifs, logo et icônes

**Date :** 2026-10-28
**Statut :** accepté (demande du propriétaire, sprint 2, partie G, points 4 à 7 ; PR « G2 » distincte de la PR #32 qui porte ADR-0022)

## Contexte

Avec un cours réel de plusieurs modules et une trentaine de blocs, la liste plate du studio et le sélecteur de l'aperçu ne permettaient plus de repérer une mission, de voir la charge d'un bloc ni les objectifs non couverts. Les objectifs n'avaient pas de regroupement. L'application n'avait ni favicon ni icônes, qu'il faudra aussi pour la PWA (partie I).

## Décision

- **Plan du cours** (`frontend/src/studio/CourseOutline.tsx`), un seul composant pour le studio et l'aperçu : module → bloc → éléments. Blocs repliables, le bloc courant ouvert. Une ligne par élément (titre, type, points, durée, badges, état), un en-tête de bloc (numéro, titre, durée, points), des compteurs, une recherche et un filtre par type. L'aperçu ajoute la navigation par bloc. L'état d'un élément est calculé dans le navigateur : « À compléter » (pas de définition), « Erreur » (objectif inconnu), sinon « Valide » (les définitions sont validées par le serveur à l'enregistrement).
- **Catégorie d'objectif** : colonne `learning_objectives.category` (migration **0009**, vide par défaut). Elle est acceptée dans l'en-tête Markdown, l'API du studio et l'export/import JSON. Une catégorie vide est déduite du préfixe du code (`SQL-`, `PY-`, `BLOC-`), avec la même règle côté serveur (`app.curriculum.objective_category`) et côté client (`studio/kinds.ts`).
- **Aucun code d'objectif côté étudiant** : la vue « cours » de l'étudiant ne renvoie plus que l'id et l'énoncé des objectifs. Le tableau de bord donne, pour chaque bloc ouvert, un objectif en une phrase (un objectif de bloc s'il y en a un, sinon le premier couvert). Un bloc fermé ne donne rien.
- **Logo** : monogramme original, tracé en SVG, dans la palette du thème. Favicon SVG et PNG 32/192/512, apple-touch-icon, icône masquable, `theme-color` clair et sombre. Les PNG sont générés par un script Playwright (aucune dépendance ajoutée) et versionnés.

## Conséquences

- Migration 0009 à appliquer au redéploiement (ajout de colonne, sans perte, réversible).
- Les cours importés avant la migration gardent des catégories déduites du préfixe ; les versions publiées avant n'ont pas de catégorie dans leur instantané, et la déduction s'applique aussi.
- Le format `shopflow-course` v1 reste compatible : `category` est facultatif à l'import comme à l'export.
