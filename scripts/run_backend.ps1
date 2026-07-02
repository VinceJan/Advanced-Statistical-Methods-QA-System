$ErrorActionPreference = "Stop"
$env:PYTHONPATH = (Get-Location).Path
if (Test-Path ".env") {
  Get-Content ".env" | ForEach-Object {
    if ($_ -and -not $_.TrimStart().StartsWith("#") -and $_.Contains("=")) {
      $parts = $_.Split("=", 2)
      [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
    }
  }
}
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
