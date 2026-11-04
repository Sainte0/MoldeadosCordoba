#!/usr/bin/env bash
#
# update.sh — pone en el VPS la versión que está en main: git pull → build → up → espera healthy.
# Las migraciones las corre el backend al arrancar (si una falla, queda unhealthy y esto termina en rojo).
#
# Lo corre GitHub Actions por SSH (deploy.yml) o a mano:  bash /home/deploy/repos/MoldeadosCordoba/deploy/update.sh
# NO toca .env ni backend.env (cambios raros y sensibles → a mano).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

for f in .env backend.env; do
  [ -f "$f" ] || { echo "Falta deploy/$f (ver ${f%.env}env.example / backend.env.example)"; exit 1; }
done

# Backup antes de tocar nada: si una migración sale mal, se vuelve a esto.
if docker ps --format '{{.Names}}' | grep -q '^moldeados-db$'; then
  log "backup previo al deploy"
  bash "$SCRIPT_DIR/backup.sh" pre-deploy
fi

log "git pull"
git -C .. pull --ff-only

log "build + up"
docker compose up -d --build

log "esperando a que los contenedores queden healthy"
for _ in $(seq 1 60); do
  estado="$(docker compose ps --format '{{.Service}}:{{.Health}}' | tr '\n' ' ')"
  case "$estado" in *unhealthy*) echo "$estado"; echo "Algún contenedor quedó unhealthy: docker compose logs --tail=80 backend"; exit 1 ;; esac
  if ! echo "$estado" | grep -q starting; then
    printf '\033[1;32m  ok\033[0m %s\n  Deploy completo: %s\n' "$estado" "$(git -C .. rev-parse --short HEAD)"
    exit 0
  fi
  sleep 5
done
echo "Se acabó la espera; revisá: docker compose logs --tail=80"
exit 1
