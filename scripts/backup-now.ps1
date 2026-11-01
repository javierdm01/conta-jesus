param([ValidateRange(20,600)][int]$TimeoutSeconds=120)
$ErrorActionPreference='Stop'
$workspacePath=Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $workspacePath
try {
  docker info --format '{{.ServerVersion}}' | Out-Null
  if($LASTEXITCODE -ne 0){throw 'Docker no está disponible. Inicia Docker Desktop y vuelve a intentarlo.'}
  $statusPath=Join-Path $workspacePath 'backups/status.json'
  $previousBackupId=''
  if(Test-Path -LiteralPath $statusPath){try{$previousBackupId=(Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json).id}catch{}}
  docker compose restart backup
  if($LASTEXITCODE -ne 0){throw 'No se pudo iniciar la copia. Revisa el servicio backup.'}
  $deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while([DateTime]::UtcNow -lt $deadline){
    if(Test-Path -LiteralPath $statusPath){
      try{$backupState=Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json}catch{$backupState=$null}
      if($backupState -and $backupState.id -ne $previousBackupId -and $backupState.id -match '^\d{8}T\d{6}Z$' -and $backupState.integrityVerified -eq $true){
        docker compose exec -T -w "/backups/$($backupState.id)" backup sha256sum -c SHA256SUMS
        if($LASTEXITCODE -ne 0){throw 'La comprobación independiente de la copia ha fallado.'}
        Write-Host "Copia completada y verificada: backups/$($backupState.id)"
        return
      }
    }
    Start-Sleep -Seconds 2
  }
  throw 'La copia no se completó dentro del tiempo esperado. Revisa docker compose logs backup; el servicio mantiene sus reintentos automáticos.'
} finally {Pop-Location}
