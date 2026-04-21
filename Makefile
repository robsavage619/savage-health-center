.DEFAULT_GOAL := help

.PHONY: help dev seed reset logs doctor install lint typecheck test

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install all deps (backend + frontend)
	cd backend && uv sync --dev
	cd frontend && npm install

dev: ## Start all services via honcho
	@mkdir -p data/logs data/hae data/uploads/kaiser data/source_docs data/backups
	honcho start

seed: ## Seed DuckDB with 90 days of synthetic data
	cd backend && uv run shc seed

reset: ## Delete DuckDB and re-seed (requires CONFIRM=1)
	@[ "$(CONFIRM)" = "1" ] || (echo "Set CONFIRM=1 to proceed" && exit 1)
	cd backend && uv run shc reset

logs: ## Tail all log files
	tail -f data/logs/*.log

doctor: ## Check that all required services and config are present
	@echo "Checking backend..."
	@cd backend && uv run python -c "from shc.config import settings; print('config ok')"
	@echo "Checking DuckDB..."
	@cd backend && uv run python -c "from shc.db.schema import init_db; init_db(); print('db ok')"
	@echo "Checking Ollama..."
	@curl -sf http://127.0.0.1:11434/api/tags > /dev/null && echo "ollama ok" || echo "WARNING: ollama not running"
	@echo ""
	@echo "Doctor complete."

lint: ## Run ruff lint + format check
	cd backend && uv run ruff check src/ && uv run ruff format --check src/

typecheck: ## Run pyright
	cd backend && uv run pyright src/

test: ## Run pytest
	cd backend && uv run pytest
