#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

VENV_PYTHON="$ROOT/.venv-build-mac/bin/python"

if [ ! -x "$VENV_PYTHON" ]; then
  python3 -m venv "$ROOT/.venv-build-mac"
fi

"$VENV_PYTHON" -m pip install --upgrade pip pyinstaller

"$VENV_PYTHON" -m PyInstaller \
  --noconfirm \
  --clean \
  --windowed \
  --onedir \
  --name "Разгребатель Телеги" \
  --add-data "$ROOT/fav_tinder_app/static:static" \
  "$ROOT/fav_tinder_app/server.py"

echo
echo "Сборка готова:"
echo "  $ROOT/dist/Разгребатель Телеги.app"
