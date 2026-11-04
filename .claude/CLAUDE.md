# Moldeados Córdoba — Reglas

ERP liviano para una fábrica de maples de huevo (Córdoba). Requerimientos: [`docs/00-requerimientos.md`](../docs/00-requerimientos.md).
**Mismo stack, convenciones y rigurosidad que Centrolab** (`~/Workspace/Centrolab/.claude/CLAUDE.md`):
ante una duda de estilo de código, DB o seguridad, vale lo que dice Centrolab.

## Filosofía
1. **Ultra simple de usar.** Lo usan operarios de planta desde el celular. Cada proceso es un **asistente
   paso a paso** (un dato por pantalla cuando haga falta), con su instructivo a la vista. Si necesita manual, fallamos.
2. **Todo trazable.** Toda escritura registra quién, cuándo y antes/después en `auditoria`. Nada se borra
   físico: se **anula** con motivo.
3. **Lo que no se usa, no se construye.** Se avanza por cortes (§12 de requerimientos).
4. **Argentina:** pesos en **centavos (integer)**, hora `America/Argentina/Buenos_Aires`, español rioplatense.

## Stack (igual a Centrolab)
TypeScript strict · Fastify · PostgreSQL + Knex · Zod · React + Vite · lucide-react · pnpm workspaces.
Paquetes: `backend` · `app` (panel único, mobile-first) · `shared`. Scope `@moldeados/*`.

**Puertos:** backend **4800** · app **4801** (bloque 48xx, libre en ~/Workspace).
**DB:** `moldeados_dev` (del dev, nunca se resetea) · `moldeados_test` (descartable). Prod: base `moldeados`, rol `moldeados_app`,
en el **mismo VPS que Centrolab y Hassuru**.

## Dominio de negocio (glosario)
- **Materia prima (MP):** cartón (kg), tinta por color (L), aglutinante/encolante (L).
- **Ticket de pesaje:** ingreso de cartón (bruto/tara/neto) → compra + stock + cta. cte. proveedor.
- **Compra** `con_factura` true/false (en blanco / en negro).
- **Variante de maple:** tamaño (chico MP-1 / grande MP-2) × color (natural o un color). Tiene código y **receta por hora**.
- **Parte de producción:** fecha + turno (mañana/tarde) + máquina + variante + horas + paquetes de 60.
- **Palet:** paquetes por palet = ancho × largo × alto (alto variable según vehículo).
- **Medios de pago:** efectivo, transferencia, Mercado Pago, e-cheq (banco), cheque físico (banco, nro., fecha de cobro).

## Diseño
- **Ultra simple (pedido explícito del cliente).** El menú tiene 5 áreas fijas — Planta, Ventas, Compras, Plata,
  Tablero — más Ajustes (configuración). Lo de adentro va en pestañas del área (`AREAS` en `app/src/App.tsx`).
  **Una función nueva entra en un área existente; nunca se agrega un ítem al menú.** El inicio muestra solo las 4
  tareas más frecuentes del rol.
- **Sistema visual prolijo:** fondo `#F3F4F6`, superficies blancas con borde fino y sombra mínima, un solo color de
  acción (azul del logo). Estado activo = fondo suave (pastilla), **nunca rayas de color a un costado**. Pestañas como
  control segmentado. El navy queda para login y visor 3D.
- **Ayuda:** toda función nueva lleva su guía en `app/src/guias.ts` (y, si es un proceso, su recorrido "Mostrame cómo" en `app/src/recorridos.ts`) (pasos cortos, `pantallas` donde aplica,
  `palabras` con las que la buscaría alguien de planta). Los procedimientos de la fábrica los escribe el cliente
  (tabla `procedimientos`). Todo listado nuevo con datos se suma a `CONJUNTOS` en `backend/src/features/exportar.ts`.
- **Filtros en la URL** (`useFiltros` en `app/src/filtros.ts`): todo listado guarda filtros y búsqueda en la
  dirección, para recargar o compartir. Búsqueda de texto con `buscar()` (`backend/src/lib/buscar.ts`, sin acentos,
  por número de comprobante). El buscador principal (`BuscadorGlobal`, ⌘K) usa `navegacion.ts` y `/api/buscar`.
- **Rendimiento:** pantallas con carga diferida (`lazy` en App.tsx); la app importa `@moldeados/shared/base`
  (sin Zod), nunca `@moldeados/shared`. Antes de tocar una consulta pesada, medirla con
  `DATABASE_URL=…/moldeados_test pnpm exec tsx src/scripts/bench.ts --sembrar` (volumen de años).
- **Importar:** cada tipo de planilla es una entrada en `TIPOS` de `backend/src/features/importar.ts` (campos con
  `parecidos` para proponer la columna). Reglas: probar sin guardar, todo o nada, reimportar no duplica.
- **Instructivos:** cada paso de asistente tiene su ayuda; el dueño la edita ahí mismo con el lápiz (`instructivos`,
  clave `proceso:título del paso`). Todo `<Asistente>` lleva `proceso`.
- **Marca del cliente:** logo (`app/public/logo.png`) y azul `#004FBC` de moldeadoscordoba.com.ar, azul marino
  `#0E1A30`, kraft `#A87B45` para material/stock, amarillo `#F2C230` para "paso actual / atención". Tipografía Archivo.
- El maple 3D (`app/src/Maple3D.tsx`) toma el `color_hex` de cada código de maple; sin color = cartón natural.
- **Identidad propia**, nada de componentes genéricos ni estética "hecha con IA". Componentes de UI propios
  (sin MUI/Bootstrap/shadcn). Usar el skill `frontend-design` al construir pantallas.
- Animación 3D del maple (Three.js) solo donde suma: login, etiqueta/QR, confirmaciones de producción. Nunca bloquea la carga.
- Sin emojis. Íconos lucide-react. Cero tecnicismos visibles (ni IDs, ni errores crudos).
- **Se usa sobre todo en iPhone y iPad** (planta y playón). Probar en esos tamaños: iPhone sin scroll horizontal,
  iPad vertical con menú lateral (corte a 760 px). Zonas seguras (`env(safe-area-inset-*)`), campos de 16 px o más
  (si no, iOS hace zoom), botones grandes. Instalable en inicio (manifest + apple-touch-icon).
- Escaneo de QR con la cámara: `app/src/Escaner.tsx` (jsQR, porque Safari no trae BarcodeDetector). Requiere HTTPS.

## Código y DB
Mismas reglas de oro que Centrolab §2.5 y §3: Zod en el borde, `route → service → repository`, uuid PK,
`created_at/updated_at/deleted_at`, FK `RESTRICT`, migraciones Knex, plata en centavos, cantidades de MP
en **gramos / mililitros (integer)**, nunca float. Tests (Vitest) solo en lo que duele: consumo teórico por
receta, saldos de cuenta corriente, armado de palet, permisos por rol.
