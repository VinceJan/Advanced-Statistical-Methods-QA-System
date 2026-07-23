$ErrorActionPreference = "Stop"
$env:PYTHONPATH = (Get-Location).Path
$env:APP_DISABLE_LLM = "true"
# 验证使用一次性测试凭据，避免依赖或暴露本地/生产管理员密码。
$env:ADMIN_PASSWORD = "pytest-only-admin-password"
# 使用独立验证数据库，避免覆盖本地演示数据或复用旧管理员密码哈希。
$env:APP_DATABASE_URL = "sqlite:///data/verify.db"
Get-NetTCPConnection -LocalPort 8000,5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}
.\.venv\Scripts\python.exe -m pytest backend\tests -q
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Push-Location frontend
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$auditPassed = $false
for ($attempt = 1; $attempt -le 3; $attempt++) {
  npm audit --omit=dev --registry=https://registry.npmjs.org
  if ($LASTEXITCODE -eq 0) {
    $auditPassed = $true
    break
  }
  if ($attempt -lt 3) {
    Write-Host "npm audit 第 $attempt 次失败，5 秒后重试..."
    Start-Sleep -Seconds 5
  }
}
if (-not $auditPassed) { exit 1 }
Pop-Location

$backend = $null
$frontend = $null
try {
  $backend = Start-Process -FilePath "powershell" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File",".\scripts\run_backend.ps1" -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 4
  $frontend = Start-Process -FilePath "powershell" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File",".\scripts\run_frontend.ps1" -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 4
  Push-Location frontend
  $systemChrome = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($systemChrome) {
    $env:PLAYWRIGHT_EXECUTABLE_PATH = $systemChrome
  } else {
    npx playwright install chromium
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
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
