#!/bin/bash
# Obtener IP local para acceso remoto

IP=$(hostname -I | awk '{print $1}')

if [ -n "$IP" ]; then
    echo "Tu IP local es: $IP"
    echo ""
    echo "Para acceder desde otro dispositivo:"
    echo "  1. En .env, cambia BETTER_AUTH_URL a: http://$IP:3000"
    echo "  2. Ejecuta: npm run dev"
    echo "  3. Desde otro dispositivo, abre: http://$IP:3000"
    echo ""
    echo "Nota: Los dispositivos deben estar en la misma red local."
else
    echo "No se pudo detectar la IP local. Ejecuta 'ifconfig' o 'ip addr'."
fi
