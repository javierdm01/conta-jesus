#!/usr/bin/env bash
# Ejecución semanal sin IA. También puede lanzarse manualmente.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
umask 077
exchange='data/automation/sonepar'
portal="$exchange/portal"
mkdir -p "$portal/runs"
exec 9>"$portal/scheduler.lock"
flock -n 9 || { echo 'Sonepar: ya hay una ejecución en curso'; exit 0; }
trap 'echo "Sonepar: ejecución detenida en la línea $LINENO; revisa el resumen y renueva la sesión si es necesario" >&2' ERR
npm run sonepar:portal -- extract --input "$exchange/catalago_sonepar.json" --output "$portal/resultado-rico.json" --interval-ms "${SONEPAR_INTERVAL_MS:-1000}" --resume
run_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
cp --update=none "$portal/resultado-rico.json" "$portal/runs/$run_stamp.json"
cp --update=none "$portal/resultado-rico.json.summary.json" "$portal/runs/$run_stamp.summary.json"
docker compose exec -T sonepar node --import tsx scripts/sonepar-portal-publish.ts /app/data/sonepar/portal/resultado-rico.json
# Facturas nuevas (PDF + stock) e imágenes de producto. Sin IA; si falla la descarga no se toca la base de datos.
node --import tsx scripts/sonepar-documents.ts
docker compose exec -T sonepar node --import tsx scripts/sonepar-import-documents.ts
node --import tsx scripts/sonepar-images.ts
docker compose exec -T sonepar node --import tsx scripts/sonepar-import-images.ts
