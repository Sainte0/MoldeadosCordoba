import { describe, expect, it } from 'vitest';
import { estadoStock } from '@moldeados/shared';

describe('estado del stock', () => {
  const base = { unidad: 'l' as const, stockMinimo: 0, diasAviso: 7 };
  it('nunca muestra negativo: lo dice como falta de compra', () => {
    const e = estadoStock({ ...base, stock: -12_500, dias: 0 });
    expect([e.nivel, e.stockVisible, e.titulo]).toEqual(['critico', 0, 'Sin stock cargado']);
    expect(e.detalle).toContain('12,5 L más');
  });
  it('niveles: se acaba ya (≤ 2 días) / queda poco (≤ aviso o bajo mínimo) / hay stock', () => {
    expect(estadoStock({ ...base, stock: 5000, dias: 1 }).nivel).toBe('critico');
    expect(estadoStock({ ...base, stock: 5000, dias: 6 }).nivel).toBe('atencion');
    expect(estadoStock({ ...base, stock: 5000, stockMinimo: 10_000, dias: null }).nivel).toBe('atencion');
    expect(estadoStock({ ...base, stock: 5000, dias: 20 })).toMatchObject({ nivel: 'ok', detalle: 'Alcanza para 20 días.' });
  });
});
