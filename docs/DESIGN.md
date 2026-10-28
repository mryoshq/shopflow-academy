# Direction visuelle — ShopFlow Academy

Thème unique Chakra UI v3 : `frontend/src/theme.ts` (`createSystem(defaultConfig, defineConfig(...))`). Toute nouvelle interface (studio compris) utilise ces jetons plutôt que des couleurs codées en dur.

## Intention
Professionnelle, chaleureuse, légèrement ludique, jamais enfantine. Français clair et **vouvoiement**. Contexte marocain fictif (DH, villes fictives : Tanzar, Oued Lmal), sans caricature. Aucun emoji ; icônes SVG en ligne toujours accompagnées de texte.

## Jetons
Chaque jeton sémantique a une valeur claire et une valeur `_dark` ; les paires texte/fond respectent WCAG AA dans les deux thèmes (axe en CI).

| Rôle | Jeton | Clair | Sombre | Usage |
|---|---|---|---|---|
| Marque | `brand.solid` | `#146457` (texte blanc 6,9:1) | `#1F7A6B` (texte blanc) | actions principales, progression |
| Marque texte | `brand.fg` | `#0F5047` | `#6FB6A6` | liens, intitulés de section |
| Accent | `saffron.solid` / `saffron.fg` / `saffron.subtle` | `#84521A` / `#643E16` / `#FDF6EA` | `#EDB458` (texte `#1B1206`) / `#EDB458` / `#2A1F10` | « Démonstration », « En cours », indices, demandes d'aide |
| Succès | `green.solid` | `green.700` (blanc ≥ 4,5:1) | `green.700` | « Réussie », « Bonne décision » |
| Fond | `app.canvas` | `#F7F4EE` (sable) | `#0D1513` | page |
| Surface | `app.surface` / `app.sunken` | blanc / `#F1EDE4` | `#151F1D` / `#1B2724` | cartes / zones secondaires |
| Surfaces Chakra | `bg` / `bg.panel` | blanc | `#151F1D` | tableaux, champs, menus (alignés sur `app.surface`) |
| Bordure | `app.border` | `#E2DDD3` | `#2E3D3A` | cartes, options |
| Texte | `app.ink` / `app.muted` | `#14211F` / `#4A5A56` (7,6:1) | `#E6EEEB` / `#A9B8B4` | texte courant / secondaire |
| Code | `code.*` | fond `#F4F1EA`, mots-clés `#0F5047` | fond `#101917`, mots-clés `#7FD1BE` | blocs de code, coloration ≥ 4,5:1 |
| Graphiques | `chart.*` | séries `brand.600` / `saffron.700` | `brand.300` / `saffron.300` | courbes, axes, grille |
| Rayon | `card` | 14px | 14px | cartes |
| Ombre | `card` | double ombre douce | ombre plus dense | cartes |

