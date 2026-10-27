#!/usr/bin/env python3
"""Print the next open backlog task and a bounded Codex prompt. No agent execution."""
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
rows=(ROOT/'docs/BACKLOG.md').read_text(encoding='utf-8').splitlines()
for row in rows:
    m=re.search(r'^- \[ \] \*\*(P[0-9]-[0-9]{2})\*\* (.+)$',row)
    if m:
        ident,details=m.groups()
        print('NEXT TASK:',ident,'-',details)
        print('\nPROMPT CODEX:')
        print(f'Lis AGENTS.md, docs/CPS.md, docs/ARCHITECTURE.md, docs/PROGRESS.md et docs/HANDOFF.md. '
              f'Utilise $bounded-agent-loop. Traite exclusivement {ident}; tests obligatoires, 3 cycles de réparation maximum par blocage. '
              'Documente tes résultats et mets à jour PROGRESS/HANDOFF. Prépare une PR GitHub, sans merger/déployer sans accord.')
        break
else:
    print('No uncompleted backlog tasks found. Review and expand the backlog.')
