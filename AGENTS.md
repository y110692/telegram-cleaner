# Project Guardrails

This repository contains the Telegram Cleaner project.

This `AGENTS.md` file is a mandatory guard file. Any agent working in this repository must read it before planning, editing files, deploying, or running server-side operations.

## Confirmed Project Scope

- Local repository root: the directory that contains this `AGENTS.md`
- Main application source: `telegram-cleaner/`
- Deployable static source: `telegram-cleaner/static/`
- Final deploy-ready build source: `telegram-cleaner-v2/`
- Canonical GitHub repository for publishing: `https://github.com/y110692/telegram-cleaner`
- Local helper entrypoints that belong to this project:
  - `README.md`
  - `start_fav_tinder.ps1`
  - `telegram-cleaner/server.py`
  - `telegram-cleaner/README.md`

## Confirmed Remote Scope

- Allowed remote deploy path: `/var/www/website/apps/telegram-cleaner/`

## Shared Infrastructure

- `/var/www/website/` is a shared web root and is not owned by this project as a whole.
- Only the confirmed remote scope above belongs to this project.
- Any remote path outside the confirmed remote scope is outside this project's structure.

## Hard Rules

1. Work only inside this repository for local file changes.
2. Deploy only from `telegram-cleaner/static/` or (for the new finalized UI) from `telegram-cleaner-v2/`.
3. Deploy only into `/var/www/website/apps/telegram-cleaner/`.
4. Never use `/var/www/website/` as the deploy target root.
5. Never touch files, directories, apps, or server paths that are not part of this project's structure.
6. Never run mirror or destructive deployment commands against shared infrastructure.
7. Never delete anything outside the confirmed project-owned remote path, even for cleanup.
8. Before any deploy, explicitly print the source path and target path and verify that the target is exactly inside the confirmed remote scope.
9. If the requested target path is ambiguous or outside the allowlist, stop and refuse.
10. Use only project-specific temporary staging paths, for example `/tmp/telegram-cleaner-stage/`.
11. Before server deploy of the new finalized UI, publish/sync the same finalized files to `https://github.com/y110692/telegram-cleaner`.

## Prohibited Operations

- `rsync --delete`
- mirror sync into a shared web root
- bulk copy into `/var/www/website/`
- recursive delete outside `/var/www/website/apps/telegram-cleaner/`
- cleanup that removes paths not owned by this project

## Practical Interpretation

- "Not part of this project's structure" means any local path outside this repository root and any remote path outside `/var/www/website/apps/telegram-cleaner/`.
- Safe inspection of shared server structure is allowed when needed to confirm boundaries.
- Shared paths may be read for verification, but they must not be used as deploy targets or cleanup targets.