Règle Chakra : pour redéfinir un jeton qui existe déjà dans Chakra (`green.solid`, `bg`), utiliser les clés `_light` et `_dark`, pas `base` (la valeur `_light` de Chakra l'emporterait sur `base`).

### Mode sombre
- Sélecteur « Système / Clair / Sombre » dans l'en-tête (groupe de boutons radio, flèches du clavier), mémorisé dans ce navigateur (`localStorage` `shopflow:theme`). « Système » suit `prefers-color-scheme`, y compris en direct.
- Pas de flash : `frontend/public/theme-init.js` pose la classe `dark` ou `light` et `color-scheme` sur `<html>` avant le premier rendu. Fichier externe, car la CSP interdit les scripts en ligne.
- Interdit : couleur de texte ou de fond codée en dur dans un composant (`red.700`, `#fff`…) ; utiliser `*.fg`, `*.solid`, `*.subtle`, `app.*`. Seuls les liserés décoratifs gardent une teinte fixe (`saffron.400`, `green.600`), lisible dans les deux thèmes.

Typographie : pile système (`Segoe UI Variable` sous Windows, `-apple-system` sur Mac), aucun chargement externe (CSP `font-src 'self'`). Interlignage 1,6 ; titres resserrés (-0,01 à -0,02em) ; chiffres tabulaires dans les tableaux.

## Composants
- **Carte de mission (tableau de bord)** : liseré gauche selon l'état (vert réussi, safran en cours, neutre), pastille numérotée ou cadenas, badge d'état texte + icône, bouton explicite (Commencer / Reprendre / Revoir / Verrouillée).
- **Lecteur (une colonne)** : « Situation » → données (tableau, graphique avec bascule « Afficher les données en tableau », code, animation…) → « Votre décision » (propositions numérotées 1 à 9) → « Tester ma décision » → retour encourageant (liseré vert « Bonne décision » avec « Mission suivante » en bouton principal, ou safran « Presque ! Réessayez », explication sur fond `brand.subtle`). Aide repliable sous la décision (« Aide : indices, question à l'enseignant, historique »), état mémorisé dans le navigateur ; durée sans chronomètre.
- **Leçon structurée** (ADR-0022) : bandeau « Objectif » discret (`brand.subtle`, petit texte), accroche en `lg`/`xl`, cartes « Vocabulaire » (`app.sunken`, liste de définitions `dl`), encadré « Exemple résolu » (liseré `brand.solid`), média, puis encadré « À vous » (`saffron.subtle`, bordure `saffron.solid`). Texte limité à 72 caractères de large ; jamais de pavé (le compilateur avertit au-delà de 80 mots par paragraphe).
- **Description du média** : jamais dans le corps ; groupe « Média : <titre> » avec `aria-describedby`, bouton repliable « Description du média ».
- **Mise en forme légère** : gras (`strong`, semi-gras), code en ligne (`code.*`), listes à puces et numérotées, sous-titres `###` dans le texte libre d'une leçon. Rendu React uniquement, aucun HTML.
- **Raccourcis clavier** : touches 1 à 9 pour choisir une proposition, Entrée pour tester, puis pour passer à la mission suivante ou réessayer. Inactifs dans les champs de saisie ; mention masquée sur téléphone.
- **Tableaux larges** : la zone de défilement horizontal est une région nommée et focusable (`tabIndex=0`), donc défilable au clavier.
- **Libellés longs** : les boutons à libellé variable (« Continuer : … », « Ouvrir le bloc suivant : … ») passent à la ligne (`whiteSpace="normal"`) ; aucun défilement horizontal à 390 px.
- **Focus** : anneau 3px `brand.focusRing` sur tout élément focusable ; le focus suit l'étape déplacée (ordre) et se pose sur le feedback après soumission.
- **Mouvement** : apparition du feedback en 180 ms, annulée par `prefers-reduced-motion`.

- **Plan du cours (studio et aperçu, ADR-0022b)** : compteurs en tête (blocs, missions, leçons, bonus, points), recherche (accents ignorés) et filtre par type ; module (icône calques, petites capitales `brand.fg`) → blocs repliables (en-tête `app.sunken` : numéro, titre, nombre d'éléments, durée, points ; le bloc courant ouvert) → une ligne par élément : titre, type (icône + texte), badges « Leçon » / « Bonus » / « Exécution », points et durée, état (« Valide » `green.fg`, « À compléter » `saffron.fg`, « Erreur » `red.fg`, toujours avec icône et texte). L'aperçu ajoute « Bloc précédent / suivant ». À 390 px, le détail du bloc et les boutons passent sous le titre.
- **Objectifs** : groupes repliables par catégorie (SQL, Python, autres, « Objectifs de bloc » replié en dernier) ; code en badge à police fixe, énoncé, nombre d'éléments qui le couvrent (bouton → filtre du plan), alerte safran « Aucune mission ne le couvre ». L'étudiant ne voit jamais de code : « Objectif : … » en une phrase sous le titre du bloc.
- **Suivi en direct (ADR-0023)** : grille étudiants × blocs, état toujours en texte (« fait » vert, « x/y » safran, « — », cadenas « fermé », icône personne « ouvert pour lui »), pastille de présence doublée du texte « en ligne / vu à HH:MM » ; message à droite (compteur 280) avec accusés de lecture ; cloche dans l'en-tête (pastille safran du nombre non lu) et historique groupé ; toasts en bas à droite (pleine largeur à 390 px), 10 s, bouton « J'ai lu » ; « Ouvert pour vous » en badge plein `brand` côté étudiant ; aucune couleur seule ne porte une information.
- **Règles contre le clic au hasard (ADR-0027)** : onglet « Règles » du studio, une carte par mesure (case, explication, champs, « Active depuis le … » en `brand.fg`). Étudiant : « Essai N : jusqu'à P % des points » au-dessus de « Tester ma décision » ; pause en encadré `saffron.subtle` avec icône horloge, « Pause de N s : relisez la situation. » et le bouton « Voir un indice » mis en avant, bouton « Réessayer dans N s » désactivé ; barre « Temps de lecture » sous une leçon ; bandeau d'annonce en tête du tableau de bord. Enseignant : badge contour safran « Clics rapides : N » (jamais rouge, aucune sanction).
- **Logo et icônes (ADR-0022c)** : logo du propriétaire (`docs/design/`, règles dans son README), jamais redessiné. Clair : logo complet (renard + anneaux), fond rendu transparent, `logo-light.png`. Sombre : variante verte du propriétaire (renard sable sur vert #146457) en pastille ronde, `logo-dark.png`. En-tête (32 px) et carte de connexion (56 px) : logo à côté du nom « ShopFlow Academy » écrit en texte (`src/Logo.tsx`, image décorative `alt=""`). Favicon `favicon.svg` et PNG 16/32 : tête du renard seule, sans anneaux ni points, traits épaissis (84, 98 en 16 px sans le trait intérieur de l'oreille) ; en sombre, le SVG prend les couleurs de la variante verte (sable sur carreau vert). Icônes sur fond plein (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png` 180, `icon-maskable-512.png`) : variante verte, dont les anneaux tiennent dans le cercle sûr de 80 %. Image de partage `share-1200x630.png` (logo complet + nom en texte, fond sable). Contrastes : sable sur vert 6,25:1, vert #166359 sur blanc 7,09:1, safran sur sable 5,62:1. `theme-color` : #F7F4EE en clair, #0D1513 en sombre. Tout est régénéré par `frontend/scripts/make-icons.mjs` ; planche de contrôle : `frontend/scripts/icon-sheet.mjs`.

## Accessibilité vérifiée
`@axe-core/playwright` (WCAG 2 A/AA, violations « serious »/« critical ») sur connexion, tableau de bord, mission, activité d'ordre et état vide (`frontend/e2e/player.spec.ts`) ; connexion, tableau de bord, mission, « Ma classe » et « Mon cours » **en clair et en sombre** (`experience.spec.ts`) ; chaque mission du cours Markdown en sombre (`markdown-course.spec.ts`) : 0 violation. Parcours complet au clavier seul à 1366×768 ; 390×844 sans défilement horizontal. Captures : `docs/captures/sprint2-b/`.
