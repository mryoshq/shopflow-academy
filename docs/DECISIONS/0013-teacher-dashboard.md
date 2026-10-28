# ADR-0013 — Tableau de bord enseignant et interventions de classe

**Date :** 2026-10-28
**Statut :** accepté pour P0-07

## Décision

- Une **classe** = une attribution (cohorte × version publiée). Toutes les routes `/api/v1/teacher/classes/...` sont réservées au **propriétaire du cours** (`Course.created_by`) et répondent 404 aux autres comptes, enseignants compris (accès propriétaire protégé, pas de fuite d'existence). Les étudiants reçoivent 403.
- **Vue de classe** (`/overview`) : par étudiant inscrit, missions réussies, score cœur/bonus (fonctions de P0-06), essais, indices, mission en cours (dernier essai ou indice), dernière activité, « actif » (≤ 5 min), « besoin d'aide » (≥ 3 échecs sur une mission non réussie).
- **Quasi temps réel par sondage** toutes les 5 s (`REFRESH_MS`), suspendable, avec indicateur « Actualisé il y a … » et état « connexion perdue ». Pas de SSE/WebSocket : pour 10 étudiants, le sondage est simple, robuste derrière Cloudflare Tunnel et suffisant. Latence mesurée en E2E entre un essai étudiant et son affichage : **≈ 4,4 s** (cible ≤ 10 s).
- **Interventions auditées** (`audit_events.details`, migration 0006) : pause/reprise de la séquence (`assignments.paused_at` ; en pause, l'étudiant relit mais ne peut ni répondre ni ouvrir d'indice : 409), déblocage d'une mission pour un étudiant (`mission_unlocks`, idempotent), export CSV. Journal visible dans l'écran.
- **Export CSV** : séparateur `;`, BOM UTF-8 (Excel Windows), nombres au format français, cellules commençant par `= + - @` neutralisées (injection de formules). Identifiants affichés sans domaine e-mail.
- Une correction de note manuelle n'est pas proposée dans ce lot ; elle viendra comme événement distinct, sans modifier les tentatives.

## Conséquences

Le compte enseignant réel ne voit dans « Suivi de classe » que ses propres cours ; la classe de démonstration appartient à `demo.enseignant`. Le studio, lui, reste partagé entre comptes enseignants (constat I3 de la revue, à trancher par le propriétaire).
