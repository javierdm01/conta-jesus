#!/bin/bash
# Ejecutar en el servicio backup con web y worker detenidos. No elimina documentos existentes.
set -euo pipefail
if [ "${CONFIRM_RESTORE:-}" != "RESTAURAR" ]; then echo "Define CONFIRM_RESTORE=RESTAURAR y el directorio de copia como argumento."; exit 1; fi
source_dir=$(realpath "${1:?Indica /backups/FECHA}")
case "$source_dir" in /backups/*) ;; *) echo "La copia debe estar en /backups"; exit 1;; esac
cd "$source_dir"
sha256sum -c SHA256SUMS
pg_restore --clean --if-exists --no-owner --single-transaction -d "$PGDATABASE" database.dump
tar -xzf documents.tar.gz -C /documents
echo "Restauración completada. Reinicia web y worker."
