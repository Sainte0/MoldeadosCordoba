// Benchmark de consultas con volumen (SOLO contra moldeados_test). Uso: DATABASE_URL=...moldeados_test tsx src/scripts/bench.ts [--sembrar]
import { db } from '../db.js';
import { tablero } from '../features/gastos.service.js';
import { costosYMargen, materiasPorAcabarse, recompra } from '../features/avisos.service.js';
import { stockMaples, trazabilidad } from '../features/produccion.service.js';
import { saldos } from '../features/ventas.service.js';
import { horasPorPersona, maquinasConService } from '../features/produccion.service.js';
import { armarResumen } from '../features/resumen.js';

if (!/moldeados_test/.test(process.env.DATABASE_URL ?? '')) throw new Error('El benchmark solo corre contra moldeados_test');

async function sembrar(): Promise<void> {
  await db.raw('truncate solicitudes_idempotentes, servicios_maquina, saldos_iniciales, pedido_items, pedidos, caja_movimientos, gastos, archivos, movimientos_dinero, venta_items, ventas, precios_cliente, clientes, palet_lotes, palets, parte_consumos, parte_empleados, partes, receta_items, variantes, maquinas, empleados, movimientos_stock, compra_items, compras, materias_primas, proveedores, auditoria, usuarios cascade');
  await db.raw(`
    insert into usuarios (nombre, usuario, password_hash, rol) values ('Bench', 'bench', 'x', 'dueno');
    insert into proveedores (nombre) select 'Proveedor ' || g from generate_series(1, 40) g;
    insert into clientes (nombre, telefono) select 'Cliente ' || g, '351' || (5000000 + g) from generate_series(1, 300) g;
    insert into materias_primas (nombre, tipo, unidad) values ('Cartón', 'carton', 'kg'), ('Tinta', 'tinta', 'l'), ('Aglutinante', 'aglutinante', 'l');
    insert into maquinas (codigo, nombre) values ('MP-1', 'Chica'), ('MP-2', 'Grande');
    insert into variantes (codigo, nombre, tamano, maquina_id, maples_por_hora) select c, c, 'grande', (select id from maquinas limit 1), 3000 from unnest(array['MGR-NAT','MGR-ROJ','MCH-NAT','MCH-ROJ']) c;
    insert into empleados (nombre) select 'Operario ' || g from generate_series(1, 20) g;`);
  const u = (await db('usuarios').first('id')).id;
  for (const s of [
    `insert into compras (tipo, proveedor_id, fecha, con_factura, neto_centavos, iva_centavos, total_centavos, usuario_id)
      select 'compra', (select id from proveedores offset (g % 40) limit 1), current_date - (g % 900), g % 2 = 0, 100000, 0, 100000, ? from generate_series(1, 10000) g`,
    `insert into compra_items (compra_id, materia_prima_id, cantidad, precio_unitario_centavos, subtotal_centavos)
      select c.id, m.id, 500000, 10000, 5000000 from compras c cross join lateral (select id from materias_primas order by random() limit 1) m`,
    `insert into partes (fecha, turno, maquina_id, variante_id, minutos, paquetes, maples_por_paquete, maples_por_hora, usuario_id)
      select current_date - (g % 900), case when g % 2 = 0 then 'manana' else 'tarde' end, (select id from maquinas limit 1), (select id from variantes offset (g % 4) limit 1), 450, 300, 60, 3000, ? from generate_series(1, 20000) g`,
    `insert into parte_consumos (parte_id, materia_prima_id, teorico, real) select p.id, m.id, 1000, 1000 from partes p cross join materias_primas m`,
    `insert into parte_empleados (parte_id, empleado_id) select p.id, (select id from empleados limit 1) from partes p`,
    `insert into ventas (cliente_id, fecha, con_factura, neto_centavos, iva_centavos, total_centavos, usuario_id)
      select (select id from clientes offset (g % 300) limit 1), current_date - (g % 900), false, 3000000, 0, 3000000, ? from generate_series(1, 5000) g`,
    `insert into palets (variante_id, ancho, largo, alto, paquetes, usuario_id, venta_id)
      select (select id from variantes limit 1), 2, 3, 6, 36, ?, v.id from ventas v`,
    `insert into venta_items (venta_id, palet_id, variante_id, maples, precio_maple_centavos, subtotal_centavos)
      select pa.venta_id, pa.id, pa.variante_id, 2160, 15000, 32400000 from palets pa`,
    `insert into palet_lotes (palet_id, parte_id, paquetes) select pa.id, pt.id, 36 from (select id, row_number() over () as n from palets) pa join (select id, row_number() over () as n from partes) pt on pt.n = pa.n`,
    `insert into movimientos_dinero (tipo, cliente_id, fecha, monto_centavos, medio, usuario_id)
      select 'cobro', v.cliente_id, v.fecha, 1000000, 'efectivo', ? from ventas v`,
    `insert into pedidos (cliente_id, fecha_entrega, estado, usuario_id) select (select id from clientes offset (g % 300) limit 1), current_date + (g % 30) - 15, case when g % 3 = 0 then 'abierto' else 'entregado' end, ? from generate_series(1, 3000) g`,
    `insert into pedido_items (pedido_id, variante_id, paquetes) select p.id, (select id from variantes limit 1), 72 from pedidos p`,
    `update ventas set pedido_id = (select id from pedidos order by id offset (abs(hashtext(ventas.id::text)) % 3000) limit 1) where random() < 0.5`,
    `insert into saldos_iniciales (cliente_id, fecha, monto_centavos, usuario_id) select id, current_date - 900, 1000000, ? from clientes`,
    `insert into parte_empleados (parte_id, empleado_id) select p.id, e.id from partes p cross join lateral (select id from empleados offset 1 limit 2) e`,
    `analyze`,
  ]) await db.raw(s, Array((s.match(/\?/g) ?? []).length).fill(u));
}

async function medir(nombre: string, f: () => Promise<unknown>): Promise<void> {
  await f(); // en caliente
  const t = performance.now();
  for (let i = 0; i < 3; i++) await f();
  console.log(`${nombre.padEnd(28)} ${((performance.now() - t) / 3).toFixed(1)} ms`);
}

if (process.argv.includes('--sembrar')) await sembrar();
const hoy = new Date().toISOString().slice(0, 10);
const palet = (await db('palets').first('id')).id;
await medir('tablero (mes)', () => tablero(db, hoy.slice(0, 8) + '01', hoy));
await medir('tablero (año)', () => tablero(db, hoy.slice(0, 5) + '01-01', hoy));
await medir('costos y margen (año)', () => costosYMargen(db, hoy.slice(0, 5) + '01-01', hoy));
await medir('recompra', () => recompra(db, hoy));
await medir('materias por acabarse', () => materiasPorAcabarse(db));
await medir('stock de maples', () => stockMaples(db));
await medir('saldos clientes', () => saldos(db, 'cliente'));
await medir('trazabilidad de un palet', () => trazabilidad(db, palet));
await medir('pedidos abiertos (listado)', () => db.raw(`select p.id, coalesce((select sum(pa.paquetes) from palets pa join ventas ve on ve.id = pa.venta_id where ve.pedido_id = p.id and ve.anulado_at is null), 0)
  from pedidos p where p.estado = 'abierto'`));
await medir('máquinas con service', () => maquinasConService(db));
await medir('horas por persona (mes)', () => horasPorPersona(db, hoy.slice(0, 8) + '01', hoy));
await medir('resumen del día', () => armarResumen(db, hoy));
await db.destroy();
