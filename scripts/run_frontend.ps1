$ErrorActionPreference = "Stop"
Push-Location frontend
npm run dev -- --host 127.0.0.1 --port 5173
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Pop-Location
