$ErrorActionPreference = "Stop"

$AppDir = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $AppDir

$Port = "8082"
$HostName = "0.0.0.0"
$ForwardedAllowIps = "127.0.0.1"
$UploadDir = "uploads"
if (Test-Path ".env") {
  Get-Content ".env" | ForEach-Object {
    if ($_ -match "^\s*APP_PORT\s*=\s*(.+?)\s*$") {
      $script:Port = $Matches[1]
    }
    if ($_ -match "^\s*APP_HOST\s*=\s*(.+?)\s*$") {
      $script:HostName = $Matches[1]
    }
    if ($_ -match "^\s*FORWARDED_ALLOW_IPS\s*=\s*(.+?)\s*$") {
      $script:ForwardedAllowIps = $Matches[1]
    }
    if ($_ -match "^\s*UPLOAD_DIR\s*=\s*(.+?)\s*$") {
      $script:UploadDir = $Matches[1]
    }
  }
}

New-Item -ItemType Directory -Force -Path $UploadDir | Out-Null
& ".\.venv\Scripts\python.exe" -m uvicorn app.main:app --app-dir backend --host $HostName --port $Port --proxy-headers --forwarded-allow-ips $ForwardedAllowIps
