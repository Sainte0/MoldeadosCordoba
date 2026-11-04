# Deploy de Moldeados Córdoba

Mismo VPS y mismo esquema que Centrolab y Hassuru Consignación: Docker Compose detrás del Traefik de Coolify
(red `coolify`). Tres contenedores: `moldeados-db` (Postgres 17), `moldeados-backend` (API, puerto 4800) y
`moldeados-frontend` (nginx con la app). Traefik manda `/api` al backend y el resto al frontend: un solo origen.

**HTTPS es obligatorio**: sin certificado el iPhone no da la cámara para escanear los QR de los palets. Por eso hay
dos direcciones: `DOMINIO_SSLIP` (sslip.io, con HTTPS desde el primer minuto, sin tocar ningún DNS) y `DOMINIO`
(la definitiva, cuando el cliente apunte el registro A al VPS; el certificado sale solo).

## Primera vez (lo corre Stefano en el VPS, como `deploy`)

1. Clonar: `git clone git@github.com:Sainte0/MoldeadosCordoba.git /home/deploy/repos/MoldeadosCordoba`
2. Configurar:
   ```bash
   cd /home/deploy/repos/MoldeadosCordoba/deploy
   cp env.example .env && chmod 600 .env                     # DB_PASS, DOMINIO_SSLIP (IP del VPS), DOMINIO
   cp backend.env.example backend.env && chmod 600 backend.env # misma DB_PASS en DATABASE_URL, JWT_SECRET
   ```
   Verificar la IP del VPS en `DOMINIO_SSLIP` (`curl -s ifconfig.me`).
3. Levantar: `bash update.sh` (construye, migra y espera a que todo quede healthy).
4. Crear el usuario del dueño:
   `docker exec -it moldeados-backend pnpm crear-usuario <usuario> <contraseña> "<Nombre>" dueno`
5. Datos de arranque (máquinas MP-1/MP-2, 4 códigos de maple, materias primas):
   `docker exec moldeados-backend pnpm seed:base` (solo carga lo que falta; no pisa nada).
6. Backup diario: `crontab -e` y agregar la línea que está al principio de `backup.sh`.
   Probarlo una vez: `bash backup.sh` → tiene que decir `backup ok`.
   Fuera del servidor (recomendado): instalar rclone, configurar un remoto (R2, Drive…) y poner
   `RCLONE_DESTINO=remoto:carpeta` en la línea del cron.
7. Deploy automático: en GitHub, secrets `VPS_HOST`, `VPS_USER` (`deploy`), `VPS_SSH_KEY` (la misma clave que usa
   Centrolab sirve) y la variable `DEPLOY_ACTIVO = true`. Desde ahí, cada push a `main` con CI verde se publica solo.

## Dominio definitivo
Pedirle a quien maneja el DNS de `moldeadoscordoba.com.ar` un registro **A** `sistema` → IP del VPS (si usan
Cloudflare, en modo "solo DNS" hasta que salga el certificado). No toca su web. Traefik pide el certificado solo.

## Día a día
- Logs: `docker compose logs --tail=100 backend`
- Restaurar un backup: ver el comentario de `backup.sh`. Hacerlo primero en una base de prueba.
- Antes de cada deploy, `update.sh` guarda un backup en `backups/moldeados/pre-deploy` (los últimos 10).
