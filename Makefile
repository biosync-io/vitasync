.PHONY: help build dev stop down test lint format migrate seed logs shell

# Default target
help: ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# ── Development ──────────────────────────────────────────────

build: ## Build all Docker images
	docker compose build

dev: ## Start all services in development mode
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up

up: ## Start all services in detached mode
	docker compose up -d

down: ## Remove all containers and networks
	docker compose down

stop: ## Stop running containers
	docker compose stop

restart: ## Restart all services
	docker compose restart

logs: ## Tail logs for all services (or SERVICE=api make logs)
	docker compose logs -f $(SERVICE)

# ── Code Quality ─────────────────────────────────────────────

lint: ## Run linter
	pnpm run lint

lint-fix: ## Run linter with auto-fix
	pnpm exec biome check --write .

format: ## Format all code
	pnpm run format

typecheck: ## Run TypeScript type checking
	pnpm run typecheck

# ── Testing ──────────────────────────────────────────────────

test: ## Run all tests
	docker compose exec api pnpm run test

test-watch: ## Run tests in watch mode
	pnpm run test -- --watch

test-coverage: ## Run tests with coverage report
	pnpm run test -- --coverage

# ── Database ─────────────────────────────────────────────────

migrate: ## Apply pending database migrations
	docker compose exec api pnpm --filter=@vitasync/db run db:migrate

migrate-local: ## Apply migrations against local DB
	pnpm --filter=@vitasync/db run db:migrate

generate: ## Generate a new migration (m="description")
	pnpm --filter=@vitasync/db run db:generate

db-studio: ## Open Drizzle Studio (DB browser)
	pnpm --filter=@vitasync/db run db:studio

seed: ## Seed development data
	docker compose exec api node --import=tsx apps/api/scripts/seed.ts

# ── Utilities ────────────────────────────────────────────────

shell: ## Open a shell in the API container
	docker compose exec api sh

install: ## Install all dependencies
	pnpm install

clean: ## Remove all build artifacts and node_modules
	pnpm run clean

setup: ## First-time project setup
	@echo "Setting up VitaSync..."
	cp -n .env.example .env || true
	pnpm install
	@echo "Done! Edit .env then run: make dev"
