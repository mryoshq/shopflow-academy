# ADR-0036 — Préférences d'affichage et menu de compte

Date : 30 octobre 2026 · Statut : accepté (demande du propriétaire, PR #62)

## Contexte
Avec le style de l'ADR-0035, l'en-tête accumulait des boutons (thème, cloche, badge de rôle, déconnexion). Il manquait aussi deux réglages utiles en classe : agrandir le texte sur un écran projeté et couper les animations.

## Décision
- **Menu de compte** (`src/preferences/AccountMenu.tsx`). Il est en bas de la barre latérale enseignante et dans l'en-tête étudiant (pastille avec les initiales). Il contient :
  - le nom affiché, l'identifiant et le rôle ;
  - Paramètres (Ctrl ou ⌘ + virgule) ;
  - les sous-menus Thème (Système, Clair, Sombre), Taille du texte et Langue (français seul pour l'instant) ;
  - Raccourcis clavier ;
  - Se déconnecter.
- **Dialogue Paramètres** (`SettingsDialog.tsx`), en trois onglets :
  - Général ;
  - Apparence : cartes Clair, Sombre et Système, taille du texte, réduction des animations ;
  - Raccourcis.
- **Taille du texte** : 80, 90, 100, 110, 125, 140 et 150 %.
  - On l'applique sur la taille de police de `<html>` ; tout le thème est en rem, donc toute l'interface suit.
  - Raccourcis : Ctrl ou ⌘ avec +, − et 0. Une bulle discrète annonce la nouvelle taille.
- **Animations** : la case « Réduire les animations » pose la classe `reduce-motion` sur `<html>`. Elle s'ajoute à `prefers-reduced-motion`, qui reste respecté.
- **Mémorisation** dans ce navigateur, avec les clés `shopflow:theme`, `shopflow:zoom` et `shopflow:motion`. `public/theme-init.js` applique les réglages avant le premier rendu (aucun flash).
- **Favicon selon le thème choisi dans l'application**, et non selon celui du système :
  - `favicon-light.png` (logo vert complet) et `favicon-dark.png` (variante terre cuite), dérivés des logos du propriétaire par `scripts/make-icons.mjs` ;
  - `theme-init.js` puis `useColorMode` remplacent les icônes de la page par l'icône du thème choisi ;
  - `favicon.svg` reste dans le HTML comme repli quand JavaScript est désactivé.

## Conséquences
- Aucune donnée serveur ni migration : tout reste dans le navigateur.
- Les e2e cherchent l'icône `link#theme-icon` ; les captures de relecture couvrent les menus et le dialogue dans les deux thèmes.
