# ADR-0049 — Aperçus des fichiers protégés

Date : 2 novembre 2026. Statut : proposé pour revue avec la PR des lots 3–4.

Les fichiers de cours restent des pièces jointes servies par la route authentifiée existante. Le lecteur peut récupérer cette même pièce jointe avec les cookies de session pour offrir un aperçu local en lecture seule, sans nouvelle route ni modification des permissions, y compris pour les blocs fermés selon la politique déjà en vigueur.

- Code : UTF-8 strict, MIME textuel autorisé, 256 Kio et 4 000 lignes maximum. Le texte reste inerte ; les sources longues utilisent un rendu sans coloration pour borner le nombre de nœuds.
- PDF : PDF.js 6.5.438 et worker de même version servis depuis le bundle local. Flux de 10 Mio maximum, 200 pages et canvas de 12 millions de pixels maximum. Aucun gestionnaire de scripting, couche de liens/formulaires, XFA, lecteur externe ou CDN. Texte extrait affiché comme texte inerte.
- Le flux est mesuré pendant la lecture et annulé à la fermeture ou à l’expiration du délai, indépendamment de la taille annoncée. Les erreurs conservent téléchargement et fermeture ; un échec de chunk PDF est contenu dans le dialogue avec rechargement explicite.
- La CSP du gateway reste inchangée. Le harness composants autonome reprend cette CSP exacte, emploie uniquement des fixtures fictives et vérifie l’absence d’exécution du JavaScript embarqué, de liens actifs et de requêtes externes.
- Node 22.13 minimum est déclaré et contrôlé dans les jobs frontend/E2E ; la CI utilise la version 22 fournie par setup-node.

Le téléchargement original reste disponible lorsque le type, la taille ou le navigateur ne permet pas l’aperçu. Aucun score, document de cours, ressource privée source ou schéma n’est modifié. La limite du texte extrait borne le texte affiché ; elle ne constitue pas une garantie de mémoire totale de PDF.js.

Déploiement et migrations : aucun déploiement effectué ; aucune migration nécessaire. Une mise en service exige un accord distinct du propriétaire après revue.
