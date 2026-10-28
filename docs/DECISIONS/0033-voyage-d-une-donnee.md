# ADR-0033 — « Le voyage d'une donnée » dans l'Academy

- Statut : accepté pour le cadre ; intégration de l'application **en attente de l'archive du propriétaire** (`ShopFlow-voyage.zip`)
- Contexte : sprint 3, partie Q. Le propriétaire fournit une application React, TypeScript et Chakra UI v3 en sept scènes. Son modèle (`src/model.ts`) indique qu'il lui manquait le kit pour les valeurs exactes.

## Décision

- **Page de l'Academy** `#/voyage` et `#/voyage/<scène>` (1 à 7), pour les étudiants et les enseignants. Le retour arrière du navigateur suit les scènes.
- **Chargement différé** : le code est dans `frontend/src/voyage/`, chargé par `React.lazy` dans un fichier séparé (2 Ko aujourd'hui). Le reste de l'application ne s'alourdit pas.
- **Ouverture depuis une leçon** : nouveau `data.kind: experience` avec `experience: voyage`, `scene` facultative (1 à 7), `title` facultatif, `data_file: experiences/voyage.json` facultatif.
- **Valeurs exactes données par le cours** : le fichier JSON du dossier du cours (200 Ko et 8 niveaux au plus) est intégré à la leçon à la compilation.
  - Route `GET /api/v1/experiences/voyage/data` : renvoie les valeurs du premier cours visible par l'utilisateur, ou `null` (élève inscrit ou enseignant propriétaire ; 403 pour un observateur).
  - La page fusionne ces valeurs avec ses valeurs par défaut : les objets clé par clé, les listes et les valeurs simples sont remplacées.
- **Intégration à faire à réception des sources** :
  - les composants des scènes vont dans `src/voyage/` et reprennent le thème unique (`theme.ts` : jetons `app.*`, `brand.*`, Catppuccin pour le code, clair et sombre), sans dépendance en double ;
  - exigences : mobile, clavier, `prefers-reduced-motion`, contraste AA ;
  - les constantes de `src/model.ts` deviennent `DEFAULT_VOYAGE` ; ses tests sont repris dans `src/voyage/` ;
  - `VOYAGE_READY` passe à `true`, ce qui ajoute l'entrée de menu (étudiant et enseignant) et le lien des leçons.

## Ce qu'il faut au propriétaire
1. L'archive `ShopFlow-voyage.zip` : `package.json`, `src/`, les tests, `src/model.ts` et les ressources (images, polices).
2. Le format des valeurs exactes, ou le fichier `experiences/voyage.json` du kit : lignes CSV, rejets et motifs, événements, empreintes.

## Conséquences
- Pas de migration.
- Tant que `VOYAGE_READY` est faux, aucune entrée de menu n'apparaît, et une leçon avec `experience` affiche « Bientôt disponible ».
