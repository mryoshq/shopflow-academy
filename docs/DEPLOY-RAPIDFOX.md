# Déploiement unique retenu — Mac Docker Compose + Cloudflare Tunnel

**Domaine cible : `https://shopflow.rapidfox.io`. Domaine enregistré chez Hostinger, Cloudflare déjà utilisé pour `n8n.rapidfox.io`.** Le routage n'a pas été créé ni vérifié par ce kit. **Ne pas modifier n8n.**

## Principe : une seule stratégie, Cloudflare Tunnel

```text
Navigateur étudiant/enseignant → https://shopflow.rapidfox.io
                            → Cloudflare (DNS/proxy)
                            → cloudflared (sur le Mac Academy, ou tunnel partagé si même hôte)
                            → http://127.0.0.1:3080 [si cloudflared tourne sur le Mac]
                            → Gateway HTTP Docker (bind loopback seulement)
                               /       → Frontend React
                               /api/*  → FastAPI
                                            → PostgreSQL (réseau privé)
                                            → MySQL lab futur (réseau privé, profil labs)
```

La même URL publie frontend et API. Aucun port de base de données n'est exposé au réseau public ; ne pas exposer non plus le port de gateway sur `0.0.0.0` si seul cloudflared sur le Mac doit s'y connecter. La variable `ACADEMY_HOST_PORT=3080` est une convention proposée, à vérifier contre les services existants.

## Étape 1 : inventaire **en lecture seule** avant toute modification

1. Vérifier avec l'utilisateur le Mac hébergeant Academy et la machine hébergeant n8n.
2. Identifier les nameservers autoritaires (`dig NS rapidfox.io`) et la zone `rapidfox.io` dans Cloudflare ; **Hostinger est le registrar mais n'est pas nécessairement le DNS autoritaire**.
3. Dans le tableau de bord Cloudflare, identifier le tunnel de `n8n.rapidfox.io`, son mode (**dashboard-managed** / **locally-managed**), l'emplacement réel de `cloudflared` et les règles `hostname → service` existantes. Ne pas modifier celles de n8n.
4. Vérifier que `shopflow.rapidfox.io` n'a pas déjà un DNS/routage important et que le port 3080 est libre sur le Mac Academy : `lsof -nP -iTCP:3080 -sTCP:LISTEN`.
5. Sauvegarder **sans secrets** la configuration existante ; inventaire des routes DNS et Cloudflare, des ports locaux et du statut de n8n. Ne pas imprimer de token de tunnel.

## Étape 2 : choisir automatiquement la variante de tunnel **selon les machines**, sans ajouter de seconde stratégie d'hébergement

### Cas A — Academy et n8n sur **le même Mac / hôte cloudflared**

Ajouter après accord **une nouvelle application publiée** sur le tunnel nommé existant :

- Hostname : `shopflow.rapidfox.io`
- Type : HTTP
- Origin/Service : `http://127.0.0.1:3080` si `cloudflared` est installé sur cet hôte **et** écoute via le même espace réseau que ce `127.0.0.1`.
- Préserver **intégralement** la route `n8n.rapidfox.io` et tous ses paramètres ; ne pas redémarrer n8n pour ajouter ShopFlow.

### Cas B — n8n et Academy sur **deux machines différentes**

Créer après accord un **tunnel nommé dédié ShopFlow**, avec `cloudflared` sur **le Mac Academy**, puis y publier `shopflow.rapidfox.io` vers le gateway local. **Ne pas mettre `localhost:3080` sur le tunnel n8n** : sur une autre machine, cette adresse pointerait vers n8n et non Academy. Le tunnel nouveau vit sur le Mac Academy, sur le même domaine Cloudflare déjà configuré ; cela reste **une seule architecture Cloudflare Tunnel**, pas une option VPS.

### Cas C — cloudflared est lui-même **un conteneur**

