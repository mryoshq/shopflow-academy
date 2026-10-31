# ADR-0040 — Interface en anglais

Date : 31 octobre 2026 · Statut : accepté (demande du propriétaire)

## Décision
- **Bibliothèque** : `i18next` 26.4.6 (licence MIT, version publiée il y a plus de deux semaines), sans `react-i18next`. Un `t()` global suffit : un changement de langue rend toute l'application à nouveau (`main.tsx`, `key` sur `App`) ; l'adresse (hash) est conservée.
- **Le français est la langue de référence** : ses textes sont les clés (`t("Se connecter")`). Une clé sans entrée s'affiche telle qu'écrite.
  - `src/i18n/en.json` : le texte anglais de chaque clé (environ 1 250 entrées).
  - `src/i18n/fr.json` : seulement les formes plurielles françaises.
  - Pluriels : `tn("{{count}} mission réussie sur {{total}}", n)`, formes `_one` et `_other` dans les deux langues. La règle française « one » couvre 0 et 1, comme l'ancien `n > 1`.
  - Constantes de module (libellés de menus, de journal…) : `msg("…")` marque le texte, traduit avec `t()` là où il s'affiche.
- **Choix de la langue** : menu de compte (sous-menu Langue) et Paramètres > Général, « Français » et « English », chacune nommée dans sa propre langue. Le choix est mémorisé dans ce navigateur (`shopflow:lang`). Par défaut, l'anglais si le navigateur le demande, sinon le français. `public/theme-init.js` pose `<html lang>` et `dir` avant le premier rendu.
- **Ce qui reste dans sa langue d'origine** :
  - le contenu des cours (titres, situations, propositions, leçons, explications, données) et l'expérience « Le voyage d'une donnée », qui est du contenu de cours ;
  - les messages écrits par l'enseignant et le texte d'annonce des règles ;
  - les messages d'erreur du compilateur de cours (studio).
- **Notifications** : le serveur les écrit en français. En anglais, `src/i18n/server.ts` reconnaît les neuf modèles automatiques (bloc ouvert, aide, étudiant bloqué, ouverture automatique, bloc terminé, déconnexion) et les affiche en anglais ; tout autre texte reste tel quel.
- **Dates et nombres** : `Intl` dans la langue choisie (`fr-FR`, `en-GB`) : `formatNumber`, `formatDate`, `formatTime`, `formatDateTime`, `locale()`.
- **Page hors ligne** (`public/offline.html`, sans React) : `offline.js` remplace ses textes par l'anglais quand `theme-init.js` a choisi l'anglais.
- **Arabe plus tard (non livré)** : `LANGUAGES` porte la direction de chaque langue ; `applyLanguage` pose `dir` sur `<html>`. Pour l'ajouter : une entrée `{ code: "ar", dir: "rtl", locale: "ar-MA" }`, un `ar.json`, puis une relecture des marges et icônes directionnelles (flèches) en propriétés logiques.

## Contrôles
- `src/i18n/keys.test.ts` (CI) : toute clé utilisée dans le code (`t`, `tn`, `msg`) a son anglais, avec les mêmes `{{variables}}` ; chaque pluriel a ses deux formes dans les deux langues ; aucune entrée inutilisée.
- Les tests sont écrits en français : `test-setup.ts` remet le français avant chaque test Vitest ; `playwright.config.ts` fixe `locale: "fr-FR"`, et chaque contexte ouvert par un test aussi. `e2e/english.spec.ts` demande l'anglais (`locale: "en-GB"`).

## Conséquences
- Toute nouvelle phrase de l'interface s'écrit `t("…")` en français, avec son anglais dans `en.json` ; la CI refuse sinon.
- Aucune donnée serveur ni migration.
