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

Próximo: Corte 3 (clientes, ventas por palet, cobros, cuentas corrientes, pagos con cheque/e-cheq).
