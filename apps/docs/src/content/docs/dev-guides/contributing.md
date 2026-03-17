---
title: Contributing & Release Process
description: How to contribute to VitaSync — branch naming, PR title convention, and how automatic version bumps work.
---

import { Aside, Steps } from '@astrojs/starlight/components';

## Branch Naming

| Pattern | Purpose |
|---------|---------|
| `feature/<short-description>` | New features or UI enhancements |
| `fix/<short-description>` | Bug fixes |
| `beta/<short-description>` | Release candidates for staging / beta testing |
| `alpha/<short-description>` | Experimental work-in-progress builds |

All of these branch patterns trigger a Docker image build — you get a testable image tagged `alpha-<sha>` or `beta-<sha>` automatically. Only `main` publishes a stable `latest` image.

## PR Title Convention (Conventional Commits)

**PR titles are used to determine the version bump when merged to `main`.** The title must follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>[optional scope][optional !]: <description>
```

### Valid types

| Type | When to use |
|------|------------|
| `feat` | A new feature visible to end-users or API consumers |
| `fix` | A bug fix |
| `chore` | Maintenance tasks (deps update, config changes) |
| `docs` | Documentation-only changes |
| `style` | Formatting changes — no logic change |
| `refactor` | Code restructuring without behaviour change |
| `perf` | Performance improvements |
| `test` | Adding or fixing tests |
| `build` | Build system or tooling changes |
| `ci` | CI/CD workflow changes |
| `revert` | Reverts a previous commit |

### Examples

```
feat: add Withings provider
fix(worker): retry token refresh on 401
chore: update drizzle to 0.39
docs: add contributing guide
feat!: remove legacy v0 API endpoints
```

<Aside type="caution">
  An empty PR title, or one that doesn't match the pattern above, will fail the **PR Title Lint** required check and block merging.
</Aside>

## Automatic Version Bumps

When a PR is merged to `main`, the `docker-publish` workflow inspects the PR title and bumps the `VERSION` file automatically:

| PR title | Bump | Example |
|----------|------|---------|
| `feat!: …` or includes `BREAKING CHANGE` | **major** | `1.2.3 → 2.0.0` |
| `feat: …` or `feat(scope): …` | **minor** | `1.2.3 → 1.3.0` |
| Anything else (`fix:`, `chore:`, …) | **patch** | `1.2.3 → 1.2.4` |

The workflow then:

<Steps>
1. Writes the new version to the `VERSION` file.
2. Commits `chore: release vX.Y.Z` back to `main`.
3. Creates a `vX.Y.Z` git tag.
4. Builds and pushes Docker images tagged `X.Y.Z`, `X.Y`, `X`, `latest`, and `sha-<short-sha>`.
5. Packages and publishes the Helm chart to GHCR.
</Steps>

**No manual label-setting, tag-pushing, or `package.json` editing is required.**

## The `VERSION` File

The `VERSION` file at the repository root is the **single source of truth** for the release version:

```
1.0.0
```

- **Do not manually edit `VERSION`** — the release workflow manages it.
- `package.json` versions in individual apps/packages are not used for Docker image tagging or Helm chart versioning.
- If you need to read the current version in a script: `cat VERSION`.

## Local Development Tips

```bash
# Install all dependencies
pnpm install

# Build all packages and apps
pnpm build

# Start everything in hot-reload mode
pnpm dev

# Run linting
pnpm lint

# Run tests
pnpm test

# Typecheck
pnpm typecheck
```

Before opening a PR:
- Run `pnpm lint` and `pnpm typecheck` — both must pass.
- Make sure your PR title follows the Conventional Commits format.
- Include tests for new behaviour where practical.
