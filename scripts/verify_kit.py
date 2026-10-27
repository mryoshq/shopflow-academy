#!/usr/bin/env python3
"""Validate ShopFlow documentation kit ONLY — not the future web application."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    'README.md', 'AGENTS.md', 'docs/CPS.md', 'docs/ARCHITECTURE.md',
    'docs/PEDAGOGIE-28-OCT.md', 'docs/BACKLOG.md', 'docs/PROGRESS.md',
    'docs/HANDOFF.md', 'docs/OPERATIONS.md', 'docs/DEPLOY-RAPIDFOX.md',
    'docs/PROMPT-CODEX-IMPORT-GITHUB-CLOUDFLARE.md',
    'docs/DECISIONS/0004-platform-first.md', 'docs/DECISIONS/0005-cloudflare-only.md',
    'docs/MCP-AND-SKILLS.md', '.github/workflows/kit-check.yml',
    '.env.example', 'compose.yaml'
]
SKILLS = [
    'academy-architect', 'curriculum-mapper', 'mission-author',
    'grading-engine', 'ui-ux', 'qa-e2e', 'deploy-ops',
    'session-handoff', 'bounded-agent-loop'
]

def main():
    errors = []
    for path in REQUIRED:
        if not (ROOT / path).is_file():
            errors.append(f'Missing {path}')
    for name in SKILLS:
        path = ROOT / '.agents' / 'skills' / name / 'SKILL.md'
        if not path.is_file():
            errors.append(f'Missing skill {name}')
            continue
        body = path.read_text(encoding='utf-8')
        if not re.search(r'(?m)^---\nname:\s*' + re.escape(name) + r'\ndescription:\s*.+\n---', body):
            errors.append(f'Malformed skill metadata: {name}')
        # Claude Code loads the same skills through relative symlinks (single source of truth).
        exposed = ROOT / '.claude' / 'skills' / name
        if not exposed.is_symlink() or exposed.resolve() != path.parent.resolve():
            errors.append(f'Claude Code skill link missing or diverging: .claude/skills/{name}')

    ped_path = ROOT / 'docs/PEDAGOGIE-28-OCT.md'
    doc = ped_path.read_text(encoding='utf-8') if ped_path.is_file() else ''
    sql, py = {}, {}
    for ident, score in re.findall(r'\| (SQL-\d\d|PY-\d\d) \|[^\n]+?\| (\d+) \|', doc):
        (sql if ident.startswith('SQL') else py)[ident] = int(score)
    if len(sql) != 6 or sum(sql.values()) != 25:
        errors.append(f'SQL reference expected 6 /25 pts: {len(sql)} /{sum(sql.values())}')
    if len(py) != 18 or sum(py.values()) != 75:
        errors.append(f'PY reference expected 18 /75 pts: {len(py)} /{sum(py.values())}')

    prompt_path = ROOT / 'docs/PROMPT-CODEX-IMPORT-GITHUB-CLOUDFLARE.md'
    if prompt_path.is_file():
        prompt = prompt_path.read_text(encoding='utf-8')
        for expected in ['ShopFlow_Academy_Codex_GitHub_Rapidfox.zip', 'n8n.rapidfox.io',
                         'shopflow.rapidfox.io', 'P0-01', 'studio', 'Cloudflare Tunnel']:
            if expected not in prompt:
                errors.append(f'Prompt missing {expected}')
        if len(prompt.split()) < 2500:
            errors.append('Prompt unexpectedly short; initial prompt should be exhaustive')

    backlog_path = ROOT / 'docs/BACKLOG.md'
    if backlog_path.is_file():
        backlog = backlog_path.read_text(encoding='utf-8')
        for expected in ['P0-01', 'P0-04', 'P0-10', 'P2-01', 'P2-02']:
            if expected not in backlog:
                errors.append(f'Backlog missing {expected}')
        if backlog.find('studio') == -1 or backlog.find('studio') > backlog.find('P2-01'):
            errors.append('Course studio must precede real courses')

    tunnel_path = ROOT / 'docs/DEPLOY-RAPIDFOX.md'
    if tunnel_path.is_file():
        tunnel = tunnel_path.read_text(encoding='utf-8')
        for expected in ['n8n.rapidfox.io', 'shopflow.rapidfox.io',
                         '127.0.0.1:3080', 'deux machines', 'Cloudflare Tunnel']:
            if expected not in tunnel:
                errors.append(f'Deployment runbook missing {expected}')
    if (ROOT / 'docs/PROMPT-CODEX-IMPORT-GITHUB-HOSTINGER.md').exists():
        errors.append('Legacy dual-strategy prompt still present')

    if (ROOT / '.env').is_file():
        print('NOTICE: .env exists locally; never commit it')
    for item in errors:
        print('ERROR:', item)
    print(('PASS' if not errors else 'FAIL'), f'kit checks: {len(errors)} errors; NOT an app test')
    return int(bool(errors))

if __name__ == '__main__':
    sys.exit(main())
