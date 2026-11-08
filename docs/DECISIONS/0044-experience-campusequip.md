# ADR-0044 — Expérience CampusEquip (« Le voyage d'une location »)

Date : 31 octobre 2026 · Statut : accepté (demande du propriétaire) ; animation améliorée et accent vert proposés le 08/11/2026 (branche `feat/campusequip-motion`, en attente de revue) · Suit le cadre de l'ADR-0033

## Contexte
Le propriétaire a livré une seconde application interactive, `assets/CampusEquip-experience.zip` du dépôt privé `mryoshq/shopflow-courses` (commit `0fb639e`). Elle suit le sujet CampusEquip axes 1 et 2 en sept étapes : campus, sources, qualité, chargement, indicateurs, flux continu, suite du projet.

## Décision
- **Intégration** dans `frontend/src/campusequip/`, comme « Le voyage d'une donnée » :
  - application du propriétaire (`CampusEquipApp.tsx`), modèle (`model.ts`), jeu de données (`dataset.json`) et icônes, gardés tels quels ;
  - retouches marquées « Academy: » dans le code : étape de départ et adresse, préférence « Réduire les animations », lien d'évitement, dialogues et plein écran dans l'expérience, adresses des fichiers, deux tableaux défilables au clavier, nom accessible du bouton « Présentation » sur téléphone, grand numéro d'étape décoratif (`aria-hidden`, contenu généré par CSS) ;
  - chargement différé (`lazy`), donc aucun poids pour le reste de l'application.
- **Un seul thème avec l'Academy** : `scripts/campusequip-css.mjs` transforme la feuille du propriétaire (`source/style.css`, gardée telle quelle) en `campusequip.css` :
  - portée sous `.campusequip-root` ;
  - l'accent de l'expérience (teal, deep, mint) devient l'accent de l'Academy par les jetons `brand` : vert en clair, terre cuite en sombre ; le texte blanc sur l'accent reste blanc (`brand.contrast`) ;
  - chaque autre couleur a une valeur claire et une valeur sombre ; les couleurs de texte sont ajustées pour atteindre le contraste AA ;
  - polices de l'Academy, aucune police distante ; la barre de lecture suit la page.
- **Adresses** : `#/campusequip[/<étape 1-7>]`, côté étudiant et côté enseignant ; l'étape suit l'adresse dans les deux sens (bouton Retour).
- **Entrées** : une carte « Le voyage d'une location » sur le tableau de bord étudiant, à côté du voyage, et « Expérience CampusEquip » dans la barre latérale de l'enseignant et dans Ctrl+K.
- **Pleine largeur** : les deux expériences (voyage et CampusEquip) prennent toute la largeur de la page, côté étudiant et côté enseignant (barre latérale exceptée).
- **Leçons** : `data.kind: experience` accepte `experience: campusequip`, avec `scene` 1 à 7 comme étape de départ. `data_file` reste réservé au voyage : le compilateur le refuse en français pour CampusEquip.
- **Fichiers inclus** (CSV des lots, référentiels, provenance, PDF du sujet) : ressources statiques de l'expérience, dans `frontend/public/experiences/campusequip/`. Leurs empreintes sont vérifiées par `backend/tests/test_campusequip_files.py` :
  - celles de l'archive (`src/campusequip/empreintes.json`, issu de `EMPREINTES.json`) ;
  - celles de `provenance.json` (PDF du sujet, référentiels) ;
  - aucun autre fichier n'est servi : aucun corrigé, aucun fichier enseignant.
- **Tests du modèle livrés** : `model.test.ts` est gardé, seul le chemin de `expected.json` change. Il tourne avec Vitest. L'empreinte d'origine est vérifiée par pytest.
- **Langue** : les textes de l'Academy autour de l'expérience (entrées, carte, chargement) sont traduits en anglais ; l'expérience elle-même est du contenu de cours et reste en français, comme le voyage (ADR-0040).