`localhost` y désigne le conteneur, pas macOS. Utiliser une route interne explicite vers le service gateway accessible depuis ce conteneur (nom de service Docker sur réseau partagé contrôlé) ; ou, si cloudflared est déjà sur hôte, préférer la route locale 127.0.0.1. **Ne jamais brancher aveuglément un container au réseau n8n existant** ; vérifier risques et permissions.

## Étape 3 : préparation locale (sans publication)

1. Installer ou vérifier Docker Desktop + Docker Compose sur Mac ; cloner le repo privé et copier `.env.example` vers `.env` avec secrets aléatoires hors Git.
2. Développer gateway/frontend/backend/PostgreSQL selon P0-01 ; MySQL en profil `labs` tant qu'inutile. Une seule entrée locale `http://127.0.0.1:3080` (sous réserve de disponibilité).
3. Vérifier `docker compose config`, `docker compose up -d --build`, `docker compose ps`, tests HTTP `/` et `/health/ready` selon gateway ; vérifier que les volumes préservent les données après redémarrage.
4. Tester les deux rôles en local, les permissions IDOR, 10 sessions de test, création/preview/publication de mission et scorer. Tests avant connexion publique.
5. Préparer l'application au HTTPS externe : `APP_PUBLIC_URL=https://shopflow.rapidfox.io`, headers `X-Forwarded-*` admis **uniquement** depuis le proxy de confiance, cookies Secure/HttpOnly/SameSite, CSRF si sessions cookie, liens et redirections sur le bon hostname.

## Étape 4 : publier **seulement après autorisation explicite**

1. Dans Cloudflare, ouvrir le tunnel approprié, ajouter une **Published application** pour `shopflow.rapidfox.io`. Selon mode de gestion, la route peut être ajoutée dans le dashboard Cloudflare ou dans la config locale de `cloudflared`. Le dashboard peut créer le DNS CNAME automatiquement pour une route dashboard-managed ; **inspecter avant de créer en double**.
2. Valider le CNAME uniquement pour `shopflow`, sans changer le DNS `n8n`, `@`, `www` ou les enregistrements de messagerie. **Aucune migration globale DNS/nameservers.**
3. Tester depuis un réseau vraiment externe : résolution DNS, certificat TLS, arrivée sur login Academy, navigation React + `/api/v1`, cookies/session, enseignant/étudiant, chargement 10 utilisateurs ; contrôler en parallèle que `https://n8n.rapidfox.io` répond toujours.
4. Noter la date, le mode (tunnel partagé ou dédié), les tests réels, les dépendances au Mac et la procédure de retour arrière ; ne jamais publier un token de tunnel dans Git.

## Retour arrière sans impact sur n8n

- Arrêter uniquement les services `shopflow-academy` et, si dédié, son connecteur `cloudflared`; ne pas stopper la stack n8n.
- Désactiver **uniquement** la route/hostname `shopflow.rapidfox.io` ; laisser les autres routes/DNS inchangés.
- Restaurer l'archive/sauvegarde Academy en cas de migration ratée et rejouer les smoke tests.
- S'assurer après chaque rollback que `n8n.rapidfox.io` est toujours opérationnel.

## Exploitation

- Mac allumé, pas de mise en veille, alimentation fiable, upload suffisant, Docker Desktop et connecteur cloudflared toujours actifs.
- Sauvegardes PostgreSQL chiffrées hors du volume primaire, avec test **réel** de restauration. MySQL uniquement lorsqu'il est activé.
- Journal de déploiement et healthcheck. Prévoir mode maintenance ou export HTML/PDF des activités si le Mac tombe en panne pendant une séance.
- En l'absence de sécurité équivalente, ne jamais autoriser l'exécution de Python arbitraire téléchargé par les étudiants sur le Mac hôte.

## Sources officielles

- Cloudflare Tunnel / publier une application : https://developers.cloudflare.com/tunnel/get-started/
- Plusieurs hostnames sur un tunnel : https://developers.cloudflare.com/tunnel/concepts/routing/
- Publication / DNS CNAME : https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/

**Statut actuel : configuration documentée, non appliquée ; pas de garantie que `shopflow.rapidfox.io` soit déjà accessible.**
