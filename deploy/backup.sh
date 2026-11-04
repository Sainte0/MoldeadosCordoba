#!/usr/bin/env bash
#
# backup.sh — copia completa de la base (incluye fotos de comprobantes, que viven en la base).
#
#   bash deploy/backup.sh            → backup diario (cron), guarda 14 días + uno por mes durante 12 meses
#   bash deploy/backup.sh pre-deploy → backup antes de un deploy (se guardan los últimos 10)
#
# Fuera del servidor: si RCLONE_DESTINO está definido (ej. "r2:moldeados-backups"), sube cada copia ahí.
# Cron del host (como el usuario deploy, todos los días 03:30 hora Argentina):
#   30 3 * * * TZ=America/Argentina/Buenos_Aires bash /home/deploy/repos/MoldeadosCordoba/deploy/backup.sh >> /home/deploy/moldeados-backup.log 2>&1
#
# Restaurar (sobre una base vacía):
#   docker exec -i moldeados-db pg_restore -U moldeados_app -d moldeados --clean --if-exists < ARCHIVO.dump
set -euo pipefail
export TZ=America/Argentina/Buenos_Aires
DIR="${BACKUP_DIR:-/home/deploy/backups/moldeados}"
TIPO="${1:-diario}"
mkdir -p "$DIR/diario" "$DIR/mensual" "$DIR/pre-deploy"

archivo="$DIR/$TIPO/moldeados-$(date +%F_%H%M).dump"
docker exec moldeados-db pg_dump -U moldeados_app -d moldeados -Fc > "$archivo.tmp"
# Verificación: un dump que pg_restore no puede leer no es un backup.
docker exec -i moldeados-db pg_restore --list < "$archivo.tmp" > /dev/null
mv "$archivo.tmp" "$archivo"
echo "$(date '+%F %T') backup ok: $archivo ($(du -h "$archivo" | cut -f1))"

if [ "$TIPO" = diario ]; then
  [ "$(date +%d)" = 01 ] && cp "$archivo" "$DIR/mensual/"
  find "$DIR/diario" -name '*.dump' -mtime +14 -delete
  find "$DIR/mensual" -name '*.dump' -mtime +370 -delete
else
  ls -1t "$DIR/pre-deploy"/*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f
fi

if [ -n "${RCLONE_DESTINO:-}" ] && command -v rclone >/dev/null; then
  rclone copy "$archivo" "$RCLONE_DESTINO/$TIPO/" && echo "  copiado fuera del servidor: $RCLONE_DESTINO/$TIPO/"
fi
