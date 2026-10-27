.PHONY: init-env seed-demo import-students test-backend test-frontend config up down smoke

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
