# Moldeados Córdoba — Sistema de gestión

ERP liviano para la fábrica de maples de huevo: materia prima, pesaje, producción por turno, ventas
por palet, cuentas corrientes, gastos, dashboards y etiquetas QR.

- **Reglas:** [`.claude/CLAUDE.md`](.claude/CLAUDE.md)
- **Requerimientos, preguntas abiertas y roadmap:** [`docs/00-requerimientos.md`](docs/00-requerimientos.md)

Stack igual a Centrolab: TypeScript · Fastify · PostgreSQL + Knex · Zod · React + Vite. Puertos: API `4800` · app `4801`.

## Levantar en local

```bash
pnpm install
cp backend/.env.example backend/.env   # completar JWT_SECRET
pnpm db:init                            # crea moldeados_dev, migra y carga materias primas base
pnpm --filter @moldeados/backend crear-usuario <usuario> <contraseña> "<Nombre>" dueno
pnpm dev                                # API :4800 · app :4801
```

Antes de pushear: `pnpm typecheck && pnpm build && pnpm test` (tests contra `moldeados_test`).

## Estado

**Corte 1 (hecho):** login, roles y permisos editables, registro de cambios, proveedores, materia prima con stock
por movimientos, ticket de pesaje paso a paso con ticket imprimible, compras con o sin factura e IVA, anulación con motivo.

**Corte 2 (hecho):** máquinas, códigos de maple con color (el maple 3D se pinta con el color del código) y receta
por hora, personal de planta, parte de producción por turno (descuenta materia prima según receta, con corrección),
planilla productiva (rendimiento, paquetes/hora, consumo real contra receta), stock de maples, armado de palets
(toma paquetes de los partes más viejos) con etiqueta QR 100×150 mm y trazabilidad palet → partes → compras.
Marca del cliente (logo, azul #004FBC y datos de contacto) tomada de moldeadoscordoba.com.ar, editable en Equipo.

**Corte 3 (hecho):** despacho escaneando el QR de los palets con la cámara del iPhone/iPad (o eligiéndolos de la
lista): cliente, quién retira, vehículo, patente; los palets quedan vendidos y sale el remito para firmar. Lista de
precios por maple + precio especial por cliente, IVA opcional. Cobros y pagos (efectivo, transferencia, Mercado Pago,
e-cheq y cheque con banco, número y fecha de cobro), cheques por fecha, bancos editables y cuentas corrientes de
clientes y proveedores con saldo acumulado. La app se instala en la pantalla de inicio del iPhone/iPad (pantalla completa).

> La cámara del navegador solo funciona con HTTPS: en producción el dominio tiene que tener certificado.

**Corte 4 (hecho):** gastos por categoría (editables) con foto del comprobante sacada desde el iPhone (se achica a
~1600 px antes de subir), sueldos y adelantos por persona, con/sin factura. Caja chica: reposición, gastos que la
descuentan solos y arqueo (conteo con diferencia). Tablero del dueño por período: vendido, compras, gastos, resultado,
por cobrar/por pagar, caja, palets listos, alerta de materia prima bajo mínimo, gráfico de entradas y salidas
(paleta validada para daltonismo), rankings por cliente/proveedor/categoría, producción y consumo contra receta.

**Corte 5 (hecho):** instructivos editables en el mismo asistente (lápiz en el cuadro de ayuda, "volver al original").
Rediseño a pedido del cliente: menú de 5 áreas + Ajustes con pestañas, menú fijo, sistema visual sobrio (sin rayas
de color), revisado en iPhone, iPad mini, iPad 11 vertical/horizontal y notebook.

**Etapa 2, avisos inteligentes (hecho):** sin pantallas nuevas, el sistema avisa solo a partir de lo cargado:
- *Para vender*: aprende cada cuánto compra cada cliente y avisa "le toca comprar" / "dejó de comprar", con
  WhatsApp con el mensaje armado y "ya lo contacté" (se oculta una semana). En Inicio y en Clientes.
- *Hay que comprar*: para cuántos días alcanza cada materia prima según el consumo de los últimos 30 días; aviso
  configurable por materia prima. En Inicio y en Materia prima.
- *Costo y margen*: costo de materia prima por maple (precio promedio de compra × consumo real) y lo que deja
  cada código y cada cliente. En el Tablero.

**Ayuda y exportación (hecho):** centro de ayuda con buscador (sin acentos) que abre en las guías de la pantalla
donde estabas; 28 guías del sistema y procedimientos de planta editables (arranca con "Cómo se hace un maple de
huevo"); cada guía o el manual completo se imprime o guarda como PDF. Exportar a Excel (CSV para Excel en
castellano) desde cada listado, y todo junto en un .zip desde Ajustes › Exportar datos o desde el Tablero.

**Búsqueda, filtros y rendimiento (hecho):** buscador principal (⌘K / lupa) de secciones, acciones, guías y datos;
búsqueda sin acentos en cada listado; filtros guardados en la URL (se recargan y se comparten); sesión de 7 días
que se renueva sola. Bundle inicial de 643 KB a 52 KB de código propio + 206 KB de librerías cacheables; logo de
52 KB a 2 KB (WebP); tablero anual de 78 a 26 ms con datos de años; índices y un N+1 corregidos tras EXPLAIN.
Config de nginx con gzip y caché larga en `deploy/nginx.conf.example`.

**Agenda y avisos (hecho):** recordatorios para una persona, varias o todo el equipo, con hora y repetición
(diario, semanal, mensual); lo marca hecho uno y vale para todos; lo vencido sin hacer sale como "Atrasado". Campana
con avisos en vivo (stream de eventos con fetch, reconexión sola) para recordatorios que tocan, cosas que te agendaron
y pedidos nuevos; con la app cerrada llegan como notificación del teléfono (Web Push; claves VAPID generadas solas y
guardadas en la base; en iPhone requiere la app en la pantalla de inicio). Se entra desde Inicio y la campana, sin
sumar ítems al menú.

**Finanzas como su planilla (hecho):** ajustado a "FINANZAS MOLDEADOS 2.0": calidad primera/segunda en la venta (la
segunda, mismo stock, precio escrito en la venta); lo que paga en el momento, repartido por forma de pago; estado
Cobrado / Pendiente / Debe por venta (lo cobrado se aplica a lo más viejo); egresos con proveedor / beneficiario,
pendientes con vencimiento (avisan 3 días antes) y monto en US$; sus categorías; balance mensual con sus columnas;
próximo número de remito configurable; importadores de sus hojas VENTAS (sin palet, IVA separado en las A-…) y
EGRESOS; vocabulario de la planilla (Egresos, Saldos, Pago a cuenta, Observaciones, Registrado por).

**Importar planillas (hecho):** Ajustes › Importar planillas: clientes, proveedores, stock inicial, saldos iniciales
de clientes y proveedores, y precios. Lee .xlsx (sin dependencias: DecompressionStream + DOMParser) y CSV; detecta la
fila de títulos, propone columnas por nombre, prueba en seco con errores por n.º de fila del Excel, importa todo o
nada, y reimportar no duplica. Saldos iniciales nuevos en cuentas corrientes, tablero y exportación.

Próximo: deploy al VPS (pendiente: dominio con HTTPS). Ideas para más adelante: resumen automático al dueño por
WhatsApp/mail, cobranzas con recordatorio, service de máquinas por horas, consultas en lenguaje natural con IA.
