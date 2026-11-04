import type { Knex } from 'knex';

/**
 * Las pantallas de detalle usan el número que se ve en papel (/palets/12, /ventas/9) en vez del id interno. Las
 * rutas aceptan los dos: el número, y el id largo de los enlaces viejos y de los QR ya pegados en palets.
 */
export async function idPorNumero(db: Knex, tabla: 'palets' | 'partes' | 'ventas' | 'compras' | 'pedidos', param: string): Promise<string> {
  if (!/^\d{1,12}$/.test(param)) return param;
  const fila = await db(tabla).where({ numero: Number(param) }).first('id');
  return (fila?.id as string | undefined) ?? '';
}
