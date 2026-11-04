import { ALICUOTAS_IVA, formatIva } from '@moldeados/shared/base';
import { Campo, Entrada, Opciones } from '../ui';

export interface DatosFactura { conFactura: boolean | null; nroFactura: string; ivaBp: number }

/** Paso "¿vino con factura?" — compartido por pesaje y compras. */
export function PasoFactura({ v, set }: { v: DatosFactura; set: (v: DatosFactura) => void }) {
  return (
    <>
      <Opciones
        columnas
        valor={v.conFactura}
        onChange={(conFactura) => set({ ...v, conFactura, ivaBp: conFactura ? (v.ivaBp || 2100) : 0 })}
        opciones={[
          { valor: true, titulo: 'Con factura', detalle: 'Se registra en blanco' },
          { valor: false, titulo: 'Sin factura', detalle: 'Se registra en negro' },
        ]}
      />
      {v.conFactura && (
        <>
          <Campo etiqueta="Número de factura" ayuda="Opcional. Ej.: A 0003-00012345">
            <Entrada value={v.nroFactura} onChange={(e) => set({ ...v, nroFactura: e.target.value })} />
          </Campo>
          <Campo etiqueta="IVA">
            <Opciones columnas valor={v.ivaBp} onChange={(ivaBp) => set({ ...v, ivaBp })} opciones={ALICUOTAS_IVA.map((a) => ({ valor: a, titulo: formatIva(a) }))} />
          </Campo>
        </>
      )}
    </>
  );
}

export const facturaLista = (v: DatosFactura) => (v.conFactura === null ? 'Elegí si vino con factura o sin factura' : true);
export const facturaBody = (v: DatosFactura) => ({ conFactura: v.conFactura === true, nroFactura: v.nroFactura || undefined, ivaBp: v.conFactura ? v.ivaBp : 0 });
