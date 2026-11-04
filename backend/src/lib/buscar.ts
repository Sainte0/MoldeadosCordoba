import type { Knex } from 'knex';

/**
 * Filtro de texto libre para listados: cada palabra tiene que aparecer en alguna de las columnas (sin importar
 * mayúsculas ni acentos). Si la búsqueda es un número, también encuentra por número de comprobante.
 * ponytail: ILIKE con unaccent sobre listados paginados; si una tabla pasa los cientos de miles, índice trigram.
 */
export function buscar(q: string | undefined, columnas: string[], numero?: string) {
  return (qb: Knex.QueryBuilder) => {
    const texto = q?.trim().slice(0, 80);
    if (!texto) return;
    const n = /^\d{1,9}$/.test(texto) ? Number(texto) : null;
    // Un número corto es un n.º de comprobante, no un pedazo de teléfono o CUIT ("1" no trae a todos).
    const soloNumero = n !== null && texto.length < 4;
    qb.where((w) => {
      if (n !== null && numero) w.orWhere(numero, n);
      if (soloNumero) { if (!numero) w.whereRaw('false'); return; }
      w.orWhere((todas) => {
        for (const palabra of texto.split(/\s+/)) {
          const like = `%${palabra.replace(/[%_\\]/g, '\\$&')}%`;
          // Números (teléfono, CUIT): se comparan solo los dígitos, así "5551234" encuentra "0351 15 555-1234".
          const digitos = /^\d{4,}$/.test(palabra);
          todas.andWhere((alguna) => {
            for (const c of columnas) {
              if (digitos) alguna.orWhereRaw(`regexp_replace(coalesce(${c}::text, ''), '\\D', '', 'g') like ?`, [`%${palabra}%`]);
              else alguna.orWhereRaw(`unaccent(coalesce(${c}::text, '')) ilike unaccent(?)`, [like]);
            }
          });
        }
      });
    });
  };
}
