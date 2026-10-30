# ADR-0022 — Mise en page des leçons, description des médias, mise en forme légère

**Date :** 2026-10-28
**Statut :** accepté (demande du propriétaire, sprint 2, partie G)

## Contexte

Une leçon n'avait qu'un `body` libre : les auteurs produisaient des pavés de texte, sans repère pour l'étudiant (à quoi sert la leçon, quels mots retenir, que faire ensuite). Les médias codés (ADR-0018) n'avaient pas de description rédigée par l'auteur pour qui ne les voit pas. Les textes ne pouvaient porter ni gras, ni code en ligne, ni liste numérotée.

## Décision

- **Leçon structurée**, champs facultatifs réservés à `kind: lesson` :
  - `objective` : une phrase, une ligne, 200 caractères au plus ;
  - `hook` : accroche, 600 caractères au plus ;
  - `key_terms` : 1 à 8 `{term, definition}`, termes distincts ;
  - `example` : exemple résolu, 3000 caractères au plus ;
  - `practice` : « À vous », 1000 caractères au plus.

  Une leçon a au moins un `body` ou l'un de `hook`, `key_terms`, `example`, `practice`. **L'ancien format (`body` seul) reste valable** : pas de migration, versions publiées inchangées.
- **Ordre d'affichage fixe**, sans réglage par l'auteur :
  1. objectif, dans un bandeau discret ;
  2. accroche, en texte d'introduction un peu plus grand ;
  3. cartes de vocabulaire ;
  4. `body` ;
  5. encadré « Exemple résolu » ;
  6. média et exécutions ;
  7. encadré « À vous ».

  Texte limité à 72 caractères de large.
- **Description des médias** : `data.description` (tous les `data.kind`, 3000 caractères au plus, texte brut). Elle n'est jamais affichée dans le corps de la leçon :
  - le média est enveloppé dans un groupe « Média : <titre> » dont `aria-describedby` pointe vers la description (masquée par `hidden`, mais lue par les lecteurs d'écran) ;
  - un bouton repliable « Description du média » l'affiche à la demande.
- **Mise en forme légère** dans `body`, `scenario`, `instructions`, `explanation`, `hook`, `example`, `practice` et `description` :
  - `**gras**`, `` `code` `` ;
  - listes `- ` et `1. ` ;
  - `### ` (sous-titre) dans `body` seulement ;
  - tableaux Markdown simples (complément du 30/10/2026, prévus pour `body`) : en-tête, séparation `| --- |`, autant de cellules par ligne, alignement `:---` / `---:` / `:---:` facultatif, 12 colonnes et 100 lignes au plus (comme `data.kind: table`). Rendus en tableau accessible (en-têtes de colonne, cadre qui défile seul) ; un tableau mal formé reste du texte, sans erreur.

  Analyse dans le navigateur (`frontend/src/student/RichText.tsx`), rendu en nœuds React : **aucun HTML interprété, pas de `dangerouslySetInnerHTML`**. Le serveur continue de refuser tout texte contenant du HTML (`plain()`).
- **Lisibilité** : le compilateur avertit (sans bloquer) pour un paragraphe de plus de 80 mots, un `objective` de plus d'une phrase ou un tableau mal formé dans `body` (avec la ligne exacte du tableau).

## Conséquences

- Les nouveaux champs sont publics : ils sont dans la projection étudiante, aucun n'est un corrigé.
- Le studio sans code ne modifie pas les leçons (elles s'écrivent dans le cours Markdown) ; l'aperçu enseignant utilise le même rendu que l'étudiant.
- Une limite de largeur et des encadrés remplacent les pavés de texte ; les autres décisions de mise en page restent dans `docs/DESIGN.md`.
