# ADR-0048 — Style de la plateforme : grotesque géométrique, grands panneaux, en-tête sombre

Date : 1er novembre 2026 · Statut : accepté (demande du propriétaire)

## Contexte
Le propriétaire veut un style plus affirmé, inspiré de filatov.design (sans le copier) :
- grands panneaux arrondis avec de l'espace autour ;
- un en-tête sombre à trame de points ;
- de grands titres dans une grotesque géométrique ;
- des surtitres en capitales dans l'accent ;
- un mot en accent écrit en machine à écrire sur la page de connexion ;
- un indicateur vert « mis à jour à … ».

Le thème unique reste : accent vert en clair, terre cuite en sombre, contrastes AA (ADR-0035, ADR-0036).

## Décision
- **Police des titres : Space Grotesk** (SIL Open Font License 1.1, vérifiée dans le paquet, fichier `LICENSE`).
  - Variante variable, paquet `@fontsource-variable/space-grotesk` 5.3.0, version figée.
  - Les fichiers WOFF2 (latin, latin étendu) sont intégrés au build et servis par l'Academy : la CSP `font-src 'self'` suffit, aucun CDN ni service tiers.
  - Bricolage Grotesque, aussi sous OFL, a été écartée : son caractère est plus marqué, elle se lit moins bien en titres longs.
  - Le texte courant garde la police du système, sans téléchargement.
- **Système typographique**, documenté dans `docs/DESIGN.md` (« Typographie ») :
  - titres en grotesque à partir de la taille `md` ;
  - styles nommés `display` et `overline` ;
  - petits titres et texte dans la police du système.
- **Panneaux** : rayon `card` porté de 12 à 24 px pour tous les panneaux et cartes ; marges intérieures et espacements plus généreux.
- **En-tête du tableau de bord** : panneau sombre (`hero.*`) avec une trame de points en CSS (`radial-gradient`, aucune image), surtitre en accent, grand titre, indicateur vert « Mis à jour à HH:MM ».
  - Contrastes : texte 15,8:1 en clair et 16,8:1 en sombre ; texte secondaire 9,8:1 et 10,4:1 ; accent 7,1:1 (vert) et 7,4:1 (terre cuite).
- **Machine à écrire** (page de connexion) :
  - le mot en accent du titre s'écrit puis s'efface (la data, SQL, Python, Airflow, la qualité) ;
  - les lecteurs d'écran lisent toujours la même phrase : le mot qui change est masqué pour eux, « la data » est donné en texte réservé aux lecteurs d'écran ;
  - « Réduire les animations », de l'Academy ou du système, fige le mot ;
  - aucune animation CSS sans fin : le curseur est fixe et la pastille verte pulse deux fois après chaque actualisation, pour ne pas gêner les outils qui attendent la fin des animations.

## Conséquences
- Environ 41 Ko de polices (WOFF2), chargées seulement quand des caractères des titres en ont besoin (`unicode-range`).
- Composants `src/brand/Hero.tsx` : `Overline`, `HeroPanel`, `UpdatedAt`, `Typewriter`.
- Tests :
  - Vitest : `src/brand/hero.test.tsx` ;
  - e2e : `e2e/style.spec.ts` (police servie par l'Academy, nom accessible stable, mot figé, axe en clair et en sombre, à 1366 et 390 px, rayon de 24 px) ;
  - les specs existantes passent sans changement.
- Captures : `docs/captures/style/`.
