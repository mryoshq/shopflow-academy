# ADR-0005 — Cloudflare Tunnel, méthode unique pour shopflow.rapidfox.io

Status: Accepted (proposal), 2026-10-27.

Decision: Exposer l'Academy uniquement via **Cloudflare Tunnel** vers le gateway local d'un **Mac Docker Compose**. Domaine `rapidfox.io` enregistré chez Hostinger, `n8n.rapidfox.io` déjà connecté à Cloudflare. Si cloudflared + Academy sur même Mac : tunnel existant avec route supplémentaire après accord. Si n8n et Academy sur hôtes différents : tunnel nommé dédié sur Mac Academy, sans altérer n8n. Pas de VPS ni modification des nameservers, pas de DNS ni déploiement sans accord explicite.

Rationale: Éviter les dépenses et travaux DNS redondants, réutiliser Cloudflare et préserver n8n, permettre un apprenant distant.

Consequence: Mac doit rester allumé, disponible et connecté ; les tests extérieurs et le rollback ne peuvent être déclarés validés avant test réel.
