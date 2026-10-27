---
name: deploy-ops
description: Exploiter ShopFlow sur Mac Docker Compose + Cloudflare Tunnel uniquement, sans toucher au n8n déjà publié.
---

# deploy-ops

Read DEPLOY-RAPIDFOX and OPERATIONS. **Only** deployment path is Mac+Docker Compose+Cloudflare Tunnel, target shopflow.rapidfox.io. n8n.rapidfox.io already uses Cloudflare and MUST stay untouched. First inventory the cloudflared placement: same Mac as Academy permits an extra published app route on existing tunnel; different host requires dedicated named tunnel on Academy Mac. Distinguish host localhost from container localhost. Bind gateway to Mac loopback proposed 127.0.0.1:3080; databases internal. Run Compose, health and backup/restore tests locally first. Ask approval before DNS/tunnel/public release, and verify n8n before/after. No VPS, Kubernetes or Caddy public alternative. State NOT RUN for missing checks.

## Sortie obligatoire
- Lot ID, fichiers modifiés, critères d'acceptation.
- Commandes de tests + statut **PASS/FAIL/NOT RUN** réel.
- Risques, demande d'accord humain éventuelle, lien issue/PR si disponible.
- Mise à jour `docs/PROGRESS.md` et `docs/HANDOFF.md`.
