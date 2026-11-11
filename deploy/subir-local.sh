#!/usr/bin/env bash
#
# subir-local.sh — REEMPLAZA la base de producción por la de tu local (moldeados_dev). Solo para el arranque
# (MVP): lo que haya en prod se pierde, salvo el backup que se hace antes. Lo corre Stefano desde su Mac:
#
#   bash deploy/subir-local.sh
#
# Después se entra con el mismo usuario y contraseña que en el local.
set -euo pipefail
VPS="${VPS:-hassuru-vps}"
ARCHIVO="moldeados-local-$(date +%F_%H%M).dump"

echo "==> exportando moldeados_dev"
pg_dump -Fc --no-owner --no-acl moldeados_dev -f "/tmp/$ARCHIVO"

echo "==> subiendo al servidor"
scp -q "/tmp/$ARCHIVO" "$VPS:/tmp/$ARCHIVO"

ssh "$VPS" "ARCHIVO=$ARCHIVO bash -s" <<'REMOTO'
set -euo pipefail
cd /home/deploy/repos/MoldeadosCordoba/deploy
echo "==> backup de lo que hay en prod"
sudo -u deploy bash backup.sh pre-deploy
echo "==> frenando el backend (que nadie escriba mientras tanto)"
docker stop moldeados-backend >/dev/null
docker cp "/tmp/$ARCHIVO" moldeados-db:/tmp/local.dump
echo "==> reemplazando la base"
docker exec moldeados-db dropdb -U moldeados_app --force moldeados
docker exec moldeados-db createdb -U moldeados_app moldeados
docker exec moldeados-db pg_restore -U moldeados_app -d moldeados --no-owner --no-acl /tmp/local.dump
docker exec moldeados-db rm /tmp/local.dump
rm "/tmp/$ARCHIVO"
echo "==> levantando el backend"
docker start moldeados-backend >/dev/null
for _ in $(seq 1 30); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' moldeados-backend)" = healthy ] && break; sleep 3
done
docker exec moldeados-db psql -U moldeados_app -d moldeados -Atc "select 'ventas ' || count(*) from ventas union all select 'clientes ' || count(*) from clientes union all select 'egresos ' || count(*) from gastos union all select 'usuarios: ' || string_agg(usuario, ', ') from usuarios"
echo "==> listo: $(docker inspect -f '{{.State.Health.Status}}' moldeados-backend)"
REMOTO
rm "/tmp/$ARCHIVO"
