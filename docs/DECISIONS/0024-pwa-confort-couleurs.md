# ADR-0024 — PWA, confort (pomodoro, radio) et révision des couleurs

- Statut : accepté (28/10/2026)
- Contexte : sprint 2, partie I

## Décision

### PWA
- `public/manifest.webmanifest` (`standalone`, `fr`, icônes 192/512 et masquable), lien dans `index.html`.
- `public/sw.js` : fichiers statiques seulement. **Jamais** `/api/` (réponses, scores, notifications, corrigés), `/media/`, `/health/`, ni une autre origine, ni une requête autre que GET. Pages : réseau d'abord, `offline.html` si le réseau est coupé. Fichiers de build hachés (`/assets/`) et icônes : cache d'abord. Le Web Push de l'ADR-0023 reste inchangé (sans contenu).
- Enregistrement seulement dans la version de production. Nouvelle version : bandeau « Nouvelle version disponible » → « Recharger » (le nouveau service worker attend qu'on le lui demande). Invite d'installation (« Installer l'application ») refusable définitivement.
- CSP minimale : ajout de `worker-src 'self'` et `manifest-src 'self'` ; aucun autre hôte.

### Confort (étudiants, bouton « Confort » de l'en-tête)
- **Pomodoro** facultatif : 25/5 min par défaut (travail 15 à 50, pause 3 à 15), démarrer, pause, réinitialiser ; temps restant affiché sur le bouton ; changement de phase annoncé aux lecteurs d'écran ; conservé dans le navigateur seulement (l'enseignant ne le voit pas, rien n'est bloqué).
- **Radio** facultative : flux définis sur le serveur (`RADIO_STREAMS`), **vide par défaut**. Seuls les embeds `https://www.youtube-nocookie.com/embed/<id>` sont acceptés (le seul hôte tiers déjà autorisé en `frame-src`) ; toute autre entrée est ignorée. Rien n'est chargé avant « Écouter », le lecteur démarre **sans le son** (`mute=1`).
- Flux audio HTTPS directs : non retenus pour l'instant, car chaque hôte devrait être ajouté à la CSP (`media-src`) ; à décider plus tard au cas par cas.

### Trois flux proposés, **non activés**
À vérifier avant activation (les directs YouTube changent parfois d'identifiant) :
1. « Lofi hip hop » — `https://www.youtube-nocookie.com/embed/jfKfPfyJRdk`
2. « Synthwave » — `https://www.youtube-nocookie.com/embed/4xDzrJKXOOY`
3. « Chillhop » — `https://www.youtube-nocookie.com/embed/5yx6BWlEVcY`

Activation (propriétaire) : dans `.env`, `RADIO_STREAMS='[{"label":"Lofi hip hop","url":"https://www.youtube-nocookie.com/embed/jfKfPfyJRdk"}]'`, puis `docker compose up -d --wait backend`.

### Couleurs (contraste WCAG, ratios mesurés)

| Paire | Clair | Sombre | Niveau |
|---|---|---|---|
| Texte `app.ink` sur canvas / surface / sunken | 15,10 / 16,57 / 14,19 | 15,69 / 14,29 / 13,06 | AAA |
| Texte secondaire `app.muted` | 6,62 / 7,27 / 6,22 | 9,00 / 8,19 / 7,49 | AA (clair), AAA (sombre) |
| `brand.fg` | 8,47 / 9,30 / 7,96 | 7,87 / 7,16 / 6,55 | AAA (sauf sombre sur sunken : AA) |
| `saffron.fg` | 8,53 / 9,36 / 8,02 | 9,94 / 9,05 / 8,27 | AAA |
| Commentaire de code | 5,65 / 6,20 / 5,31 | 7,99 / 7,27 / 6,65 | AA |
| Bouton principal (blanc sur `brand.solid`) | 7,02 | **5,18 → 7,02** | AAA |
| Bouton safran | 6,56 | 9,92 | AA / AAA |
| Texte sur `brand.subtle` / `saffron.subtle` | 8,34 / 8,72 | 6,03 / 8,66 | AA–AAA |
| **Bordure des champs** (nouveau `app.field`) | **1,35 → 3,14 à 3,67** | **1,48 → 3,31 à 3,97** | 3:1 (WCAG 1.4.11) |

Changements : bouton principal sombre sur `brand.600` (AAA), bordure des champs (`Input`, `Textarea`, `NativeSelect`) sur le jeton `app.field`. Les bordures de cartes restent décoratives.

### Passe UX
- Lien d'évitement « Aller au contenu » (premier élément au clavier), `main` focusable.

## Conséquences
- Pas de migration. Variable facultative `RADIO_STREAMS`.
- Lighthouse : **NOT RUN** dans la session (pas de stack, consigne d'économie) ; à mesurer sur la production (objectif ≥ 90 dans les quatre catégories).
