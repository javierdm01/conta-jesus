$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Abre Docker Desktop y vuelve a ejecutar este archivo.' }
if (-not (Test-Path -LiteralPath '.env')) {
  node scripts/init-local.mjs
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar la configuración.' }
}
docker compose build web
if ($LASTEXITCODE -ne 0) { throw 'No se pudo construir la aplicación.' }
docker compose up -d --no-build
if ($LASTEXITCODE -ne 0) { throw 'No se pudo arrancar la aplicación. Revisa docker compose logs.' }
$ownerCount = docker compose exec -T web node scripts/owner-count.mjs
if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el estado de la instalación.' }
if ([int]$ownerCount -eq 0) {
  $settings = @{}
  Get-Content -LiteralPath '.env' | ForEach-Object { if ($_ -match '^([A-Z_]+)=(.*)$') { $settings[$matches[1]] = $matches[2] } }
  docker compose exec -T -e "ADMIN_EMAIL=$($settings.ADMIN_EMAIL)" -e "ADMIN_PASSWORD=$($settings.ADMIN_PASSWORD)" -e "ADMIN_NAME=$($settings.ADMIN_NAME)" -e "COMPANY_NAME=$($settings.COMPANY_NAME)" web npm run bootstrap
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el usuario inicial. Revisa las variables ADMIN de .env.' }
}
Write-Host 'Instala está en marcha: http://localhost:3000'
Write-Host 'Si usaste la configuración automática, encontrarás el acceso en data/ACCESO_LOCAL.txt.'
