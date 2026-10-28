.PHONY: init-env seed-demo import-students test-backend test-frontend config up down smoke test-stack-up test-stack-down test-e2e test-load

init-env:
	python3 scripts/init_env.py

seed-demo:
	python3 scripts/seed_demo.py

import-students:
	python3 scripts/import_students.py

test-backend:
	cd backend && ../.venv/bin/python -m pytest -q

test-frontend:
	cd frontend && npm run test -- --maxWorkers=1 && npm run build

config:
	docker compose config --quiet

up:
	docker compose up -d --build

down:
	docker compose down

smoke:
	curl --fail --silent --show-error http://127.0.0.1:3080/health/live
	curl --fail --silent --show-error http://127.0.0.1:3080/health/ready
	curl --fail --silent --show-error http://127.0.0.1:3080/api/v1/status

# Test stack (separate Compose project, port 3180, throwaway database): never production.
test-stack-up:
	python3 scripts/test_stack.py up

test-stack-down:
	python3 scripts/test_stack.py down

test-e2e:
	cd frontend && npm run test:e2e

test-load:
	python3 scripts/load_test.py && python3 scripts/persistence_check.py && python3 scripts/restore_check.py --test-stack
