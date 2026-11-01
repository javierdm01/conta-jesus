#!/usr/bin/env bash
# Despliegue en un servidor Linux con Docker. Es idempotente: puede repetirse sin perder datos.
#   bash scripts/deploy.sh
# Variables opcionales (si no se indican se preguntan o se deducen):
#   SITE_ADDRESS  dominio o IP de acceso, sin https://   (p. ej. gestion.miempresa.es o 192.168.1.50)
#   TLS_MODE      internal (red local, CA propia)  |  public (dominio con DNS público, Let's Encrypt)
#   ADMIN_EMAIL, ADMIN_NAME, COMPANY_NAME   datos del primer responsable
set -euo pipefail
cd "$(dirname "$0")/.."

command -v docker >/dev/null || { echo "Instala Docker Engine primero: https://docs.docker.com/engine/install/"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Falta el complemento Docker Compose."; exit 1; }
command -v openssl >/dev/null || { echo "Falta openssl."; exit 1; }

ask() { # ask VAR "pregunta" "valor por defecto"
  local var="$1" prompt="$2" def="${3:-}" val
  if [ -n "${!var:-}" ]; then return; fi
  if [ -t 0 ]; then read -r -p "$prompt${def:+ [$def]}: " val || true; fi
  printf -v "$var" '%s' "${val:-$def}"
}

if [ ! -f .env ]; then
  lan_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  ask SITE_ADDRESS "Dominio o IP con la que se accederá (sin https://)" "$lan_ip"
  [ -n "$SITE_ADDRESS" ] || { echo "SITE_ADDRESS es obligatorio."; exit 1; }
  if [[ "$SITE_ADDRESS" =~ ^[0-9.]+$ || "$SITE_ADDRESS" == *.local || "$SITE_ADDRESS" != *.* ]]; then def_tls=internal; else def_tls=public; fi
  ask TLS_MODE "Certificado: internal (red local) o public (dominio público)" "$def_tls"
  ask ADMIN_EMAIL "Correo del responsable" "responsable@empresa.local"
  ask ADMIN_NAME "Nombre del responsable" "Responsable"
  ask COMPANY_NAME "Nombre de la empresa" "Mi empresa instaladora"
  caddy_tls=""; [ "$TLS_MODE" = "internal" ] && caddy_tls="tls internal"
  db_pass=$(openssl rand -hex 24); secret=$(openssl rand -hex 36); admin_pass=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)
  umask 077
  cat > .env <<EOF
COMPOSE_FILE=compose.yaml:compose.production.yaml
POSTGRES_PASSWORD=$db_pass
BETTER_AUTH_SECRET=$secret
BETTER_AUTH_URL=https://$SITE_ADDRESS
APP_TRUSTED_ORIGINS=
PORT_BIND=127.0.0.1
SITE_ADDRESS=$SITE_ADDRESS
CADDY_TLS=$caddy_tls
BACKUP_KEEP_DAYS=60
EOF
  mkdir -p data
  cat > data/ACCESO_INICIAL.txt <<EOF
INSTALA · ACCESO INICIAL

Dirección: https://$SITE_ADDRESS
Correo: $ADMIN_EMAIL
Contraseña: $admin_pass

Guarda la contraseña en un gestor de contraseñas y borra este archivo.
EOF
  # Datos del primer responsable: solo para el alta, no se guardan en .env.
  export ADMIN_EMAIL ADMIN_NAME COMPANY_NAME ADMIN_PASSWORD="$admin_pass"
  echo ".env creado con claves aleatorias (permisos 600)."
fi

mkdir -p backups
echo "Construyendo la aplicación…"
docker compose build web
echo "Arrancando servicios…"
docker compose up -d --no-build

echo -n "Esperando a que la aplicación responda"
for _ in $(seq 1 60); do
  state=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q web)" 2>/dev/null || echo starting)
  [ "$state" = "healthy" ] && break
  echo -n "."; sleep 5
done
echo
[ "$state" = "healthy" ] || { echo "La aplicación no llegó a estar sana. Revisa: docker compose logs web migrate"; exit 1; }

owners=$(docker compose exec -T web node scripts/owner-count.mjs)
if [ "$owners" = "0" ]; then
  if [ -z "${ADMIN_PASSWORD:-}" ]; then echo "No hay responsable y falta ADMIN_PASSWORD. Ver docs/DESPLIEGUE.md."; exit 1; fi
  docker compose exec -T -e ADMIN_EMAIL -e ADMIN_PASSWORD -e ADMIN_NAME -e COMPANY_NAME web npm run bootstrap
  echo "Credenciales iniciales en data/ACCESO_INICIAL.txt (léelas, guárdalas y borra el archivo)."
fi

source_addr=$(grep '^SITE_ADDRESS=' .env | cut -d= -f2-)
echo
echo "Listo: https://$source_addr"
if grep -q '^CADDY_TLS=tls internal' .env; then
  docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt 2>/dev/null \
    && echo "Certificado de la red local: ./caddy-root.crt (instálalo como CA de confianza en cada ordenador y móvil)."
fi
