# Direction visuelle — ShopFlow Academy

Thème unique Chakra UI v3 : `frontend/src/theme.ts` (`createSystem(defaultConfig, defineConfig(...))`). Toute nouvelle interface (studio compris) utilise ces jetons plutôt que des couleurs codées en dur.

## Intention
Professionnelle, chaleureuse, légèrement ludique, jamais enfantine. Français clair et **vouvoiement**. Contexte marocain fictif (DH, villes fictives : Tanzar, Oued Lmal), sans caricature. Aucun emoji ; icônes SVG en ligne toujours accompagnées de texte.

## Jetons
| Rôle | Jeton | Valeur | Usage |
|---|---|---|---|
| Marque | `brand.solid` | `#146457` (texte blanc 6,9:1) | actions principales, progression |
| Marque texte | `brand.fg` | `#0F5047` | liens, intitulés de section |
| Accent | `saffron.*` | `#A86A1F` / fond `#FDF6EA` | badge « Démonstration », état « En cours », indices |
| Succès | `green.solid` | redéfini sur `green.700` (blanc ≥ 4,5:1) | « Réussie », « Bonne décision » |
| Fond | `app.canvas` | `#F7F4EE` (sable) | page |
| Surface | `app.surface` / `app.sunken` | blanc / `#F1EDE4` | cartes / zones secondaires |
| Bordure | `app.border` | `#E2DDD3` | cartes, options |
| Texte | `app.ink` / `app.muted` | `#14211F` / `#4A5A56` (7,6:1) | texte courant / secondaire |
| Rayon | `card` | 14px | cartes |
| Ombre | `card` | double ombre douce | cartes |

Typographie : pile système (`Segoe UI Variable` sous Windows, `-apple-system` sur Mac), aucun chargement externe (CSP `font-src 'self'`). Interlignage 1,6 ; titres resserrés (-0,01 à -0,02em) ; chiffres tabulaires dans les tableaux.

## Composants
- **Carte de mission (tableau de bord)** : liseré gauche selon l'état (vert réussi, safran en cours, neutre), pastille numérotée ou cadenas, badge d'état texte + icône, bouton explicite (Commencer / Reprendre / Revoir / Verrouillée).
- **Lecteur** : « Situation » → données (tableau, ou graphique avec bascule « Afficher les données en tableau ») → « Votre décision » → bouton « Tester ma décision » → panneau de feedback (liseré vert « Bonne décision » ou safran « À revoir », icône + texte, explication sur fond `brand.subtle`). Colonne d'aide : indices numérotés, ressources, mention « IA désactivée », durée sans chronomètre.
- **Focus** : anneau 3px `brand.focusRing` sur tout élément focusable ; le focus suit l'étape déplacée (ordre) et se pose sur le feedback après soumission.
- **Mouvement** : apparition du feedback en 180 ms, annulée par `prefers-reduced-motion`.

## Accessibilité vérifiée
`@axe-core/playwright` (WCAG 2 A/AA, violations « serious »/« critical ») sur connexion, tableau de bord, mission, activité d'ordre et état vide : 0 violation (`frontend/e2e/player.spec.ts`). Parcours complet au clavier seul à 1366×768.
