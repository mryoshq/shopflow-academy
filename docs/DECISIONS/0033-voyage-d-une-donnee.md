# ADR-0033 — « Le voyage d'une donnée » dans l'Academy

- Statut : accepté ; application du propriétaire intégrée le 29/10/2026 (partie Q2, archive `ShopFlow-voyage.zip` du dépôt privé `shopflow-courses`, commit `62cd2d8`) ; animation améliorée intégrée le 07/11/2026, avec la dépendance `motion` (accord du propriétaire)
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

## Intégration (Q2)
- **Sources reprises telles quelles** dans `frontend/src/voyage/` : `model.ts` (modèle et valeurs), `model.test.ts` (ses tests), `icons.tsx`, `VoyageApp.tsx` (l'`App.tsx` du propriétaire) ; feuille d'origine conservée dans `source/style.css`. Aucune dépendance ajoutée (React 19 et Chakra v3 de l'Academy).
- **Changements apportés au composant** : racine `.voyage-root` ; fenêtres (glossaire, architecture, fichiers, questions) rendues dans l'expérience ; mode présentation sur l'expérience seule ; libellés des trois boutons qui n'ont qu'une icône sur téléphone ; la scène suit l'adresse `#/voyage/<1-7>` dans les deux sens (bouton retour compris).
- **Thème** : `scripts/voyage-css.mjs` produit `voyage.css` depuis la feuille du propriétaire :
  - toutes les règles sous `.voyage-root` (aucune fuite vers le reste du site) ;
  - chaque couleur devient une variable claire (valeur du propriétaire) et sombre (`html.dark`, luminosité inversée) ;
  - les couleurs de texte ont leurs propres variables, ajustées jusqu'à 4,6:1 sur les fonds de l'expérience dans les deux thèmes (la palette livrée était sous AA pour 82 petits libellés) ;
  - polices web supprimées (aucun appel réseau) au profit de celles de l'Academy ; animations préfixées ; barre de lecture collée en bas de la page au lieu de la fenêtre ;
  - à 420 px et moins, « Recommencer » quitte la barre de lecture (toujours accessible par la marque ShopFlow).
- **Chargement différé** : `VoyagePage` (57,9 Ko de JS, 71,8 Ko de CSS) dans des fichiers séparés ; le reste de l'application est inchangé.
- **Valeurs du cours** (`experiences/voyage.json`), fusionnées sur `DEFAULT_VOYAGE` (copie du modèle) puis appliquées au modèle, clé par clé et seulement avec le même type :
  - `base` : `orders`, `lines`, `revenue`, `customers`, `categories`, `products` (état avant le lot) ;
  - `batch` : `source`, `accepted`, `rejected`, `duplicates`, `orderIds`, `revenue`, `events`, `queue`, `cache`, `ttl` ;
  - `files` : par nom de fichier (`lot_octobre.csv`…), `count`, `description`, `content` (contenu exact des cartes sources).
  - Limite : les phrases du récit (`makeFrames`, `contexts`, questions) contiennent les valeurs du cahier des charges en toutes lettres ; elles ne suivent pas le JSON. Un cours qui change les chiffres doit aussi demander la mise à jour de ces textes.
- `VOYAGE_READY = true` : entrée « Le voyage d'une donnée » dans la navigation enseignant et sur le tableau de bord étudiant ; lien « Ouvrir l'expérience » dans les leçons `data.kind: experience`.
- Point ouvert : l'application affiche les montants en **MAD** (texte du propriétaire) ; le reste de l'Academy écrit **DH**. Non modifié sans accord.

## Animation améliorée (07/11/2026)
Remplace les points « Sources reprises telles quelles », « Thème » et « Chargement différé » de la partie Q2.
- **Composants** : `VoyageApp.tsx` réécrit (mêmes props `initialScene` et `onScene`), plus `PipelineCanvas.tsx` (le DAG animé, les trois stockages, le « laboratoire » de l'étape), `Lab.tsx`, `Inspector.tsx`, `Player.tsx`, `Dialogs.tsx`, `scene.ts` (géométrie), `content.ts` (textes) ; `icons.tsx` complété. `model.ts`, `data.ts`, `VoyagePage.tsx` et `index.ts` inchangés.
- **Dépendance ajoutée : `motion` 14.10.1** (accord du propriétaire, 07/11/2026). Elle n'est chargée qu'avec l'expérience.
- **Thème** : `voyage.css` lit directement les jetons de `theme.ts` (`app.*`, `brand.*`, `green/red/saffron.*`, polices `heading` et `mono`) : clair, sombre et Catppuccin suivent sans règle supplémentaire. `scripts/voyage-css.mjs` est retiré (il écraserait cette feuille) ; `source/style.css` reste comme trace de la livraison d'origine, il n'est plus importé. Toutes les règles restent sous `.voyage-root`, animations préfixées `vy-`, aucune police web ni `@import`.
- **Place dans la page** : l'expérience mesure l'espace laissé par la page qui l'accueille (en-tête étudiant, barre latérale et barre du haut enseignant) et n'agit plus sur `html` ni `body` ; ses paliers de largeur suivent cette largeur, pas celle de la fenêtre. Pas de défilement de la page aux tailles vérifiées.
- **Tactile (ADR-0029)** : boutons des scènes et cartes du DAG à 44 px. Sur un téléphone à faible hauteur, un mode compact garde les scènes dans l'en-tête et range le scénario, « À la loupe », la question et les fenêtres de référence dans le menu du lecteur ; si sept boutons de 44 px ne tiennent pas (page enseignant sur petit téléphone), les scènes deviennent une liste déroulante.
- **Rafi** : la barre de lecture lui laisse sa place sur les pages étudiant. Fenêtres, menus, tiroir et infobulles restent dans l'expérience (mode présentation).
- **Animations réduites** : réglage du système et « Réduire les animations » de l'Academy (`html.reduce-motion`) ; toutes les animations s'arrêtent d'elles-mêmes.
- **Valeurs du cours** : étiquettes des flux, comptes du laboratoire, valeurs attendues de « Vérifier », TTL et file lisent `BASE` et `BATCH`. Les phrases du récit gardent leurs chiffres (limite inchangée). `snapshot()` du modèle ajoute toujours 6 commandes : un cours qui change `orderIds` ferait apparaître un écart dans « Vérifier » (fichier du propriétaire, non modifié).
- **Corrections** : la scène et l'adresse ne se décalent plus quand la page passe `onScene` en fonction fléchée ; le bouton du panneau latéral s'appelle « Voir dans le glossaire » (un seul bouton « Glossaire », comme l'attend l'e2e) ; contraste du segment de scénario sélectionné.
- **Chargement différé** : `VoyagePage` passe à 266,2 Ko de JS (88,5 Ko gzip) et 27,2 Ko de CSS (5,3 Ko gzip), contre 57,9 Ko et 71,8 Ko ; le reste de l'application est inchangé.

## Ce qu'il fallait au propriétaire (reçu)
1. L'archive `ShopFlow-voyage.zip` : `package.json`, `src/`, les tests, `src/model.ts` et les ressources (images, polices).
2. Le format des valeurs exactes, ou le fichier `experiences/voyage.json` du kit : lignes CSV, rejets et motifs, événements, empreintes.

## Conséquences
- Pas de migration.
- Tant que `VOYAGE_READY` est faux, aucune entrée de menu n'apparaît, et une leçon avec `experience` affiche « Bientôt disponible ».
