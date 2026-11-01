#!/bin/bash
set -euo pipefail
umask 077
mkdir -p /backups
backup_once() {
  for attempt in $(seq 1 30); do
    if pg_isready -q; then break; fi
    sleep 2
  done
  pg_isready -q || return 1
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="/backups/$stamp"
  mkdir "$target.partial" || return 1
  # Los archivos son inmutables y se escriben antes del commit de su registro.
  # Los documentos subidos tras pg_dump son archivos extra inocuos en esta copia.
  pg_dump --format=custom --file="$target.partial/database.dump" || return 1
  tar -czf "$target.partial/documents.tar.gz" -C /documents . || return 1
  (cd "$target.partial" && sha256sum database.dump documents.tar.gz > SHA256SUMS) || return 1
  (cd "$target.partial" && sha256sum -c SHA256SUMS) || return 1
  mv "$target.partial" "$target" || return 1
  printf '{"id":"%s","completedAt":"%s","integrityVerified":true}\n' "$stamp" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /backups/status.json.tmp || return 1
  chmod 644 /backups/status.json.tmp || return 1
  mv /backups/status.json.tmp /backups/status.json || return 1
  rm -f /backups/failure.json
  echo "Copia completada: $stamp"
  prune_old || echo "Aviso: no se pudo aplicar la retención de copias" >&2
}
# Retención opcional: BACKUP_KEEP_DAYS>0 borra copias completas más antiguas, conservando siempre las 7 más recientes.
prune_old() {
  local days="${BACKUP_KEEP_DAYS:-0}"
  [[ "$days" =~ ^[0-9]+$ ]] && [ "$days" -gt 0 ] || return 0
  local cutoff; cutoff=$(date -u -d "-$days days" +%Y%m%dT%H%M%SZ)
  ls -1 /backups | grep -E '^[0-9]{8}T[0-9]{6}Z$' | sort -r | tail -n +8 | while read -r old; do
    if [[ "$old" < "$cutoff" ]]; then rm -rf "/backups/$old"; echo "Copia antigua eliminada: $old"; fi
  done
}
while true; do
  if backup_once; then
    delay=86400
  else
    echo "ERROR: copia incompleta; se reintentará en cinco minutos" >&2
    printf '{"failedAt":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /backups/failure.json.tmp
    chmod 644 /backups/failure.json.tmp
    mv /backups/failure.json.tmp /backups/failure.json
    delay=300
  fi
  sleep "$delay" & wait $!
done
