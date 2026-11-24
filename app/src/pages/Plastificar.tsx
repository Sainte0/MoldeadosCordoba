import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Printer } from 'lucide-react';
import { ALTOS_PALET, PALET_DEFAULT } from '@moldeados/shared/base';
import { api, nroTicket } from '../api';
import { useVariantes } from '../datos';
import { Muestra } from '../MapleVista';
import { Aviso, Cabecera, Cargando } from '../ui';
import { EtiquetaPalet } from './PaletDetalle';

// Tablet de la plastificadora: terminó un pallet → tamaño, color, alto, Confirmar. Botones grandes, nada para tipear.
// Al confirmar entra al stock y se imprime la etiqueta con el QR. La elección queda puesta para el pallet siguiente.

const POR_CAMADA = PALET_DEFAULT.ancho * PALET_DEFAULT.largo;

export interface StockPallet { varianteId: string; codigo: string; nombre: string; colorHex: string | null; maplesPorPaquete: number; alto: number; pallets: number; paquetes: number; enCarga: number }
export const useStockPallets = (enabled = true) => useQuery({ queryKey: ['stock-palets'], queryFn: () => api<StockPallet[]>('/stock-palets'), enabled });

export function Plastificar() {
  const qc = useQueryClient();
  const { data: variantes, isLoading } = useVariantes();
  const [tamano, setTamano] = useState<'chico' | 'grande' | null>(null);
  const [color, setColor] = useState<string | null>(null); // clave del color: '' = natural
  const [alto, setAlto] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<{ numero: number; codigo: string; variante: string; colorHex: string | null; alto: number; paquetes: number; maplesPorPaquete: number; armadoAt: string; imprimir: boolean } | null>(null);

  if (isLoading) return <Cargando />;
  const activas = (variantes ?? []).filter((v) => v.activo);
  const colores = [...new Map(activas.filter((v) => v.tamano === tamano).map((v) => [v.color ?? '', v])).values()];
  const variante = activas.find((v) => v.tamano === tamano && (v.color ?? '') === color);
  const paquetes = alto ? POR_CAMADA * alto : 0;

  const confirmar = async () => {
    if (!variante || !alto) return;
    setError(null); setGuardando(true);
    try {
      const p = await api<{ id: string; numero: number }>('/palets/plastificado', { method: 'POST', body: { varianteId: variante.id, alto } });
      setUltimo({ numero: p.numero, codigo: variante.codigo, variante: variante.nombre, colorHex: variante.colorHex, alto, paquetes, maplesPorPaquete: variante.maplesPorPaquete, armadoAt: new Date().toISOString(), imprimir: true });
      void qc.invalidateQueries({ queryKey: ['stock-palets'] });
      void qc.invalidateQueries({ queryKey: ['palets'] });
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar el pallet'); }
    setGuardando(false);
  };

  return (
    <div className="ancho plastificar solo-etiqueta">
      <style>{'@media print { @page { size: 100mm 150mm; margin: 4mm; } }'}</style>
      <Cabecera titulo="Pallet terminado" bajada="Tocá tamaño, color y alto, y confirmá. Entra al stock y sale la etiqueta." />

      <section className="tecla-grupo" aria-label="Tamaño">
        <h3>1 · Tamaño</h3>
        <div className="teclas">
          {(['chico', 'grande'] as const).map((t) => (
            <button key={t} type="button" className="tecla" aria-pressed={tamano === t} onClick={() => { setTamano(t); setColor(null); }}>{t === 'chico' ? 'Chico' : 'Grande'}</button>
          ))}
        </div>
      </section>

      <section className="tecla-grupo" aria-label="Color">
        <h3>2 · Color</h3>
        <div className="teclas">
          {tamano ? colores.map((v) => (
            <button key={v.color ?? ''} type="button" className="tecla" aria-pressed={color === (v.color ?? '')} onClick={() => setColor(v.color ?? '')}>
              <Muestra color={v.colorHex} grande /> {v.color ?? 'Natural'}
            </button>
          )) : <p className="tenue">Primero el tamaño.</p>}
        </div>
      </section>

      <section className="tecla-grupo" aria-label="Alto">
        <h3>3 · Alto</h3>
        <div className="teclas cuatro">
          {ALTOS_PALET.map((a) => <button key={a} type="button" className="tecla numero" aria-pressed={alto === a} onClick={() => setAlto(a)}>{a}</button>)}
        </div>
      </section>

      <Aviso>{error}</Aviso>
      <button type="button" className="boton primario tecla-confirmar" disabled={!variante || !alto || guardando} onClick={confirmar}>
        {guardando ? 'Cargando…' : variante && alto ? `4 · Confirmar ${variante.codigo} de ${alto} (${(paquetes * variante.maplesPorPaquete).toLocaleString('es-AR')} maples)` : '4 · Confirmar'}
      </button>

      {ultimo && (
        <section className="hoja relleno ultimo-pallet">
          <div className="aviso ok" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <CheckCircle2 size={22} aria-hidden /> Pallet {nroTicket(ultimo.numero)} en stock: {ultimo.codigo} de {ultimo.alto}.
          </div>
          <div className="acciones">
            <button type="button" className="boton secundario" onClick={() => window.print()}><Printer size={18} aria-hidden /> Reimprimir etiqueta</button>
            <Link to={`/palets/${ultimo.numero}`} className="boton fantasma">Ver pallet</Link>
          </div>
        </section>
      )}
      {/* Solo se ve al imprimir: la etiqueta del último pallet (se imprime sola apenas está el QR). */}
      {ultimo && (
        <div className="etiqueta-al-pie solo-impresion">
          <EtiquetaPalet p={ultimo} onLista={() => { if (ultimo.imprimir) { setUltimo({ ...ultimo, imprimir: false }); setTimeout(() => window.print(), 50); } }} />
        </div>
      )}
    </div>
  );
}

/** "MCH-ROJ: 12 pallets de 7 y 3 de 6" — el stock por tipo y alto. */
export function textoStock(filas: StockPallet[]): string {
  return filas.map((f, i) => `${f.pallets}${i === 0 ? (f.pallets === 1 ? ' pallet' : ' pallets') : ''} de ${f.alto}`).join(', ').replace(/, ([^,]*)$/, ' y $1');
}

export function porMaple(stock: StockPallet[]) {
  const m = new Map<string, StockPallet[]>();
  for (const s of stock) m.set(s.varianteId, [...(m.get(s.varianteId) ?? []), s]);
  return [...m.values()];
}
