# ADR-0037 — Nom affiché : Rapidfox Academy

Date : 30 octobre 2026 · Statut : accepté (demande du propriétaire)

## Décision
- **Rapidfox Academy** est l'école : c'est le nom affiché partout (en-têtes, barre latérale, carte de connexion, `<title>`, manifeste, page hors ligne, image de partage, métadonnées og et twitter, notifications, titre de l'API).
- **Python Data Engineering & SQL Avancé** est le module : il apparaît sous le nom de l'école (`src/BrandName.tsx`).
- **ShopFlow** et **CampusEquip** sont les cas d'étude du module. Ils apparaissent en texte secondaire à côté du module ; sur téléphone, on les omet pour garder l'en-tête lisible.
- Le sous-domaine **shopflow.rapidfox.io** ne change pas. Les clés de stockage du navigateur (`shopflow:*`), les noms de cookies et de dépôts ne changent pas non plus.
- Le logo du renard, le contenu des cours, les données ShopFlow et le projet CampusEquip restent tels quels.

## Conséquences
- Aucune migration ni changement d'API, en dehors du titre de la documentation OpenAPI.
- Revenir en arrière : remettre le texte de `BrandName.tsx`, du manifeste, de `index.html`, de `offline.html` et de l'image de partage.
