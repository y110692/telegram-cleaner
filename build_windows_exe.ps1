$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$venvPython = Join-Path $root ".venv-build\\Scripts\\python.exe"

if (-not (Test-Path $venvPython)) {
  python -m venv ".venv-build"
}

& $venvPython -m pip install --upgrade pip pyinstaller

& $venvPython -m PyInstaller `
  --noconfirm `
  --clean `
  --onedir `
  --windowed `
  --name "Разгребатель Телеги" `
  --add-data "fav_tinder_app\static;static" `
  "fav_tinder_app\server.py"

Write-Host ""
Write-Host "Сборка готова:"
Write-Host "  $root\dist\Разгребатель Телеги"
