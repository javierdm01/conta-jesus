#!/usr/bin/env bash
# Actualiza la aplicación con el código nuevo ya copiado a esta carpeta: copia de seguridad, build, migración y comprobación.
#   bash scripts/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

before=$(cat backups/status.json 2>/dev/null || true)
echo "Solicitando copia previa…"
docker compose restart backup >/dev/null
for _ in $(seq 1 120); do
  now=$(cat backups/status.json 2>/dev/null || true)
  [ -n "$now" ] && [ "$now" != "$before" ] && break
  sleep 5
done
[ -n "${now:-}" ] && [ "${now:-}" != "$before" ] || { echo "No se completó la copia previa; no se actualiza."; exit 1; }
echo "Copia previa: $now"

docker compose build web
docker compose up -d --no-build
echo -n "Comprobando"
for _ in $(seq 1 60); do
  state=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q web)" 2>/dev/null || echo starting)
  [ "$state" = "healthy" ] && break
  echo -n "."; sleep 5
done
echo
[ "$state" = "healthy" ] || { echo "Algo falló. Revisa: docker compose logs --tail 100 web migrate. Para volver atrás restaura la copia previa (docs/INSTALACION.md)."; exit 1; }
docker compose ps
echo "Actualización completada."