## Animation améliorée et accent vert (08/11/2026)
Même traitement que le voyage (ADR-0033, 07/11/2026). Remplace les points « application du propriétaire […] gardés tels quels » (pour `CampusEquipApp.tsx` et les icônes), « retouches marquées Academy: » et « Un seul thème avec l'Academy » ci-dessus.
- **Composants** : `CampusEquipApp.tsx` réécrit (mêmes props `initialStep` et `onStep`), une étape par fichier (`Territory.tsx`, `Sources.tsx`, `Quality.tsx`, `Transaction.tsx`, `Indicators.tsx`, `Flow.tsx`, `Future.tsx`), plus `Inspector.tsx`, `Player.tsx`, `Dialogs.tsx`, `content.ts` (textes du propriétaire et chronologie), `hooks.ts`, `ui.tsx` ; `icons.tsx` complété. `model.ts`, `dataset.json`, `expected.json`, `model.test.ts`, `empreintes.json`, `source/`, `CampusEquipPage.tsx`, `index.ts` et `public/experiences/campusequip/` inchangés (empreintes vérifiées par pytest).
- **Animations** : `motion` (déjà ajouté pour le voyage) ; une seule barre de lecture pour toutes les séquences (vitesse, « Réduire les animations », présentation, flèches et Espace).
- **Accent vert propre à l'expérience** (projet final) : `campusequip.css` redéfinit les jetons `brand` sous `.campusequip-root` ; l'en-tête de l'Academy, la barre latérale et Rafi gardent leur accent. Valeurs (toutes AA) : clair `#1E7B43` (texte blanc, 5,3:1), sombre `#5CC98A` (texte `#0F2418`, 7,9:1), Catppuccin clair `#2F7A22`, Catppuccin sombre `#A6E3A1` (vert Catppuccin). Les autres couleurs lisent `theme.ts` (`app.*`, `green/red/saffron.*`, polices). **À valider par le propriétaire.**
- **Feuille de style** : `campusequip.css` est écrite à la main ; `scripts/campusequip-css.mjs` est retiré (il écraserait cette feuille). `source/style.css` reste comme trace de la livraison, il n'est plus importé. Règles sous `.campusequip-root`, animations préfixées `ce-`, aucune police web ni `@import`.
- **Place dans la page** : l'expérience mesure l'espace laissé par la page (en-tête étudiant, barre latérale et barre du haut enseignant) ; plan du campus sur une, deux ou trois rangées ; à l'étape 7, quatre onglets quand la place manque. Mode compact sur téléphone (scénario, panneau et fenêtres de référence dans le menu du lecteur). Cibles de 44 px au tactile (ADR-0029).
- **Rafi** : la barre de lecture lui laisse sa place sur les pages étudiant, comme le voyage.
- **Textes** : ceux du propriétaire, sauf trois choix à valider : la ligne « Bonus facultatifs : jusqu'à 5 points au total, signal IoT compris. » dans l'onglet Bonus de l'étape 7 ; les indicateurs s'ouvrent sur le jour le plus chargé du campus (le 1er novembre auparavant) ; « Les règles » des étapes 6 et 7 reprennent les textes de ces étapes.
- **Chargement différé** : `CampusEquipPage` passe à 260,4 Ko de JS (48,6 Ko gzip) et 33,4 Ko de CSS (6,2 Ko gzip), contre 226,9 Ko (38,7) et 74,7 Ko (14,8) ; le reste de l'application est inchangé.

## Conséquences
- Pas de migration. Le PDF (410 Ko) et les données (environ 175 Ko) sont servis par le conteneur frontend comme les autres fichiers statiques.
- Pour une nouvelle version de l'archive : copier `model.ts`, `dataset.json`, `source/style.css` et `public/`, mettre à jour `empreintes.json`, puis reporter à la main dans `campusequip.css` et les composants ce qui a changé (le générateur de feuille est retiré).
