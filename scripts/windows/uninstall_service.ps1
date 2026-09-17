param(
  [string]$ServiceName = "ResidaWeb"
)

$ErrorActionPreference = "Stop"
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  Stop-Service -Name $ServiceName -ErrorAction SilentlyContinue
  sc.exe delete $ServiceName | Out-Null
  Write-Host "Service $ServiceName dihapus."
} else {
  Write-Host "Service $ServiceName tidak ditemukan."
}

