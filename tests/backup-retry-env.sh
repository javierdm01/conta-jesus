# Solo para la prueba aislada con /backups en tmpfs; no usar en el servicio real.
pg_isready() { return 1; }
sleep() { :; }
wait() {
  if [ "$delay" = "300" ] && [ -s /backups/failure.json ]; then
    echo "OK backup: servidor no disponible, fallo registrado y reintento en 300 segundos."
    exit 0
  fi
  echo "ERROR: el fallo de copia no programa el reintento esperado."
  exit 1
}
