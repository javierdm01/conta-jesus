# Obtener IP local para acceso remoto
$ip = (Get-NetIPAddress -AddressFamily IPv4 -Type Unicast | Where-Object { $_.InterfaceAlias -notmatch 'Docker' } | Select-Object -First 1).IPAddress

if ($ip) {
    Write-Host "Tu IP local es: $ip"
    Write-Host ""
    Write-Host "Para acceder desde otro dispositivo:"
    Write-Host "  1. En .env, cambia BETTER_AUTH_URL a: http://$ip:3000"
    Write-Host "  2. Ejecuta: npm run dev"
    Write-Host "  3. Desde otro dispositivo, abre: http://$ip:3000"
    Write-Host ""
    Write-Host "Nota: Los dispositivos deben estar en la misma red local."
} else {
    Write-Host "No se pudo detectar la IP local. Ejecuta 'ipconfig' en PowerShell."
}
