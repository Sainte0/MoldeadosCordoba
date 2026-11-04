import { CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react';
import type { Nivel3 } from '@moldeados/shared/base';

const ICONO = { critico: OctagonAlert, atencion: TriangleAlert, ok: CircleCheck } as const;

/** Etiqueta de estado con color e ícono (el color nunca va solo: ícono + texto). Rojo = ya, ámbar = pronto, verde = bien. */
export function Estado({ nivel, children }: { nivel: Nivel3; children: React.ReactNode }) {
  const I = ICONO[nivel];
  return <span className={`estado estado-${nivel}`}><I size={14} aria-hidden />{children}</span>;
}
