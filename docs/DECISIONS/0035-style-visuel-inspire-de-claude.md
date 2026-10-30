# ADR-0035 — Style visuel inspiré de l'interface de Claude

Date : 29 octobre 2026 · Statut : accepté (demande du propriétaire)

## Contexte
Le propriétaire veut que l'application ressemble à l'interface de Claude : calme, éditoriale, chaleureuse.

## Décision
- Tout passe par le thème unique `frontend/src/theme.ts` : aucune couleur n'est codée dans les composants.
- Fond ivoire `#FAF9F5`, gris chauds (`gray.*` remplacé), surfaces blanches ; mode sombre anthracite chaud `#262624` / `#30302E`.
- Accent unique terre cuite (`brand.*`, `brand.solid` = `#B5532F`, texte blanc 4,95:1, AA) ; le safran reste l'accent secondaire, le vert reste le succès.
- Grands titres en serif avec les polices déjà installées (Iowan Old Style ou Charter sur Mac, Palatino Linotype ou Georgia sur Windows) ; petits titres et texte en sans-serif système. Pas de police web : la CSP n'autorise que `font-src 'self'`.
- Coins plus doux (`l1`/`l2`/`l3` = 6/8/12 px), ombres plus légères.
- Le logo du propriétaire est inchangé ; aucun logo, nom ou police propriétaire d'Anthropic n'est utilisé.

## Conséquences
- `brand.solid` passe de 7,02:1 (AAA) à 4,95:1 (AA) avec le texte blanc : la règle AA de `docs/DESIGN.md` reste respectée.
- `theme-color`, le manifeste et la page hors ligne suivent les nouvelles couleurs.
- Revenir à l'ancienne palette = annuler la PR de cet ADR (aucune donnée ni API touchée).
