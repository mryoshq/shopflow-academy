# Plan jusqu'à la fin du projet CampusEquip

Mis à jour le 05/11/2026, sur `main` 73c4cc0 (après #93, #95 et #96). Les séances sont terminées ; la remise du projet est le 23/11.

**Qui :**
- **Propriétaire** : l'enseignant, dans l'interface ou sur son Mac ;
- **Agent Mac** : agent local avec accès au Mac mini (Docker, Cloudflare, dossiers), toujours sur accord écrit ;
- **Codex** : PR locales avec captures ;
- **Cloud** : Claude Code en session cloud, PR sans accès au Mac ni à la production.

Aucun agent ne fusionne, ne déploie ni ne modifie Cloudflare sans accord écrit (CLAUDE.md).

## Avant le 21/11

| Point | État | Date limite | Qui | Prochaine action |
|---|---|---|---|---|
| Grille de la partie 1 (Projet > Notes) | Grille en place (#78) ; saisies à faire | 21/11 | Propriétaire | Saisir le socle et le bonus de la partie 1 pour chaque binôme, avec le point individuel ; reprendre les équipes marquées « Ancienne grille, à reprendre » |
| Créneaux de soutenance | Outil en place (Projet > Soutenances) ; créneaux à créer | 21/11 | Propriétaire | Créer les créneaux et y placer chaque binôme ; les étudiants les voient dans leur espace projet |
| Binômes complets | Binôme surprise en place (ADR-0041) | 21/11 | Propriétaire | Vérifier Projet > Binômes : aucun étudiant seul ; lancer le tirage pour les inscrits, puis placer les derniers à la main |

## Avant le 23/11

| Point | État | Date limite | Qui | Prochaine action |
|---|---|---|---|---|
| Grille de la partie 2 | Grille en place (#78) | 23/11 | Propriétaire | Saisir la partie 2 (commune au groupe) et ses bonus après les soutenances |
| Note finale | Calcul en place (ADR-0046), masquée aux étudiants | Décision du propriétaire | Propriétaire | Vérifier Réglages > Notes (poids, modules d'ateliers), puis cocher « Afficher la note finale aux étudiants » au moment choisi |

## Plateforme

| Point | État | Date limite | Qui | Prochaine action |
|---|---|---|---|---|
| e2e `project-draw` instable | En CI, le second essai ne repart pas d'un état propre : le tirage a déjà eu lieu et les inscriptions sont consommées | Avant la prochaine PR qui touche le projet | Cloud | PR : remise à zéro complète dans `beforeEach` (équipes, inscriptions, historique de tirage), ou spec en série sans relance |
| Refus d'un import qui fermerait un bloc ouvert | #91 fusionnée (un renommage garde les ouvertures) ; #92 fermée sans fusion | Avant le prochain import du cours réel | Codex | Nouvelle PR courte depuis `main` : simulation et refus avant toute écriture, avec le test de la scission ; reprendre l'idée de #92, pas son diff |
| E-mails Resend | #96 fusionnée : les variables `SMTP_*` atteignent maintenant le backend ; redéploiement à faire | Avant la prochaine invitation d'observateur | Propriétaire, puis agent Mac | Redéployer (`up -d --wait`) ; Réglages > Observateurs > « Envoyer un e-mail de test » |

## Contenu (après le projet)

| Point | État | Date limite | Qui | Prochaine action |
|---|---|---|---|---|
| Supports PDF des axes | À refaire ; l'axe 3 d'abord, puis l'axe 4 | Après le 23/11 | Propriétaire, avec Codex | Refondre le PDF de l'axe 3 dans le dépôt privé `shopflow-courses`, puis l'axe 4 |
| README du kit CampusEquip | Corrections à faire | Après le 23/11 | Codex | Relire le README du kit dans `shopflow-courses` et corriger les noms et les commandes |
| Vidéo CampusEquip | À refaire avec les noms actuels | Après le 23/11 | Propriétaire | Nouvelle capture avec les noms actuels (Rapidfox Academy, CampusEquip), puis l'ajouter au cours |

## Exploitation

| Point | État | Date limite | Qui | Prochaine action |
|---|---|---|---|---|
| Tunnel Cloudflare en http2 sur le Mac mini | À faire ; `cloudflared` est un LaunchDaemon partagé avec n8n | Hors séance | Agent Mac, sur accord écrit | Passer le connecteur en `--protocol http2`, redémarrer (n8n coupé quelques secondes), puis `python3 scripts/smoke_public.py` |
| Dépôt public | Public depuis le 05/11 (commit 79e8897, CI relancée) | Permanent | Propriétaire | Le garder public : aucun `.env`, jeton, corrigé ni donnée d'étudiant dans Git ; corrigés et cours réels dans `shopflow-courses` (privé) |
| Anciens dossiers de travail | Certains restent sur le Mac | Hors séance | Agent Mac, sur accord écrit | Lister les anciens clones et dossiers, vérifier qu'ils sont poussés ou sauvegardés, puis les archiver hors du dossier de travail |
