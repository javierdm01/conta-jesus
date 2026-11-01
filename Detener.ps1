$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
docker compose stop
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron detener todos los servicios.' }
Write-Host 'Servicios detenidos. Los datos se conservan.'
