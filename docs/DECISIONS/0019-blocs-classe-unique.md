# ADR-0019 — Journée en blocs de 15 minutes, classe et cours uniques, demandes d'aide

**Date :** 2026-10-28
**Statut :** accepté (décisions du propriétaire, sprint 2, partie A)

## Contexte

Le propriétaire a fixé : une classe (les 10 étudiants `@ynov.com`), un enseignant, un cours avec plusieurs modules ; une journée découpée en blocs d'environ 15 minutes que l'enseignant ouvre un par un ; chaque étudiant sur son PC, sans mode projection ; aide à la demande ; ton jamais pénalisant. Le modèle de données (cohortes, attributions multiples, plusieurs cours) doit rester extensible.

## Décision

- **Bloc = chapitre.** Le format Markdown accepte `## Bloc : <titre>` comme synonyme de `## Chapitre : <titre>`.
- **État d'ouverture par classe et par bloc** : table `block_states(cohort_id, chapter_id, opened_at, closed_at, updated_by)` (migration 0007). Clé = classe × chapitre, donc l'état survit aux nouvelles versions publiées (les identifiants de chapitre du brouillon sont repris dans chaque version). Aucune ligne = fermé : un bloc nouvellement importé arrive **fermé**. La migration ouvre tous les blocs des attributions existantes (comportement inchangé pour elles).
- **Un bloc fermé n'expose rien** : ni titre de mission, ni contenu, dans le tableau de bord, `/student/courses/{id}` et `/student/missions/{id}` (404, comme une mission d'une autre classe). Seul le titre du bloc et son nombre de missions sont visibles (« Bientôt disponible »). Les blocs ouverts restent ouverts tant que l'enseignant ne les ferme pas ; les bonus d'un bloc ouvert sont disponibles à tout moment. Le **déblocage individuel** d'une mission (`mission_unlocks`) donne accès à cette mission même dans un bloc fermé.
- **Pilotage** : `POST /teacher/classes/{id}/blocks/open-next` (premier bloc fermé dans l'ordre du cours), `…/blocks/{chapitre}/open|close`, audités (`block.open`, `block.close`) dans le journal de la classe. `GET …/timeline` (sondage 5 s) : blocs, étudiants ayant terminé (toutes les missions principales réussies), demandes d'aide, statistiques par mission (réussites, essais, indices, étudiants bloqués après 3 échecs). Le repère de 15 minutes est **calculé et affiché côté enseignant seulement** ; rien ne se ferme automatiquement, l'étudiant n'a aucun chronomètre.
- **Demandes d'aide** : table `help_requests` (en attente → traitée). Une seule demande en attente par mission et par étudiant (une nouvelle demande renvoie la même), message facultatif ≤ 300 caractères en texte brut, 20 demandes par heure au plus. L'étudiant ne lit que ses propres demandes ; seul le propriétaire du cours les traite (404 sinon), action auditée (`help.handled`).
- **Classe et cours uniques** : `POST /teacher/main/setup` (idempotent) trouve ou crée la cohorte `CLASS_LABEL` (défaut « Classe B3 IA/Data ») en y inscrivant les étudiants actifs, et le brouillon du cours `MAIN_COURSE_SLUG` (défaut `python-data-engineering-sql`). `POST /teacher/main/publish` publie et **déplace** l'attribution de la classe vers la nouvelle version (pause et déblocages conservés). Les écrans de cohortes et d'attributions restent disponibles sous « Options avancées », l'API est inchangée.
- **Interface enseignant** en trois zones : « Mon cours » (studio, aperçu, publication), « Ma classe » (frise, aide, difficultés, suivi), « Résultats » (notes, CSV).
- **Ménage** : `POST /teacher/courses/cleanup {apply}` et `python -m app.course_cleanup [--apply] < .local/teacher-email.txt` archivent les cours du propriétaire dont le slug contient `e2e`, `test` ou `demo`, jamais attribués à la classe réelle, autres que le cours principal. Simulation par défaut ; rien n'est supprimé.
- **`APP_SECRET` obligatoire en production** (≥ 32 caractères) : le backend refuse de démarrer sans lui. Les tentatives stockent les identifiants d'auteur, donc un changement de clé ne les invalide pas (test).

## Conséquences

- La stack de test règle `MAIN_COURSE_SLUG` et `CLASS_LABEL` sur le cours et la cohorte de démonstration ; le cours de démonstration ouvre son bloc à l'installation (outil de test, comptes fictifs).
- Un second enseignant ou une seconde classe restent possibles (modèle inchangé), via les options avancées.
