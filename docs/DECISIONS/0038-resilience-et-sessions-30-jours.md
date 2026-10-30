# ADR-0038 — Résilience aux coupures et sessions de 30 jours

Date : 30 octobre 2026 · Statut : accepté (demande du propriétaire)

## Contexte
Un redéploiement ou un redémarrage du backend coupait la plateforme quelques secondes. Les étudiants voyaient alors une erreur Cloudflare, ou une page « momentanément indisponible » qu'il fallait recharger à la main. Par ailleurs, la case « Rester connecté » créait deux durées de session, source de confusion en classe.

## Décision
- **Seul un 401 déconnecte.** Une erreur 502, 503 ou 504 de la passerelle (page HTML de nginx ou Cloudflare), ou une coupure du réseau, n'est jamais traitée comme une fin de session (`api.ts`, `App.tsx`). Les 503 et 504 de l'application elle-même (corps JSON : base de laboratoire indisponible, délai SQL dépassé) restent des erreurs normales de la page.
- **Page et bandeau « momentanément indisponible »** (`src/Unavailable.tsx`, `src/resilience.ts`) :
  - Texte affiché : « La plateforme est momentanément indisponible. Votre session et votre travail sont conservés. Nouvelle tentative automatique… ».
  - Une sonde unique interroge `/health/live` après 1, 2, 4, 8, 16 s, puis toutes les 30 s. Le bouton « Réessayer maintenant » lance une tentative tout de suite.
  - Si la vérification de session échoue au chargement, la page entière s'affiche, avec le logo et « Rapidfox Academy ». Au rétablissement, l'application s'ouvre à l'adresse demandée (le hash est conservé).
  - Si la page était déjà chargée, un bandeau s'affiche en bas. Les lectures (GET) attendent le rétablissement puis repartent seules ; il y a une seule attente par adresse, donc pas d'accumulation.
  - Les écritures échouent aussitôt avec un message clair. Le brouillon de réponse reste en mémoire et en `sessionStorage` tant que l'envoi n'a pas réussi, avec la même clé d'idempotence.
- **Service worker** :
  - Quand une navigation échoue (réseau ou 5xx), il sert la dernière page d'application en cache (l'app shell), sinon la page autonome `offline.html` au nouveau style (`offline.js` retente aussi `/health/live`). Il ne sert jamais la page d'erreur de la passerelle.
  - L'API, `/media/` et `/health/` ne sont jamais mis en cache.
  - nginx garde `Cache-Control: no-cache` sur `/sw.js`, `/index.html`, `/manifest.webmanifest`, `/theme-init.js`, `/offline.html` et `/offline.js`.
- **Sessions** :
  - Plus de case « Rester connecté » : toute connexion dure 30 jours et se prolonge à chaque visite (`GET /auth/me`, au plus une fois par heure). Le champ `remember` est ignoré s'il est encore envoyé.
  - Sous « Se connecter » : « Vous restez connecté 30 jours sur cet appareil. Sur un ordinateur partagé, déconnectez-vous depuis le menu de votre compte. ».
  - Les sessions sont des lignes de `user_sessions` (empreinte du jeton, jamais le jeton) : un redémarrage ou un redéploiement ne déconnecte personne. Aucune migration.
- **Déploiement** : `docker compose build` puis `docker compose up -d --wait`. La coupure se mesure avec `scripts/ops/measure_downtime.py` (voir `docs/RUNBOOK.md`).

## Limite
Un étudiant qui ouvre le site pour la première fois pendant une panne voit encore la page de Cloudflare, car le service worker n'est pas encore installé sur son appareil.

## Conséquences
- Les sessions de 8 h existantes deviennent des sessions de 30 jours à la visite suivante.
- Sur un poste partagé, la déconnexion explicite devient la règle ; le texte de la page de connexion le rappelle.
