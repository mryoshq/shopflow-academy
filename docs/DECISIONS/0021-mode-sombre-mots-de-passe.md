# ADR-0021 — Mode sombre, réinitialisation de mot de passe, fiches de connexion

**Date :** 2026-10-28
**Statut :** accepté (sprint 2, partie B)

## Contexte

Le propriétaire demande un mode sombre sans flash et compatible avec la CSP, une expérience étudiante plus simple (une colonne, raccourcis, ton encourageant, utilisable à 390 px), une réinitialisation de mot de passe par l'enseignant et des fiches de connexion imprimables, sans jamais mettre de données personnelles dans Git.

## Décision

- **Thème** : un seul système Chakra (`frontend/src/theme.ts`) ; chaque jeton sémantique a une valeur claire et une valeur `_dark`. Les jetons qui existent déjà dans Chakra (`green.solid`, `bg`, `bg.panel`) sont redéfinis avec `_light`/`_dark` (une clé `base` serait écrasée par le `_light` de Chakra).
- **Choix du thème** : « Système / Clair / Sombre », mémorisé dans `localStorage` (`shopflow:theme`) de ce navigateur seulement, pas sur le serveur (aucune donnée de compte en plus). `frontend/public/theme-init.js`, chargé dans `<head>`, pose la classe et `color-scheme` avant le premier rendu : pas de flash, et pas de script en ligne (la CSP `script-src 'self'` reste inchangée).
- **Réinitialisation** : `POST /teacher/classes/{attribution}/students/{étudiant}/reset-password`, réservé au propriétaire de la classe (404 sinon) et aux étudiants de cette classe. Mot de passe aléatoire lisible (3 groupes de 4 caractères sans ambiguïté, environ 67 bits), renvoyé **une seule fois** (`Cache-Control: no-store`), stocké seulement haché ; sessions ouvertes de l'étudiant révoquées, limitation de connexion remise à zéro ; audit `student.password_reset` **sans** le mot de passe. L'interface l'affiche jusqu'à « J'ai noté le mot de passe ».
- **Fiches de connexion** : `scripts/login_sheets.py` lit `.local/student-emails.txt`, écrit une page HTML imprimable (adresse, QR code, identifiant) dans `~/Developer/shopflow-notes/` (mode 0600) et refuse tout dossier de sortie dans le dépôt. Les mots de passe n'y figurent que sur demande explicite (`--with-passwords`, nom de fichier explicite). Le QR code est produit par `scripts/qrcode_min.py` (bibliothèque standard seulement, vérifié contre `segno` en test) : rien à installer sur le Mac.

## Conséquences

- Un étudiant qui change de navigateur retrouve le thème « Système ».
- Les captures d'écran de test masquent le mot de passe affiché.
- Pas de changement de mot de passe par l'étudiant lui-même (hors périmètre) ; voir `docs/SUGGESTIONS.md`.
