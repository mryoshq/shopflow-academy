"""Document-only tests: no claim about Academy runtime implementation."""
import sys
import unittest
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from verify_kit import main

class KitChecks(unittest.TestCase):
    def test_integrity_and_pedagogical_reference(self):
        self.assertEqual(main(), 0)

    def test_next_task_identifies_first_open_backlog_lot(self):
        import subprocess
        result = subprocess.run(
            [sys.executable, str(ROOT / 'scripts' / 'next_task.py')],
            capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0)
        backlog = (ROOT / 'docs/BACKLOG.md').read_text()
        expected = re.search(r'(?m)^- \[ \] \*\*(P\d-\d{2})\*\*', backlog)
        self.assertIsNotNone(expected)
        self.assertIn(f'NEXT TASK: {expected.group(1)}', result.stdout)

    def test_gitignore_secrets(self):
        ignore = (ROOT / '.gitignore').read_text()
        self.assertIn('.env', ignore)
        self.assertIn('*.key', ignore)

    def test_cloudflare_only_and_studio_first(self):
        backlog = (ROOT / 'docs/BACKLOG.md').read_text()
        self.assertLess(backlog.index('P0-04'), backlog.index('P2-01'))
        deploy = (ROOT / 'docs/DEPLOY-RAPIDFOX.md').read_text()
        self.assertIn('n8n.rapidfox.io', deploy)
        self.assertIn('shopflow.rapidfox.io', deploy)
        self.assertNotIn('Choix B : VPS', deploy)
        self.assertFalse((ROOT / 'docs/PROMPT-CODEX-IMPORT-GITHUB-HOSTINGER.md').exists())

if __name__ == '__main__':
    unittest.main()
