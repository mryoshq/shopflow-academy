# ADR-0044 — Expérience CampusEquip (« Le voyage d'une location »)

Date : 31 octobre 2026 · Statut : accepté (demande du propriétaire) · Suit le cadre de l'ADR-0033

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

## Conséquences
- Pas de migration. Le PDF (410 Ko) et les données (environ 175 Ko) sont servis par le conteneur frontend comme les autres fichiers statiques.
- Pour une nouvelle version de l'archive : copier les sources et `public/`, mettre à jour `empreintes.json`, puis lancer `node scripts/campusequip-css.mjs`.
