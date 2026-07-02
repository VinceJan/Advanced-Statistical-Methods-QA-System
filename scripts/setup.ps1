$ErrorActionPreference = "Stop"

if (!(Test-Path ".venv")) {
  python -m venv .venv
}

.\.venv\Scripts\python.exe -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (!(Test-Path "frontend\node_modules")) {
  Push-Location frontend
  npm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Pop-Location
}

Write-Host "依赖安装完成。"
