# ADR-0022c — Logo du propriétaire et icônes dérivées

- Statut : accepté (28/10/2026), remplace la partie « Logo » de l'ADR-0022b
- Contexte : sprint 2, PR dédiée avant la partie L

## Contexte

L'ADR-0022b avait introduit un monogramme provisoire. Le propriétaire a fourni son logo (`docs/design/shopflow-logo-source.png`, renard géométrique vert et safran dans un double anneau) puis une variante verte (`docs/design/shopflow-logo-vert.png`, renard et anneaux sable sur vert plein), avec des règles d'usage dans `docs/design/README.md`.

## Décision

- Le dessin du renard n'est jamais modifié : seuls le recadrage, le redimensionnement, la transparence autour du logo et, pour 16/32 px, la tête seule aux traits épaissis sont permis.
- **Thème clair** : logo complet, fond sable rendu transparent (`logo-light.png`), en-tête 32 px et carte de connexion 56 px, toujours à côté du nom « ShopFlow Academy » écrit en texte (le logo est décoratif, `alt=""`).
- **Thème sombre** : variante verte en pastille ronde (`logo-dark.png`) aux mêmes endroits.
- **Favicon** : `favicon.svg` tracé d'après le logo (tête seule, sans anneaux ni points, traits de 84 unités) ; en sombre, couleurs de la variante verte (sable sur carreau vert). PNG 16 (traits de 98, trait intérieur de l'oreille retiré) et 32.
- **Icônes sur fond plein** : variante verte pour `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180) et `icon-maskable-512.png` (les anneaux et les points tiennent dans 75 % de la demi-largeur, donc dans le cercle sûr de 80 %, sans réduction).
- **Image de partage** `share-1200x630.png` : logo complet et nom en texte sur fond sable ; balises `og:*` et `twitter:card` dans `index.html`.
- `theme-color` inchangés : #F7F4EE (clair), #0D1513 (sombre).
- Génération : `frontend/scripts/make-icons.mjs` (Chromium de Playwright, aucune dépendance ajoutée) ; planche de contrôle 16/32 px et clair/sombre : `frontend/scripts/icon-sheet.mjs`. La texture de fond du PNG source (moins de 12 % de couverture) est traitée comme du fond.

## Conséquences

- Contrastes vérifiés : sable #F6F1EB sur vert #146457 6,25:1 ; vert #166359 sur blanc 7,09:1 et sur sable 6,46:1 ; safran #88541A sur sable 5,62:1. La pastille verte sur l'en-tête sombre (2,4:1) n'est qu'un fond : le renard et les anneaux sable restent à plus de 6:1.
- Aucune migration, aucun changement d'API. Le navigateur peut garder l'ancienne favicon en cache quelques heures.
- Toute nouvelle variante passe par `docs/design/` et ce script, jamais par un redessin.
