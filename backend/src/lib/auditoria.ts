import type { Knex } from 'knex';

export interface Evento {
  usuarioId: string;
  accion: 'crear' | 'editar' | 'anular' | 'borrar' | 'ajustar' | 'login';
  entidad: 'compra' | 'proveedor' | 'materia_prima' | 'usuario' | 'permiso' | 'maquina' | 'variante' | 'empleado' | 'parte' | 'palet' | 'empresa' | 'cliente' | 'venta' | 'cobro' | 'pago' | 'precio' | 'banco';
  entidadId?: string | null;
  antes?: unknown;
  despues?: unknown;
  motivo?: string | null;
}

/** Registra quién hizo qué. Se llama con la misma transacción que el cambio: o quedan los dos o ninguno. */
export async function auditar(db: Knex, e: Evento): Promise<void> {
  await db('auditoria').insert({
    usuario_id: e.usuarioId,
    accion: e.accion,
    entidad: e.entidad,
    entidad_id: e.entidadId ?? null,
    antes: e.antes === undefined ? null : JSON.stringify(e.antes),
    despues: e.despues === undefined ? null : JSON.stringify(e.despues),
    motivo: e.motivo ?? null,
  });
}
