# Migration vers dataflow.mryoshq.com et DataFlow KWS (25-26/11/2026)

Note de passation pour l'agent qui maintient ce dépôt. Rédigée par la session qui a déplacé
l'hébergement Cloudflare du propriétaire de l'ancien compte **yoshq.xd** (zone `rapidfox.io`, tunnel
partagé `m316`) vers le compte **mryoshq** (domaine `mryoshq.com`). Décision : ADR-0052.
Nouveau nom de la plateforme voulu par le propriétaire : **DataFlow KWS** (DataFlow Knowledge
Sharing), à appliquer via les issues #117, #118 et #119.

## Ce qui a changé hors du dépôt

| | Avant | Maintenant |
|---|---|---|
| Adresse publique | https://shopflow.rapidfox.io | **https://dataflow.mryoshq.com** |
| Ancienne adresse | - | `shopflow.rapidfox.io/<chemin>` → 301 vers `dataflow.mryoshq.com/<chemin>` (chemin et requête gardés) jusqu'à l'expiration de rapidfox.io (05/02/2027) |
| Compte Cloudflare | yoshq.xd (en cours de fermeture) | mryoshq |
| Tunnel | `m316`, partagé avec n8n et OXORUS, `cloudflared` Homebrew (LaunchDaemon) | tunnel dédié **`dataflow`** (b6763f22-b8e5-4d6e-97ca-ade5b2954f50), route `dataflow.mryoshq.com` → `http://host.docker.internal:3080` |
| Connecteur | service système du Mac | conteneur `mryoshq-tunnels-dataflow-1`, projet Compose `mryoshq-tunnels` dans `~/Developer/tunnels` (README). Géré par le propriétaire, hors dépôt : ne pas y toucher. |
| Zone mryoshq.com | - | SSL Full (strict), Always Use HTTPS, TLS ≥ 1.2, HSTS 6 mois (sous-domaines), règle de cache « dataflow sw.js no cache » (`/sw.js` jamais mis en cache) |
| E-mail | `mail.rapidfox.io` | **`mail.mryoshq.com`** vérifié chez Resend, même clé API (renommée « dataflow » chez Resend) |
| n8n | n8n.rapidfox.io | n8n.mryoshq.com (son propre tunnel, hors de cette stack) |

## `.env` de production (non versionné)

Sauvegarde avant changement : `~/Developer/shopflow-academy/.env.bak-2026-11-25` (ignorée par git).

- `APP_BASE_URL=https://dataflow.mryoshq.com`
- `APP_EXTRA_ORIGINS=http://127.0.0.1:3080,https://shopflow.rapidfox.io`. L'ancienne origine est
  gardée pendant la bascule ; la redirection est active depuis le 26/11 00:09 UTC, donc elle peut
  être retirée (issue #120).
- `SMTP_FROM=dataflow@mail.mryoshq.com`. **Adresse seule** : `mailer.py` ajoute lui-même le nom
  (`formataddr(("Rapidfox Academy", …))`). L'ancienne valeur `Rapidfox Academy <academy@mail.rapidfox.io>`
  produisait un en-tête invalide `Rapidfox Academy <Rapidfox Academy <…>>` et un Message-ID au domaine
  `…io>` : les invitations ont pu être refusées avant le 26/11. Le nom affiché deviendra « DataFlow KWS »
  avec l'issue #117.
- Backend recréé (`docker compose up -d --no-build backend`) après chaque changement, sain. Les autres
  services n'ont pas été redémarrés.

## Vérifié

- Depuis le réseau Docker du tunnel, `dataflow.mryoshq.com` → `127.0.0.1:3080` répond 200.
- Dans Chrome, `https://shopflow.rapidfox.io/` arrive sur la page de connexion de
  `https://dataflow.mryoshq.com/`. Le propriétaire a confirmé que la connexion fonctionne.
- En-tête From produit par le backend : `Rapidfox Academy <dataflow@mail.mryoshq.com>`.
- Sur cette branche : pytest 355 PASS / 9 skipped / 1 FAIL préexistant (`cryptography` absent du venv
  local, échoue aussi sur main) ; Vitest 248 PASS ; build PASS ; `verify_kit.py` 0 erreur.

## Non vérifié (à faire, issue #120)

- `scripts/smoke_public.py` et `scripts/ops_status.py` sur la nouvelle adresse, depuis un réseau externe.
- Envoi réel d'un e-mail (e-mail de test de l'espace observateur) et notifications push.
- Playwright E2E.

## Dépôt et dossiers

- PR **#116** (branche `feat/domaine-mryoshq-com`, worktree `~/Developer/shopflow-academy-dataflow`) :
  adresses dans le code, les tests, les scripts et la doc courante ; ADR-0052 ; ce fichier. Non fusionnée.
- Issues : **#117** marque DataFlow KWS (interface, e-mails, exports), **#118** identifiants techniques
  « academy » (cookies, projet Compose et volumes : ne pas renommer sans plan), **#119** documentation
  et fichiers d'agents, **#120** vérification de la production.
- Le worktree `~/Developer/shopflow-claude-setup` a été supprimé (`git worktree remove`). Ses branches
  restent dans le dépôt, dont **`feat/campusequip-partie2`, commit ca60de3 jamais poussé** : ne pas la
  supprimer.
- Historique complet du déplacement : `~/Developer/tunnels/cloudflare-migration.md`.
