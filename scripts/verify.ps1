$ErrorActionPreference = "Stop"
$env:PYTHONPATH = (Get-Location).Path
$env:APP_DISABLE_LLM = "true"
Get-NetTCPConnection -LocalPort 8000,5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}
.\.venv\Scripts\python.exe -m pytest backend\tests -q
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Push-Location frontend
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm audit --omit=dev
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Pop-Location

$backend = $null
$frontend = $null
try {
  $backend = Start-Process -FilePath "powershell" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File",".\scripts\run_backend.ps1" -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 4
  $frontend = Start-Process -FilePath "powershell" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File",".\scripts\run_frontend.ps1" -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 4
  Push-Location frontend
  npx playwright install chromium
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  node .\e2e\visual-smoke.mjs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Pop-Location
}
finally {
  if ($frontend -and !$frontend.HasExited) { Stop-Process -Id $frontend.Id -Force -ErrorAction SilentlyContinue }
  if ($backend -and !$backend.HasExited) { Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue }
  Get-NetTCPConnection -LocalPort 8000,5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}
Write-Host "验证完成。"
