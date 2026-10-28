# ADR-0029 — Confort et finitions : session persistante, code Catppuccin, images, passe mobile

- Statut : accepté (28/10/2026)
- Contexte : sprint 2, partie N (après M, avant J)

## Décision

### 1. « Rester connecté »
- Case facultative sur la carte de connexion, décochée par défaut. Cochée : session serveur de **30 jours**, renouvelée à chaque visite (`GET /api/v1/auth/me`, au plus une écriture par heure) ; sinon la durée actuelle (8 h, jamais prolongée).
- Rien d'autre ne change : jeton opaque dans le cookie `HttpOnly`, `SameSite=Lax`, `Secure` et préfixe `__Host-` en production ; jeton CSRF dans son cookie et en-tête `X-CSRF-Token` ; le renouvellement garde les **mêmes** jetons et repose seulement les deux cookies avec `Max-Age` 30 jours. Aucun jeton dans `localStorage` ni `sessionStorage`.
- Pas de migration : une session « rester connecté » se reconnaît à sa durée initiale (`expires_at - created_at` > 9 h) ; `created_at` est fixé par l'application à la connexion.
- La déconnexion révoque la session côté serveur (`revoked_at`), comme avant ; une session révoquée ou expirée est refusée même si le navigateur garde le cookie. La réinitialisation d'un mot de passe par l'enseignant révoque déjà toutes les sessions.

### 2. Coloration du code : Catppuccin
- Palette [Catppuccin](https://github.com/catppuccin/catppuccin) (licence MIT, © Catppuccin) : **Latte** en clair, **Mocha** en sombre, pour les blocs `code`, le code des `run` et l'éditeur du `sql_challenge`.
- Pas de dépendance : le petit tokeniseur existant (SQL, Python) gagne la catégorie « fonction ». Jetons : mots-clés `mauve`, chaînes `green`, nombres `peach`, fonctions `blue`, commentaires (italique) `subtext1` en Latte / `overlay2` en Mocha, texte `text`, fond `base`, bordure `surface0`.
- Contraste AA (≥ 4,5:1) vérifié par un test (`codetheme.test.tsx`) qui lit les jetons du thème. Mocha : couleurs officielles, toutes ≥ 5,8:1 sur `base`. Latte : les couleurs officielles `green` (2,96:1), `peach` (2,64:1) et `blue` (4,34:1) échouent sur `base` ; elles sont **assombries en gardant la teinte** : `#317A21` (4,72:1), `#BC4501` (4,65:1), `#145FF5` (4,66:1). `mauve` (4,79:1), `subtext1` (5,53:1) et `text` (7,06:1) restent officiels.
- Éditeur SQL : une copie colorée (`aria-hidden`) sous un `textarea` natif au texte transparent (curseur visible) : saisie, sélection, annulation, correcteur désactivé et lecteurs d'écran inchangés.

### 3. Images dans le cours
- `data.kind: image` : `file: media/<nom>.png|jpg|webp|svg` (`.jpeg` accepté, enregistré en `.jpg`), **2 Mo au plus**, `alt` **obligatoire** (≤ 300), `caption` facultative (≤ 300), `description` comme tous les médias. Copiée à l'import comme les vidéos (nom par empreinte SHA-256, volume en lecture seule), servie par la passerelle sous `/media/` avec le bon type, `nosniff`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`.
- Contrôles du compilateur (messages en français, ligne exacte) : signature PNG/JPEG/WebP, SVG sans script, attribut d'évènement, lien autre qu'interne (`href="#…"`), entité, `DOCTYPE` ni `foreignObject`. Pas de GIF, pas d'image distante.
- Affichage : image paresseuse sur un fond blanc (lisible en clair et en sombre), légende sous l'image, agrandissement au clic dans un `<dialog>` natif (Échap ou « Fermer », retour du focus). `scripts/course_md.py` envoie désormais aussi les images du dossier `media/`.

### 4. Passe mobile (390 × 844 et 360 × 800)
- Zones tactiles de 44 px sur téléphone et écran tactile (`max-width: 47.99em` ou `pointer: coarse`) : règle globale du thème pour boutons, onglets, listes et champs ; boutons de fermeture agrandis ; bureau inchangé.
- En-tête sur deux lignes : thème en icônes (noms accessibles conservés), « Se déconnecter » en icône avec nom accessible, badge de rôle masqué sous 480 px.
- Tableaux de résultats : cellules courtes sans retour à la ligne, défilement horizontal **dans** le tableau (région focusable), jamais de la page.
- Audit fait sur une page de capture jetable (données fictives, supprimée) : aucun défilement horizontal de page et aucune cible < 44 px sur connexion, tableau de bord, mission, cartes, exécution, image, défi SQL, classement, notifications et panneau Confort, aux deux tailles. Captures : `docs/captures/sprint2-n/`.

## Conséquences

- Pas de migration. Redéployer suffit (passerelle comprise, pour les types d'images).
- Le cours de démonstration gagne une leçon image (7 leçons ou révisions, 15 éléments) ; les tests qui le comptent sont mis à jour.
