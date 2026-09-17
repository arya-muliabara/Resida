param(
  [string]$ServiceName = "ResidaWeb",
  [string]$DisplayName = "Resida Web Service"
)

$ErrorActionPreference = "Stop"
$AppDir = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$RunScript = Join-Path $AppDir "scripts\windows\run.cmd"
$Cmd = "$env:SystemRoot\System32\cmd.exe"
$BinaryPath = "`"$Cmd`" /c `"$RunScript`""

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  Stop-Service -Name $ServiceName -ErrorAction SilentlyContinue
  sc.exe delete $ServiceName | Out-Null
  Start-Sleep -Seconds 2
}

New-Service -Name $ServiceName -DisplayName $DisplayName -BinaryPathName $BinaryPath -StartupType Automatic
Start-Service -Name $ServiceName
Write-Host "Service $ServiceName terinstall dan berjalan."
